# -*- coding: utf-8 -*-
"""Un modele candidat a-t-il le droit de court-circuiter la cascade ?

POURQUOI CE FICHIER EXISTE
Le modele en place a ete adopte sur la mesure « 41/50 (82 %) ». Ce chiffre
compte les reponses AU-DESSUS DU SEUIL DE CONFIANCE : il dit la COUVERTURE — a
quelle frequence le modele tranche — et c'est une chose utile a savoir. Il ne dit
simplement rien de la JUSTESSE, et rien d'autre ne la disait.

Un classifieur place en tete de cascade coupe tous les paliers en dessous. S'il
se trompe en etant sur de lui, il ne degrade pas le service : il ecrit du faux
dans le journal d'un utilisateur, qui l'y lira comme une donnee mesuree. D'ou ce
script, qui ne mesure qu'une chose, celle qui manquait.

Etat au 29/08/2026 pour `food_salorie.tflite` :
  justesse globale               57,4 %
  justesse de ce qui est SERVI   71,9 %  -> ACCEPTE

⚠ Une premiere version de ce meme fichier annoncait « 0 sur 74 ». Elle lisait un
corpus dont les etiquettes etaient DEDUITES de la position des photos dans le jeu
de donnees au lieu d'etre lues : la photo comptee « pizza » etait un plat de
nachos. Sur cette base, le palier a ete debranche en production, a tort. La
mesure ne vaut jamais mieux que la verite terrain qu'on lui donne — et ici, cette
verite doit venir du champ `label` du jeu, jamais d'un calcul.

  python food4k/valider_modele.py [modele.tflite] [etiquettes.json] \
         [--seuil 0.5] [--corpus corpus-maghreb] [--tout]

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
    # ⚠ LA VALEUR D'UNE OPTION N'EST PAS UN ARGUMENT POSITIONNEL.
    # Premiere version : `[a for a in sys.argv[1:] if not a.startswith('--')]`.
    # Dans `valider_modele.py --seuil 0.50`, le « 0.50 » ne commence pas par des
    # tirets : il etait donc pris pour le chemin du modele, et le script mourait
    # sur « Could not open '0.50' ». La forme longue passait par chance, parce
    # que les chemins y precedent l'option.
    seuil = SEUIL_DEFAUT
    corpus = CORPUS
    une_par_plat = True
    args = []
    reste = list(sys.argv[1:])
    while reste:
        a = reste.pop(0)
        if a == '--seuil':
            if not reste:
                print('  --seuil attend une valeur, par exemple : --seuil 0.50')
                return 2
            seuil = float(reste.pop(0))
        elif a == '--corpus':
            if not reste:
                print('  --corpus attend un dossier, par exemple : --corpus corpus-maghreb')
                return 2
            corpus = reste.pop(0)
        elif a == '--tout':
            # Une photo par plat suffit sur Food-101, dont la verite terrain est
            # solide. Sur un corpus plus faible, prendre TOUTES les photos noie
            # une etiquette douteuse dans les autres.
            une_par_plat = False
        elif a.startswith('--'):
            continue
        else:
            args.append(a)

    modele = args[0] if args else os.path.join(ICI, 'food_salorie.tflite')
    etiquettes = args[1] if len(args) > 1 else os.path.join(ICI, 'label_map_172.json')

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

    manifeste = json.load(io.open(os.path.join(corpus, 'manifeste.json'), encoding='utf-8'))
    if manifeste.get('avertissement'):
        # Un corpus qui se sait fragile doit le dire A CHAQUE mesure, pas
        # seulement dans son fichier de fabrication.
        print('  ATTENTION : %s\n' % manifeste['avertissement'])

    # Par defaut une photo par plat : un echantillon desequilibre mesurerait les
    # plats les plus representes, pas le modele.
    vus = set()
    echantillon = []
    for im in manifeste['images']:
        if une_par_plat and im['classe'] in vus:
            continue
        cible = index.get(im['classe'].replace('_', ' ').lower())
        if cible is None:
            continue  # classe absente du modele : hors de son domaine, pas sa faute
        if not os.path.exists(os.path.join(corpus, im['fichier'])):
            continue
        vus.add(im['classe'])
        echantillon.append((im['fichier'], cible, im.get('provenance', 'reference')))

    justes = justes_confiants = confiants = 0
    parProvenance = {}
    for fichier, cible, provenance in echantillon:
        img = Image.open(os.path.join(corpus, fichier)).convert('RGB').resize((taille, taille), Image.BILINEAR)
        it.set_tensor(ENT['index'], np.asarray(img, np.float32)[None])
        it.invoke()
        pr = np.asarray(it.get_tensor(SOR['index'])).ravel()
        if pr.min() < 0 or abs(float(pr.sum()) - 1.0) > 0.05:
            pr = softmax(pr)
        i = int(pr.argmax())
        pp = parProvenance.setdefault(provenance, {'n': 0, 'justes': 0})
        pp['n'] += 1
        if i == cible:
            justes += 1
            pp['justes'] += 1
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
    print('  corpus            : %s' % os.path.basename(os.path.normpath(corpus)))
    print('  images evaluees   : %d' % n)
    if len(parProvenance) > 1 or 'reference' not in parProvenance:
        # ⚠ NE JAMAIS FONDRE DEUX QUALITES DE VERITE EN UN SEUL TAUX.
        # Une etiquette posee par un humain dans une categorie et une etiquette
        # deduite d'un mot dans un titre ne valent pas la meme chose. Les melanger
        # produit un chiffre qu'on ne sait plus interpreter.
        for prov, v in sorted(parProvenance.items(), key=lambda kv: -kv[1]['n']):
            print('    dont %-12s %3d images, %3d justes  (%.1f %%)'
                  % (prov, v['n'], v['justes'], 100.0 * v['justes'] / v['n'] if v['n'] else 0))
    print('  justesse globale  : %d/%d  (%.1f %%)' % (justes, n, taux * 100))
    print('  reponses servies  : %d au-dessus de %.2f de confiance' % (confiants, CONFIANCE_MIN))
    print('  JUSTESSE DE CE QUI EST SERVI : %d/%d  (%.1f %%)' % (justes_confiants, confiants, taux_servi * 100))

    if taux_servi < seuil:
        print('\n  REFUSE. Sous la barre de %.0f %%.' % (seuil * 100))
        print('  Ce modele ne doit pas court-circuiter la cascade. Pour le couper :')
        print('    serveur   : poser FOOD4K_ENABLED=false')
        print('    telephone : MODELE_ON_DEVICE_FIABLE = false (lib/onDeviceVision.ts)')
        return 1

    print('\n  ACCEPTE. Il peut prendre la tete de la cascade.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
