# -*- coding: utf-8 -*-
"""Existe-t-il un signal qui dise « cette photo est hors de mon domaine » ?

LE PROBLEME QUE CE SCRIPT CHERCHE A RESOUDRE
Le classifieur embarque est juste a 59 % sur Food-101 et 19 % sur la cuisine
marocaine. Un seuil par famille aide un peu, mais seulement quand le modele
ANNONCE une classe locale — or la plupart des photos marocaines recoivent une
prediction Food-101, indiscernable a l'execution d'une bonne reponse.

La question est donc : la FORME de la distribution de sortie trahit-elle
l'incompetence, meme quand la confiance en tete est haute ? On teste quatre
signaux calculables en une ligne au moment de la reponse :

  confiance   la probabilite de la classe en tete (ce qu'on utilise deja)
  marge       ecart entre la 1re et la 2e : un modele hesitant a une marge fine
  entropie    dispersion de toute la distribution
  masse5      part de probabilite concentree dans le top-5

Si l'un d'eux separe les deux corpus MIEUX que la confiance seule, il vaut la
peine d'etre ajoute. Sinon, il ne faut pas l'ajouter : un signal qui ne separe
pas ne fait que compliquer le code et donner l'illusion d'un garde-fou.

Usage :  python food4k/signal_hors_domaine.py
"""
import io
import json
import os

import numpy as np
import tensorflow as tf
from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.join(ICI, '..')

classes = json.load(io.open(os.path.join(ICI, 'label_map_172.json'), encoding='utf-8'))['classes']
index = {c.replace('_', ' ').lower(): i for i, c in enumerate(classes)}

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
        if cible is not None and os.path.exists(chemin):
            out.append((chemin, cible))
    return out


def mesurer(couples):
    lignes = []
    for chemin, cible in couples:
        a = np.asarray(Image.open(chemin).convert('RGB').resize((TAILLE, TAILLE), Image.BILINEAR), np.float32)
        it.set_tensor(ENT['index'], a[None])
        it.invoke()
        pr = np.asarray(it.get_tensor(SOR['index'])).ravel()
        if pr.min() < 0 or abs(float(pr.sum()) - 1.0) > 0.05:
            pr = softmax(pr)
        ordre = np.sort(pr)[::-1]
        p = np.clip(pr, 1e-12, 1.0)
        lignes.append({
            'juste': int(pr.argmax()) == cible,
            'confiance': float(ordre[0]),
            'marge': float(ordre[0] - ordre[1]),
            'entropie': float(-(p * np.log(p)).sum()),
            'masse5': float(ordre[:5].sum()),
        })
    return lignes


ref = mesurer(charger(os.path.join(RACINE, 'corpus-ia'), False))
mag = mesurer(charger(os.path.join(RACINE, 'corpus-maghreb'), True))

print('  %-10s %-22s %-22s %s' % ('signal', 'Food-101 (median)', 'marocain (median)', 'separation'))
for nom in ('confiance', 'marge', 'entropie', 'masse5'):
    a = np.median([x[nom] for x in ref])
    b = np.median([x[nom] for x in mag])
    # AUC : probabilite qu'une image Food-101 tiree au hasard ait une valeur
    # superieure a une image marocaine. 0,5 = aucune separation, 1 = parfaite.
    va, vb = [x[nom] for x in ref], [x[nom] for x in mag]
    gagne = sum(1 for x in va for y in vb if x > y)
    egal = sum(1 for x in va for y in vb if x == y)
    auc = (gagne + 0.5 * egal) / (len(va) * len(vb))
    # On rapporte l'ecart a 0,5 : un signal inverse separe tout aussi bien.
    print('  %-10s %-22.3f %-22.3f AUC %.3f  (ecart %.3f)'
          % (nom, a, b, auc, abs(auc - 0.5)))

print('\n  Lecture : « separation » dit a quel point le signal distingue les deux')
print('  corpus. La confiance sert deja de garde-fou ; un autre signal ne merite')
print('  d etre ajoute que s il separe NETTEMENT mieux qu elle.')
