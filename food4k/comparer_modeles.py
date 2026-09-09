# -*- coding: utf-8 -*-
"""Deux modeles, LES MEMES IMAGES, la meme question.

⚠ POURQUOI CE FICHIER EXISTE — LE PIEGE QU'IL DESAMORCE.
`valider_modele.py` ecarte les images dont la classe est absente du modele
(« hors de son domaine, pas sa faute »). C'est juste pour mesurer UN modele.
C'est FAUX pour en comparer DEUX qui n'ont pas le meme nombre de classes.

Un candidat entraine avec `--mini 20` abandonne les classes maigres. Mesure a
l'ancienne, il n'est interroge que sur ce qu'il connait : moins de classes, moins
de facons de se tromper, meilleur score. On aurait remplace un modele a 172
classes par un modele a 130 en croyant l'avoir ameliore, alors qu'on aurait
seulement retire les questions difficiles de l'examen.

CE QU'ON MESURE ICI, ET POURQUOI C'EST LA BONNE QUESTION
La cascade s'arrete au premier palier SUR DE LUI. Le classifieur embarque ne nuit
donc pas quand il ignore un plat — il se tait, et le serveur repond. Il nuit
quand il repond avec assurance ET se trompe : il court-circuite la cascade avec
une fausse reponse.

Les deux chiffres qui decident sont donc, sur LES MEMES IMAGES :
  COUVERTURE  combien de photos le modele ose servir (confiance >= seuil)
  JUSTESSE    parmi celles-la, combien sont exactes
Un candidat qui sert moins mais plus juste est un BON echange. Un candidat qui
sert autant mais moins juste est une regression, quel que soit son score global.

⚠ UNE IMAGE D'UNE CLASSE QUE LE MODELE N'A PAS APPRISE N'EST PAS IGNOREE.
Elle est comptee : s'il repond quand meme, avec assurance, c'est une erreur — et
c'est exactement le comportement dangereux qu'on cherche a voir.

Usage :
  python food4k/comparer_modeles.py <candidat.tflite> <etiquettes.json>
        [--reference food4k/food_salorie.tflite] [--seuil 0.50]
"""
import argparse
import io
import json
import os
import sys

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
import tensorflow as tf  # noqa: E402

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.abspath(os.path.join(ICI, '..'))


def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


class Modele:
    def __init__(self, tflite, etiquettes):
        self.it = tf.lite.Interpreter(model_path=tflite)
        self.it.allocate_tensors()
        self.ent = self.it.get_input_details()[0]
        self.sor = self.it.get_output_details()[0]
        self.taille = int(self.ent['shape'][1])
        self.classes = json.load(io.open(etiquettes, encoding='utf-8'))['classes']
        if int(self.sor['shape'][-1]) != len(self.classes):
            raise SystemExit('  ARRET : %s a %d sorties pour %d etiquettes.'
                             % (os.path.basename(tflite),
                                int(self.sor['shape'][-1]), len(self.classes)))
        self.index = {c.replace('_', ' ').lower(): i for i, c in enumerate(self.classes)}

    def predire(self, chemin):
        img = Image.open(chemin).convert('RGB').resize(
            (self.taille, self.taille), Image.BILINEAR)
        self.it.set_tensor(self.ent['index'], np.asarray(img, np.float32)[None])
        self.it.invoke()
        p = np.asarray(self.it.get_tensor(self.sor['index'])).ravel()
        # Certains exports rendent des logits : on ne s'y fie pas, on verifie.
        if p.min() < 0 or abs(float(p.sum()) - 1.0) > 0.05:
            p = softmax(p)
        i = int(p.argmax())
        return self.classes[i].replace('_', ' ').lower(), float(p[i])


def echantillon(corpus, une_par_plat=False):
    """Les images de mesure, avec leur vraie classe LUE dans le manifeste."""
    chemin = os.path.join(RACINE, corpus)
    m = os.path.join(chemin, 'manifeste.json')
    if not os.path.exists(m):
        return []
    vus = set()
    out = []
    for im in json.load(io.open(m, encoding='utf-8'))['images']:
        c = im['classe'].replace('_', ' ').lower()
        if une_par_plat and c in vus:
            continue
        f = os.path.join(chemin, im['fichier'])
        if not os.path.exists(f):
            continue
        vus.add(c)
        out.append((f, c))
    return out


def juger(modele, images, seuil):
    sert = juste = 0
    hors_domaine_servi = 0
    for chemin, vraie in images:
        try:
            predit, conf = modele.predire(chemin)
        except Exception:
            continue
        if conf < seuil:
            continue                      # le modele se tait : la cascade prend
        sert += 1
        if predit == vraie:
            juste += 1
        elif vraie not in modele.index:
            # Il a repondu avec assurance sur un plat qu'il n'a jamais appris.
            # C'est le cas le plus nuisible : il arrete la cascade sur du faux.
            hors_domaine_servi += 1
    return sert, juste, hors_domaine_servi


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('candidat')
    ap.add_argument('etiquettes')
    ap.add_argument('--reference', default=os.path.join(ICI, 'food_salorie.tflite'))
    ap.add_argument('--etiquettes-reference', default=os.path.join(ICI, 'label_map_172.json'))
    ap.add_argument('--seuil', type=float, default=0.50)
    a = ap.parse_args()

    images = echantillon('corpus-ia', une_par_plat=True) + echantillon('corpus-maghreb')
    if not images:
        print('  ARRET : aucun corpus de mesure. `node scripts/construire-corpus.js 1`')
        return 1

    candidat = Modele(a.candidat, a.etiquettes)
    reference = Modele(a.reference, a.etiquettes_reference)

    print('  %d images de mesure (corpus-ia + corpus-maghreb)' % len(images))
    print('  seuil de confiance : %.2f' % a.seuil)
    print('  candidat  : %d classes' % len(candidat.classes))
    print('  reference : %d classes\n' % len(reference.classes))

    lignes = []
    for nom, m in (('candidat', candidat), ('en place', reference)):
        sert, juste, hors = juger(m, images, a.seuil)
        couverture = 100.0 * sert / len(images)
        justesse = 100.0 * juste / sert if sert else 0.0
        lignes.append((nom, sert, couverture, justesse, hors))
        print('  %-10s sert %4d/%d images (%.1f %%), dont %.1f %% justes'
              % (nom, sert, len(images), couverture, justesse))
        if hors:
            print('             dont %d reponses ASSUREES sur des plats jamais appris' % hors)

    c, r = lignes[0], lignes[1]
    print()
    ecart = c[3] - r[3]
    if ecart > 0:
        print('  Le candidat est %.1f point(s) PLUS juste sur ce qu il sert.' % ecart)
    else:
        print('  Le candidat est %.1f point(s) MOINS juste sur ce qu il sert.' % -ecart)
    print('  Il sert %.1f %% des images contre %.1f %% pour le modele en place.'
          % (c[2], r[2]))
    if c[2] < r[2] - 10 and ecart > 0:
        print('  Il se tait plus souvent — la cascade prendra le relais : c est')
        print('  un ECHANGE, pas une regression. Le cout est en latence, pas en justesse.')

    io.open(os.path.join(ICI, 'comparaison.json'), 'w', encoding='utf-8').write(
        json.dumps({
            'images': len(images), 'seuil': a.seuil,
            'candidat': {'classes': len(candidat.classes), 'sert': c[1],
                         'couverture': round(c[2], 2), 'justesse': round(c[3], 2),
                         'assure_hors_domaine': c[4]},
            'en_place': {'classes': len(reference.classes), 'sert': r[1],
                         'couverture': round(r[2], 2), 'justesse': round(r[3], 2),
                         'assure_hors_domaine': r[4]},
        }, ensure_ascii=False, indent=1))
    # Le code de sortie porte la decision : 0 si le candidat merite d'etre pose.
    return 0 if ecart > 0 else 1


if __name__ == '__main__':
    sys.exit(main())
