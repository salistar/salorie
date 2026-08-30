# -*- coding: utf-8 -*-
"""Que coute, et que rapporte, le seuil de confiance du tier-0 ?

LE COMPROMIS, EN UNE PHRASE
Plus le seuil est haut, moins le classifieur embarque repond — donc plus d'appels
cloud, plus de latence, plus de cout — mais plus ce qu'il repond est juste.

POURQUOI CETTE COURBE EXISTE
`FOOD4K_MIN_CONF` valait 0,60, sans qu'aucune mesure ne dise ce que ce nombre
achete. Or il ne se comporte pas du tout pareil selon la cuisine :

  - sur Food-101, le seuil trie bien : le modele est juste sur pres des trois
    quarts de ce qu'il rend ;
  - sur la cuisine marocaine — celle POUR LAQUELLE ce modele a ete choisi — il
    repond tout aussi volontiers et se trompe trois fois sur quatre.

Autrement dit, la confiance de ce modele ne veut pas dire la meme chose des deux
cotes de son propre domaine. Cette courbe le montre chiffre par chiffre, pour que
le reglage soit un arbitrage et non une habitude.

Usage :  python food4k/courbe_seuil.py [dossier-corpus] [--tout]
"""
import io
import json
import os
import sys

import numpy as np
import tensorflow as tf
from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.join(ICI, '..')

SEUILS = [0.0, 0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]


def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


def main():
    corpus = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') \
        else os.path.join(RACINE, 'corpus-ia')
    tout = '--tout' in sys.argv

    classes = json.load(io.open(os.path.join(ICI, 'label_map_172.json'), encoding='utf-8'))['classes']
    index = {c.replace('_', ' ').lower(): i for i, c in enumerate(classes)}

    it = tf.lite.Interpreter(model_path=os.path.join(ICI, 'food_salorie.tflite'))
    it.allocate_tensors()
    E, S = it.get_input_details()[0], it.get_output_details()[0]
    taille = int(E['shape'][1])

    manifeste = json.load(io.open(os.path.join(corpus, 'manifeste.json'), encoding='utf-8'))
    vus = set()
    couples = []
    for im in manifeste['images']:
        if not tout and im['classe'] in vus:
            continue
        cible = index.get(im['classe'].replace('_', ' ').lower())
        chemin = os.path.join(corpus, im['fichier'])
        if cible is None or not os.path.exists(chemin):
            continue
        vus.add(im['classe'])
        couples.append((chemin, cible))

    # On infere UNE fois par image et on rejoue les seuils dessus : refaire
    # tourner le modele par seuil ne changerait rien au resultat et couterait huit
    # fois le temps.
    resultats = []
    for chemin, cible in couples:
        a = np.asarray(Image.open(chemin).convert('RGB').resize((taille, taille), Image.BILINEAR), np.float32)
        it.set_tensor(E['index'], a[None])
        it.invoke()
        pr = np.asarray(it.get_tensor(S['index'])).ravel()
        if pr.min() < 0 or abs(float(pr.sum()) - 1.0) > 0.05:
            pr = softmax(pr)
        i = int(pr.argmax())
        resultats.append((float(pr[i]), i == cible))

    n = len(resultats)
    print('  corpus : %s   (%d images)\n' % (os.path.basename(os.path.normpath(corpus)), n))
    print('  %-7s %-14s %-14s %s' % ('seuil', 'repond', 'justes parmi', 'plats justes'))
    print('  %-7s %-14s %-14s %s' % ('', '(couverture)', 'ce qui est servi', 'au total'))
    for s in SEUILS:
        rendus = [(c, j) for c, j in resultats if c >= s]
        justes = sum(1 for _, j in rendus if j)
        couv = 100.0 * len(rendus) / n if n else 0
        prec = 100.0 * justes / len(rendus) if rendus else 0
        print('  %-7.2f %3d/%-3d %5.1f%%  %3d/%-3d %5.1f%%   %3d/%-3d'
              % (s, len(rendus), n, couv, justes, len(rendus), prec, justes, n))

    print('\n  Lecture : « repond » est ce que le tier-0 tranche sans appeler le')
    print('  cloud ; « justes parmi ce qui est servi » est ce que vaut cette')
    print('  reponse pour l utilisateur. Le reste descend dans la cascade.')


if __name__ == '__main__':
    main()
