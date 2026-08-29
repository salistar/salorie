# -*- coding: utf-8 -*-
"""Un modele candidat a-t-il le droit de court-circuiter la cascade ?

POURQUOI CE FICHIER EXISTE
Le modele en place a ete adopte sur la mesure « 41/50 (82 %) ». Ce chiffre
comptait les reponses AU-DESSUS DU SEUIL DE CONFIANCE — pas les reponses justes.
Mesure faite le 29/08/2026 : 0 bonne reponse sur 74 plats Food-101, annoncees
avec 0,90 a 0,99 de confiance.

Un classifieur place en tete de cascade coupe tous les paliers en dessous. S'il
se trompe en etant sur de lui, il ne degrade pas le service : il ecrit du faux
dans le journal d'un utilisateur, qui l'y lira comme une donnee mesuree.

Ce script ne mesure donc qu'UNE chose, celle qui manquait : la JUSTESSE.

  python food4k/valider_modele.py [modele.tflite] [etiquettes.json] [--seuil 0.5]

Sortie 0 si le modele passe la barre, 1 sinon. Prevu pour etre branche a la CI.

⚠ Il exige `corpus-ia/` : `node scripts/construire-corpus.js` le reconstruit.
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

# La barre. Elle n'est pas la performance visee — c'est le plancher en dessous
# duquel court-circuiter la cascade fait plus de mal que de bien. Un modele a
# 50 % laisse encore passer une erreur sur deux, mais il apporte un signal ; a
# 5 %, il ne fait que remplacer une bonne reponse lente par une fausse rapide.
SEUIL_DEFAUT = 0.50

# Le seuil de confiance auquel le sidecar rend une reponse directe. La justesse
# se mesure SUR CES REPONSES-LA : ce sont les seules qui atteignent
# l'utilisateur, et donc les seules qui comptent.
CONFIANCE_MIN = float(os.environ.get('FOOD4K_MIN_CONF', '0.6'))


def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    modele = args[0] if args else os.path.join(ICI, 'food_salorie.tflite')
    etiquettes = args[1] if len(args) > 1 else os.path.join(ICI, 'label_map_172.json')
    seuil = SEUIL_DEFAUT
    if '--seuil' in sys.argv:
        seuil = float(sys.argv[sys.argv.index('--seuil') + 1])

    classes = json.load(io.open(etiquettes, encoding='utf-8'))['classes']
    index = {c.replace('_', ' ').lower(): i for i, c in enumerate(classes)}

    it = tf.lite.Interpreter(model_path=modele)
    it.allocate_tensors()
    ENT, SOR = it.get_input_details()[0], it.get_output_details()[0]
    taille = int(ENT['shape'][1])

    sorties = int(SOR['shape'][-1])
    if sorties != len(classes):
        print('  ARRET : le modele a %d sorties, la liste en compte %d.' % (sorties, len(classes)))
        print('  Un ecart ici suffit a rendre toutes les reponses fausses sans lever d erreur.')
        return 1

    manifeste = json.load(io.open(os.path.join(CORPUS, 'manifeste.json'), encoding='utf-8'))

    # Une photo par plat : un echantillon desequilibre mesurerait les plats les
    # plus representes, pas le modele.
    vus = set()
    echantillon = []
    for im in manifeste['images']:
        if im['classe'] in vus:
            continue
        cible = index.get(im['classe'].replace('_', ' ').lower())
        if cible is None:
            continue  # classe absente du modele : hors de son domaine, pas sa faute
        vus.add(im['classe'])
        echantillon.append((im['fichier'], cible))

    justes = justes_confiants = confiants = 0
    for fichier, cible in echantillon:
        img = Image.open(os.path.join(CORPUS, fichier)).convert('RGB').resize((taille, taille), Image.BILINEAR)
        it.set_tensor(ENT['index'], np.asarray(img, np.float32)[None])
        it.invoke()
        pr = np.asarray(it.get_tensor(SOR['index'])).ravel()
        if pr.min() < 0 or abs(float(pr.sum()) - 1.0) > 0.05:
            pr = softmax(pr)
        i = int(pr.argmax())
        if i == cible:
            justes += 1
        if float(pr[i]) >= CONFIANCE_MIN:
            confiants += 1
            if i == cible:
                justes_confiants += 1

    n = len(echantillon)
    taux = justes / n if n else 0.0
    # LE chiffre qui compte : parmi les reponses que l'utilisateur recevrait
    # vraiment (celles au-dessus du seuil), combien sont justes ?
    taux_servi = justes_confiants / confiants if confiants else 0.0

    print('  modele            : %s' % os.path.basename(modele))
    print('  plats evalues     : %d' % n)
    print('  justesse globale  : %d/%d  (%.1f %%)' % (justes, n, taux * 100))
    print('  reponses servies  : %d au-dessus de %.2f de confiance' % (confiants, CONFIANCE_MIN))
    print('  JUSTESSE DE CE QUI EST SERVI : %d/%d  (%.1f %%)' % (justes_confiants, confiants, taux_servi * 100))

    if taux_servi < seuil:
        print('\n  REFUSE. Sous la barre de %.0f %%.' % (seuil * 100))
        print('  Ce modele ne doit pas court-circuiter la cascade : laisser')
        print('  FOOD4K_ENABLED non defini, et MODELE_ON_DEVICE_FIABLE a false.')
        return 1

    print('\n  ACCEPTE. Il peut prendre la tete de la cascade.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
