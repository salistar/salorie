# -*- coding: utf-8 -*-
"""Quel pretraitement ce modele attend-il reellement ?

CE QUE CE SCRIPT EXISTE POUR TRANCHER
Le sidecar mesure 0 bonne reponse sur 74 plats Food-101, alors que ces 101 plats
font partie de ses 172 classes. Deux explications possibles, et une seule facon
de les separer : donner au modele les MEMES images avec des pretraitements
differents, et regarder lequel produit de la justesse.

  - Si un pretraitement donne une bonne accuracy, le modele va bien et c'est le
    sidecar qui l'alimente mal. On corrige app.py.
  - Si AUCUN ne donne de justesse, le modele lui-meme est en cause, et le
    corriger demande de le reentrainer ou de le remplacer.

Ce que ce script ne fait PAS : deviner. Il essaie, et il compte.

Usage :  python diagnostic_pretraitement.py [nombre d images]
"""
import io
import json
import os
import sys

import numpy as np
import tensorflow as tf
from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(ICI, '..', 'corpus-ia')
N = int(sys.argv[1]) if len(sys.argv) > 1 else 60

classes = json.load(io.open(os.path.join(ICI, 'label_map_172.json'), encoding='utf-8'))['classes']
index = {c.lower(): i for i, c in enumerate(classes)}

it = tf.lite.Interpreter(model_path=os.path.join(ICI, 'food_salorie.tflite'))
it.allocate_tensors()
ENT, SOR = it.get_input_details()[0], it.get_output_details()[0]
TAILLE = int(ENT['shape'][1])


def recadrer_centre(im, taille):
    """Redimensionne le cote court puis recadre au centre — le pretraitement
    d'evaluation habituel des classifieurs d'images. Un redimensionnement direct
    ecrase les proportions, ce qui suffit parfois a tout casser."""
    w, h = im.size
    if w <= h:
        nw, nh = taille, max(taille, int(round(h * taille / w)))
    else:
        nh, nw = taille, max(taille, int(round(w * taille / h)))
    im = im.resize((nw, nh), Image.BILINEAR)
    g, t = (nw - taille) // 2, (nh - taille) // 2
    return im.crop((g, t, g + taille, t + taille))


MOYENNE = np.array([0.485, 0.456, 0.406], np.float32)
ECART = np.array([0.229, 0.224, 0.225], np.float32)


def variantes(im):
    """Les candidats. Le nom dit ce qui est teste, pas comment c'est calcule."""
    direct = np.asarray(im.convert('RGB').resize((TAILLE, TAILLE), Image.BILINEAR), np.float32)
    centre = np.asarray(recadrer_centre(im.convert('RGB'), TAILLE), np.float32)
    return {
        'brut 0..255 (celui du sidecar)': direct,
        'brut 0..255 + recadrage centre': centre,
        'divise par 255': direct / 255.0,
        'divise par 255 + recadrage': centre / 255.0,
        'centre sur [-1,1]': direct / 127.5 - 1.0,
        'centre sur [-1,1] + recadrage': centre / 127.5 - 1.0,
        'normalisation ImageNet': (direct / 255.0 - MOYENNE) / ECART,
        'normalisation ImageNet + recadrage': (centre / 255.0 - MOYENNE) / ECART,
        'canaux inverses (BGR), brut': direct[..., ::-1],
        'canaux inverses (BGR), [-1,1]': (direct / 127.5 - 1.0)[..., ::-1],
    }


def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


def main():
    manifeste = json.load(io.open(os.path.join(CORPUS, 'manifeste.json'), encoding='utf-8'))
    # Un echantillon EQUILIBRE : une photo par plat, dans l'ordre des plats.
    vus = set()
    echantillon = []
    for im in manifeste['images']:
        if im['classe'] in vus:
            continue
        vus.add(im['classe'])
        # La classe du corpus s'ecrit avec des tirets bas, celle du modele avec
        # des espaces. Sans cette conversion, aucune correspondance ne serait
        # trouvee et TOUTES les variantes afficheraient zero — on conclurait a
        # tort que le modele est mort.
        cible = index.get(im['classe'].replace('_', ' ').lower())
        if cible is None:
            continue
        echantillon.append((im['fichier'], cible, im['classe']))
        if len(echantillon) >= N:
            break

    print('  %d images, une par plat\n' % len(echantillon))

    scores = {}
    exemples = {}
    for fichier, cible, nom in echantillon:
        img = Image.open(os.path.join(CORPUS, fichier))
        for etiquette, tableau in variantes(img).items():
            it.set_tensor(ENT['index'], tableau[None].astype(np.float32))
            it.invoke()
            pr = np.asarray(it.get_tensor(SOR['index'])).ravel()
            if pr.min() < 0 or abs(float(pr.sum()) - 1.0) > 0.05:
                pr = softmax(pr)
            i = int(pr.argmax())
            s = scores.setdefault(etiquette, {'top1': 0, 'top5': 0, 'conf': []})
            if i == cible:
                s['top1'] += 1
            if cible in pr.argsort()[-5:]:
                s['top5'] += 1
            s['conf'].append(float(pr[i]))
            exemples.setdefault(etiquette, [])
            if len(exemples[etiquette]) < 3:
                exemples[etiquette].append('%s -> %s' % (nom, classes[i]))

    n = len(echantillon)
    print('  %-38s %-9s %-9s %s' % ('pretraitement', 'top-1', 'top-5', 'confiance moy.'))
    for etiquette, s in sorted(scores.items(), key=lambda kv: -kv[1]['top1']):
        print('  %-38s %3d/%-5d %3d/%-5d %.3f' % (
            etiquette, s['top1'], n, s['top5'], n, float(np.mean(s['conf']))))

    meilleur = max(scores.items(), key=lambda kv: kv[1]['top1'])
    print('\n  meilleur : %s (%d/%d)' % (meilleur[0], meilleur[1]['top1'], n))
    print('  ses reponses : %s' % ' | '.join(exemples[meilleur[0]]))
    if meilleur[1]['top1'] == 0:
        print('\n  => AUCUN pretraitement ne produit de justesse.')
        print('     Le probleme n est pas la facon dont le modele est alimente.')


if __name__ == '__main__':
    main()
