# -*- coding: utf-8 -*-
"""Le modele NE VOIT PAS les plats marocains, ou ne sait pas les CLASSER en tete ?

LA QUESTION, ET POURQUOI ELLE DECIDE DE LA SUITE
Le classifieur embarque est juste a 57 % sur Food-101 et 20,6 % sur la cuisine
marocaine. Deux causes possibles, et elles n'appellent pas du tout le meme
travail :

  - S'il place la bonne classe dans son top-5 sans la mettre en tete, alors
    l'information EST dans le modele. Un reglage — recalibrage, re-classement,
    pondereration des classes locales — peut la recuperer sans reentrainer.
  - Si la bonne classe n'apparait meme pas dans son top-5, le modele n'a pas
    appris ces plats. Aucun reglage ne les fera apparaitre : il faut des donnees
    et un reentrainement.

Ce script mesure les deux, et compare a Food-101 pour donner l'echelle.

⚠ La verite terrain vient de Wikimedia Commons, plus faible que Food-101. On ne
juge donc QUE sur les images rangees par un humain dans une categorie.

Usage :  python food4k/diagnostic_maghreb.py
"""
import io
import json
import os
import collections

import numpy as np
import tensorflow as tf
from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.join(ICI, '..')

classes = json.load(io.open(os.path.join(ICI, 'label_map_172.json'), encoding='utf-8'))['classes']
index = {c.replace('_', ' ').lower(): i for i, c in enumerate(classes)}
f101 = set(x.replace('_', ' ').lower()
           for x in json.load(io.open(os.path.join(ICI, 'label_map.json'), encoding='utf-8'))['classes'])

it = tf.lite.Interpreter(model_path=os.path.join(ICI, 'food_salorie.tflite'))
it.allocate_tensors()
ENT, SOR = it.get_input_details()[0], it.get_output_details()[0]
TAILLE = int(ENT['shape'][1])


def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


def charger(dossier, seulement_categorie):
    m = json.load(io.open(os.path.join(dossier, 'manifeste.json'), encoding='utf-8'))
    out = []
    for im in m['images']:
        if seulement_categorie and im.get('provenance') != 'categorie':
            continue
        cible = index.get(im['classe'].replace('_', ' ').lower())
        chemin = os.path.join(dossier, im['fichier'])
        if cible is None or not os.path.exists(chemin):
            continue
        out.append((chemin, cible))
    return out


def juger(couples, nom):
    top1 = top5 = top10 = 0
    rangs = []
    for chemin, cible in couples:
        a = np.asarray(Image.open(chemin).convert('RGB').resize((TAILLE, TAILLE), Image.BILINEAR), np.float32)
        it.set_tensor(ENT['index'], a[None])
        it.invoke()
        pr = np.asarray(it.get_tensor(SOR['index'])).ravel()
        if pr.min() < 0 or abs(float(pr.sum()) - 1.0) > 0.05:
            pr = softmax(pr)
        ordre = list(pr.argsort()[::-1])
        rang = ordre.index(cible) + 1          # 1 = en tete
        rangs.append(rang)
        top1 += rang == 1
        top5 += rang <= 5
        top10 += rang <= 10

    n = len(couples)
    med = int(np.median(rangs)) if rangs else 0
    print('  %-22s n=%-4d  top-1 %5.1f %%   top-5 %5.1f %%   top-10 %5.1f %%   rang median %d'
          % (nom, n, 100.0 * top1 / n, 100.0 * top5 / n, 100.0 * top10 / n, med))
    return {'n': n, 'top1': top1, 'top5': top5, 'top10': top10, 'rangs': rangs}


print('  Ou se trouve la bonne reponse dans le classement du modele ?\n')
ref = juger(charger(os.path.join(RACINE, 'corpus-ia'), False), 'Food-101')
mag = juger(charger(os.path.join(RACINE, 'corpus-maghreb'), True), 'cuisine marocaine')

print()
ecart5 = 100.0 * mag['top5'] / mag['n'] - 100.0 * mag['top1'] / mag['n']
ecart5_ref = 100.0 * ref['top5'] / ref['n'] - 100.0 * ref['top1'] / ref['n']
print('  gain top-1 -> top-5 : %+.1f points sur le marocain, %+.1f sur Food-101'
      % (ecart5, ecart5_ref))

# Le verdict, dit en clair plutot que laisse a l'interpretation.
part5 = 100.0 * mag['top5'] / mag['n']
if part5 >= 55:
    print('\n  => L INFORMATION EST DANS LE MODELE. La bonne classe est souvent dans')
    print('     son top-5 sans etre en tete : un recalibrage ou un re-classement')
    print('     peut la recuperer sans reentrainer.')
elif part5 >= 35:
    print('\n  => SIGNAL PARTIEL. Le modele « voit » une partie de ces plats mais les')
    print('     classe mal. Un recalibrage aiderait ; il ne suffira pas.')
else:
    print('\n  => LE MODELE N A PAS APPRIS CES PLATS. La bonne classe n apparait meme')
    print('     pas dans son top-5. Aucun reglage ne la fera apparaitre : il faut')
    print('     des donnees et un reentrainement.')

# Les plats ou il est le plus perdu : c'est par la qu'un reentrainement commence.
pires = sorted(zip([c for c, _ in charger(os.path.join(RACINE, 'corpus-maghreb'), True)], mag['rangs']),
               key=lambda kv: -kv[1])[:8]
print('\n  les plus mal classes (rang de la bonne reponse sur 172) :')
for chemin, rang in pires:
    print('    %-46s rang %d' % (os.path.basename(chemin)[:45], rang))
