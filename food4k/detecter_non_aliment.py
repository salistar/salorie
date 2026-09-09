# -*- coding: utf-8 -*-
"""« Est-ce seulement de la nourriture ? » — la question que le titre ne repond pas.

POURQUOI CE SECOND FILTRE EXISTE
Le filtre par titre de `construire-corpus-plus.js` ecarte ce qui s'annonce comme
autre chose (« logo », « map », « building »). Il ne peut rien contre un titre
honnete qui designe autre chose que ce qu'on cherche. Cas constate le 02/09/2026
dans le corpus existant : la classe « bahla » contenait une ROUTE et une PORTE
MONUMENTALE — le fort de Bahla, a Oman. Aucun mot du titre ne trahissait le
probleme, et ces deux images entraient dans l'entrainement comme des patisseries.

COMMENT ON TRANCHE, ET POURQUOI CE MODELE-LA
On interroge un classifieur ImageNet (MobileNetV3) — un modele GENERALISTE,
entraine sur 1000 categories dont beaucoup d'aliments et beaucoup de batiments,
vehicules, animaux. Ce n'est PAS le modele qu'on entraine : s'en servir pour
filtrer son propre jeu d'entrainement reviendrait a lui demander de confirmer ses
propres prejuges. Un juge exterieur, entraine sur autre chose, peut dire
« ceci est un chateau » la ou notre modele culinaire ne verrait qu'un plat brun.

⚠ LE FILTRE EST DELIBEREMENT PRUDENT.
Il n'ecarte que ce qu'ImageNet reconnait CLAIREMENT comme autre chose. Un plat
marocain qu'ImageNet ne connait pas rend des predictions dispersees et faibles :
ce cas est GARDE. Ecarter les images incertaines serait l'erreur symetrique, et
la plus grave — elle viderait justement les classes qu'on cherche a nourrir.

Usage :
  python food4k/detecter_non_aliment.py <dossier> [--appliquer] [--seuil 0.30]
"""
import io
import json
import os
import shutil
import sys

import numpy as np

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')

# La console Windows est en cp1252 : sans cela, un simple caractere accentue ou
# un pictogramme fait planter le script APRES son travail, et l'appelant croit a
# un echec la ou tout s'est bien passe.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


# Le vocabulaire de ce qui est mangeable ou pose sur une table. Il sert a LIRE
# les predictions d'ImageNet, dont les noms sont des mots anglais.
MOTS_ALIMENT = (
    'plate', 'bowl', 'soup', 'tray', 'dish', 'platter', 'cup', 'mug', 'spoon',
    'fork', 'saucer', 'pot', 'pan', 'skillet', 'caldron', 'wok', 'dining',
    'bread', 'loaf', 'bagel', 'pretzel', 'dough', 'pizza', 'burrito', 'taco',
    'cheeseburger', 'hotdog', 'sandwich', 'meat', 'steak', 'carbonara',
    'spaghetti', 'noodle', 'rice', 'potpie', 'guacamole', 'hummus', 'consomme',
    'trifle', 'ice cream', 'ice lolly', 'chocolate', 'custard', 'cake', 'pastry',
    'cookie', 'candy', 'honeycomb', 'espresso', 'eggnog', 'wine', 'coffee',
    'banana', 'orange', 'lemon', 'fig', 'pineapple', 'strawberry', 'pomegranate',
    'granny smith', 'jackfruit', 'corn', 'cabbage', 'broccoli', 'cauliflower',
    'zucchini', 'squash', 'cucumber', 'artichoke', 'pepper', 'cardoon',
    'mushroom', 'potato', 'butternut', 'acorn',
    'egg', 'burrito', 'french loaf', 'crate', 'pitcher',
    'water jug', 'goblet', 'beer glass', 'napkin', 'table',
)

# ⚠ MOTS RETIRES DE LA LISTE CI-DESSUS LE 08/09/2026, ET POURQUOI.
# `restaurant`, `grocery store`, `bakery`, `confectionery`, `menu` designent des
# LIEUX, pas des plats. Un interieur de bar sombre rangé sous `nougat` obtenait
# ainsi un score « aliment » de 0,52 — au-dessus du seuil — et etait garde comme
# une photo de nougat. Une boutique ou l'on vend a manger n'est pas de la
# nourriture : c'est exactement la confusion qu'un modele de plats ne doit pas
# apprendre.
LIEUX_PAS_PLATS = ('grocery', 'bakery', 'restaurant', 'confectionery', 'menu',
                   'butcher shop', 'delicatessen', 'tobacco shop')

# Ce dont on est SUR que ce n'est pas un plat. Une prediction forte sur l'un de
# ces mots, sans aucun mot alimentaire a cote, suffit a ecarter.
MOTS_CERTAINEMENT_PAS = (
    'castle', 'palace', 'church', 'mosque', 'monastery', 'dome', 'bell cote',
    'triumphal arch', 'obelisk', 'fountain', 'cliff', 'valley', 'lakeside',
    'seashore', 'promontory', 'volcano', 'alp', 'sandbar', 'coral reef',
    'car', 'jeep', 'truck', 'minivan', 'limousine', 'cab', 'trailer', 'moped',
    'motor scooter', 'mountain bike', 'traffic light', 'street sign', 'parking',
    'freight car', 'passenger car', 'streetcar', 'trolleybus', 'school bus',
    'library', 'bookshop', 'barn', 'boathouse', 'greenhouse', 'home theater',
    'web site', 'envelope', 'book jacket', 'comic book', 'crossword',
    'jersey', 'suit', 'gown', 'kimono', 'sarong', 'miniskirt', 'brassiere',
    'laptop', 'notebook', 'desktop computer', 'cellular telephone', 'monitor',
    'dog', 'cat', 'bird', 'horse', 'sheep', 'ox', 'zebra', 'elephant',
)


def _charger():
    from tensorflow.keras.applications import MobileNetV3Large
    from tensorflow.keras.applications.mobilenet_v3 import decode_predictions
    m = MobileNetV3Large(weights='imagenet', include_top=True)
    return m, decode_predictions


def juger(noms_scores, seuil):
    """Rend (verdict, explication).

    verdict vaut 'aliment', 'incertain' (donc garde) ou 'pas_un_aliment'.
    """
    aliment = sum(s for n, s in noms_scores
                  if any(m in n for m in MOTS_ALIMENT))
    pas = [(n, s) for n, s in noms_scores
           if any(m in n for m in MOTS_CERTAINEMENT_PAS)
           or any(m in n for m in LIEUX_PAS_PLATS)]
    force_pas = sum(s for _, s in pas)

    if aliment >= seuil:
        return 'aliment', 'aliment=%.2f' % aliment
    # ⚠ On n'ecarte que si le NON est franc ET le OUI est faible. Un plat
    # inconnu d'ImageNet rend des scores disperses : il tombe en « incertain »
    # et il est GARDE.
    if force_pas >= seuil and force_pas > aliment * 2:
        return 'pas_un_aliment', '%s=%.2f (aliment=%.2f)' % (pas[0][0], force_pas, aliment)

    # ⚠ LA REGLE GENERALE, AJOUTEE LE 08/09/2026 — ET LA RAISON DE L'INVERSION.
    # Une liste noire de mots est perdue d'avance : elle ne contenait ni
    # « vault » (une cave voutee rangee sous `apple`, ImageNet a 0,76), ni
    # « altar » (une fresque d'eglise sous `lentils`, a 0,89), ni « ringlet »
    # (un papillon de nuit sous `sellou`, a 0,78). Je n'aurais jamais devine ces
    # trois mots-la, et il en reste mille autres.
    #
    # On renverse donc la charge : quand ImageNet est TRES SUR de lui (top-1
    # eleve) et que RIEN d'alimentaire n'apparait dans ses huit premieres
    # reponses, l'image n'est pas un plat — quel que soit le mot. Peu importe
    # que ce soit une voute, un autel ou un lepidoptere.
    #
    # ⚠ ET LA CONDITION INVERSE PROTEGE LES PLATS INCONNUS.
    # Un plat marocain qu'ImageNet ne connait pas rend des scores DISPERSES :
    # son top-1 reste bas (le tajine correct de l'echantillon plafonnait a 0,08).
    # Il ne declenche donc pas cette regle, et reste garde. C'est la confiance
    # du modele exterieur, pas notre ignorance, qui tranche.
    top1_nom, top1_score = noms_scores[0]
    if top1_score >= 0.50 and aliment < 0.05:
        return 'pas_un_aliment', ('%s=%.2f, aucun mot alimentaire dans le top 8'
                                  % (top1_nom, top1_score))
    return 'incertain', 'aliment=%.2f, contre=%.2f' % (aliment, force_pas)


def images_de(dossier):
    for f in sorted(os.listdir(dossier)):
        if f.lower().endswith(('.jpg', '.jpeg', '.png')):
            yield f


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    dossier = sys.argv[1]
    appliquer = '--appliquer' in sys.argv
    seuil = 0.30
    if '--seuil' in sys.argv:
        seuil = float(sys.argv[sys.argv.index('--seuil') + 1])

    from tensorflow.keras.preprocessing import image as kimage
    modele, decode = _charger()

    fichiers = list(images_de(dossier))
    print('  %d images, seuil %.2f, mode %s\n'
          % (len(fichiers), seuil, 'APPLIQUER' if appliquer else 'constat seul'))

    verdicts = {}
    comptes = {'aliment': 0, 'incertain': 0, 'pas_un_aliment': 0, 'illisible': 0}
    LOT = 64
    for debut in range(0, len(fichiers), LOT):
        lot = fichiers[debut:debut + LOT]
        tableau, gardes = [], []
        for f in lot:
            try:
                im = kimage.load_img(os.path.join(dossier, f), target_size=(224, 224))
                tableau.append(kimage.img_to_array(im))
                gardes.append(f)
            except Exception:
                verdicts[f] = ('illisible', '')
                comptes['illisible'] += 1
        if not tableau:
            continue
        # MobileNetV3 porte sa normalisation dans le modele : on donne du 0-255.
        p = modele.predict(np.stack(tableau), verbose=0)
        for f, ligne in zip(gardes, decode(p, top=8)):
            noms = [(n.replace('_', ' ').lower(), float(s)) for (_, n, s) in ligne]
            v, expl = juger(noms, seuil)
            verdicts[f] = (v, expl + ' | ' + ', '.join('%s %.2f' % x for x in noms[:3]))
            comptes[v] += 1
        if debut and debut % (LOT * 8) == 0:
            print('    ... %d/%d' % (debut, len(fichiers)))

    print('\n  aliment        %d' % comptes['aliment'])
    print('  incertain      %d  (gardees : ImageNet ne connait pas ces plats)' % comptes['incertain'])
    print('  PAS un aliment %d' % comptes['pas_un_aliment'])
    if comptes['illisible']:
        print('  illisibles     %d' % comptes['illisible'])

    rejetes = [f for f, (v, _) in verdicts.items() if v == 'pas_un_aliment']
    if rejetes:
        print('\n  exemples ecartes :')
        for f in rejetes[:15]:
            print('    %-40s %s' % (f[:40], verdicts[f][1][:70]))

    if appliquer and rejetes:
        cible = os.path.join(dossier, 'rejets', 'pas_un_aliment')
        os.makedirs(cible, exist_ok=True)
        for f in rejetes:
            try:
                shutil.move(os.path.join(dossier, f), os.path.join(cible, f))
            except Exception:
                pass
        print('\n  %d images deplacees dans %s' % (len(rejetes), cible))

    io.open(os.path.join(dossier, 'verdicts-aliment.json'), 'w', encoding='utf-8').write(
        json.dumps({f: {'verdict': v, 'pourquoi': e} for f, (v, e) in verdicts.items()},
                   ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
