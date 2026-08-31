# -*- coding: utf-8 -*-
"""La confiance du modele vaut-elle la meme chose selon CE QU'IL PREDIT ?

L'IDEE, ET POURQUOI ELLE EST ACTIONNABLE
Le modele est juste a 59 % sur Food-101 et 19 % sur la cuisine marocaine. Mais a
l'execution, on ignore d'ou vient la photo : on ne connait que la classe predite
et la confiance. La question utile n'est donc pas « ce plat est-il marocain ? »
mais « quand le modele ANNONCE une classe marocaine, a-t-il plus ou moins souvent
raison que lorsqu'il annonce une classe Food-101 ? »

Si l'ecart est net, un seuil PAR FAMILLE vaut mieux qu'un seuil unique : on
laisse passer ce qui est fiable et on fait descendre le reste vers le cloud.
S'il ne l'est pas, la classe predite n'apporte aucune information et il faut
s'en tenir au seuil global.

Ce script ne suppose rien : il compte, sur les deux corpus reunis.

Usage :  python food4k/precision_par_famille.py
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
FOOD101 = set(x.replace('_', ' ').lower()
              for x in json.load(io.open(os.path.join(ICI, 'label_map.json'), encoding='utf-8'))['classes'])

it = tf.lite.Interpreter(model_path=os.path.join(ICI, 'food_salorie.tflite'))
it.allocate_tensors()
ENT, SOR = it.get_input_details()[0], it.get_output_details()[0]
TAILLE = int(ENT['shape'][1])

SEUILS = [0.0, 0.6, 0.8, 0.9]


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
        if cible is not None and os.path.exists(chemin):
            out.append((chemin, cible))
    return out


# Les deux corpus REUNIS : c'est ce melange qui ressemble le plus a ce que voit
# l'application, ou les deux cuisines arrivent par la meme camera.
couples = (charger(os.path.join(RACINE, 'corpus-ia'), False)
           + charger(os.path.join(RACINE, 'corpus-maghreb'), True))

observations = []
for chemin, cible in couples:
    a = np.asarray(Image.open(chemin).convert('RGB').resize((TAILLE, TAILLE), Image.BILINEAR), np.float32)
    it.set_tensor(ENT['index'], a[None])
    it.invoke()
    pr = np.asarray(it.get_tensor(SOR['index'])).ravel()
    if pr.min() < 0 or abs(float(pr.sum()) - 1.0) > 0.05:
        pr = softmax(pr)
    i = int(pr.argmax())
    famille = 'Food-101' if classes[i].lower() in FOOD101 else 'marocaine'
    observations.append((famille, float(pr[i]), i == cible))

print('  %d images (Food-101 + cuisine marocaine reunis)\n' % len(observations))
print('  %-12s %-7s %-16s %s' % ('predit', 'seuil', 'repond', 'juste parmi ce qui est servi'))
for famille in ('Food-101', 'marocaine'):
    sous = [o for o in observations if o[0] == famille]
    for s in SEUILS:
        rendus = [o for o in sous if o[1] >= s]
        justes = sum(1 for o in rendus if o[2])
        prec = 100.0 * justes / len(rendus) if rendus else 0.0
        print('  %-12s %-7.2f %4d/%-11d %3d/%-4d  %5.1f %%'
              % (famille, s, len(rendus), len(sous), justes, len(rendus), prec))
    print()

# Le verdict, dit en clair.
def precision(famille, seuil):
    r = [o for o in observations if o[0] == famille and o[1] >= seuil]
    return (100.0 * sum(1 for o in r if o[2]) / len(r)) if r else 0.0


ecart = precision('Food-101', 0.8) - precision('marocaine', 0.8)
print('  A seuil 0,80 : %.1f %% quand il annonce du Food-101, %.1f %% quand il'
      % (precision('Food-101', 0.8), precision('marocaine', 0.8)))
print('  annonce un plat marocain — soit %.1f points d ecart.' % ecart)
if abs(ecart) >= 15:
    print('\n  => LA CLASSE PREDITE PORTE DE L INFORMATION. Un seuil par famille se')
    print('     justifie : exiger davantage la ou le modele se trompe le plus.')
else:
    print('\n  => LA CLASSE PREDITE N APPORTE RIEN. Un seuil unique suffit ; en')
    print('     ajouter un second compliquerait le code sans rien acheter.')
