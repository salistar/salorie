# -*- coding: utf-8 -*-
"""Planches-contacts des images utilisees, pour une revue visuelle reelle.

POURQUOI
Le manifeste porte 94 images « pas encore regardees ». Les declarer conformes
sans les voir serait exactement l'erreur que ce manifeste denonce : les noms
mentent (weightlifting.jpg est une photo de vagues). Mais les ouvrir une par
une n'a pas de sens non plus.

Une planche-contact permet de TOUTES les voir, avec leur nom sous chacune, donc
de rendre un verdict qui se rattache a un fichier precis.

Usage : python scripts/planches-contacts.py
"""
import io
import json
import os
from PIL import Image, ImageDraw, ImageFont

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES = os.path.join(RACINE, 'assets', 'images')
SORTIE = os.path.join(RACINE, '..', 'planches')
SORTIE = os.path.abspath(os.path.join(
    os.environ.get('TEMP', RACINE), 'planches-salorie'))

COLS, LIGNES = 4, 5
CELL_L, CELL_H = 300, 210
LABEL_H = 26
MARGE = 8

manifeste = json.load(io.open(
    os.path.join(RACINE, 'assets', 'images.manifest.json'), encoding='utf-8'))

# On ne represente QUE ce qui n'a pas encore de verdict : revoir ce qui a deja
# ete juge ferait perdre du temps et brouillerait la lecture.
a_revoir = sorted(
    k for k, v in manifeste['images'].items()
    if v.get('conforme') is None and v.get('existe')
)

try:
    police = ImageFont.truetype('arial.ttf', 13)
except Exception:
    police = ImageFont.load_default()

par_planche = COLS * LIGNES
os.makedirs(SORTIE, exist_ok=True)
planches = []

for debut in range(0, len(a_revoir), par_planche):
    lot = a_revoir[debut:debut + par_planche]
    L = COLS * (CELL_L + MARGE) + MARGE
    H = LIGNES * (CELL_H + LABEL_H + MARGE) + MARGE
    planche = Image.new('RGB', (L, H), (245, 246, 248))
    d = ImageDraw.Draw(planche)

    for i, cle in enumerate(lot):
        cx = MARGE + (i % COLS) * (CELL_L + MARGE)
        cy = MARGE + (i // COLS) * (CELL_H + LABEL_H + MARGE)
        try:
            im = Image.open(os.path.join(IMAGES, cle)).convert('RGB')
            im.thumbnail((CELL_L, CELL_H), Image.LANCZOS)
            planche.paste(im, (cx + (CELL_L - im.width) // 2,
                               cy + (CELL_H - im.height) // 2))
        except Exception as e:
            d.rectangle([cx, cy, cx + CELL_L, cy + CELL_H], fill=(220, 220, 224))
            d.text((cx + 8, cy + 8), 'illisible', fill=(150, 30, 30), font=police)

        # Le NUMERO autant que le nom : c'est lui qui permet de rendre un
        # verdict sans ambiguite quand deux noms se ressemblent.
        etiquette = '%d. %s' % (debut + i + 1, cle)
        d.rectangle([cx, cy + CELL_H, cx + CELL_L, cy + CELL_H + LABEL_H], fill=(232, 234, 238))
        d.text((cx + 5, cy + CELL_H + 6), etiquette[:44], fill=(28, 33, 40), font=police)

    chemin = os.path.join(SORTIE, 'planche-%02d.jpg' % (debut // par_planche + 1))
    planche.save(chemin, 'JPEG', quality=88, optimize=True)
    planches.append(chemin)
    print('  %s  —  images %d a %d' % (os.path.basename(chemin), debut + 1, debut + len(lot)))

print('')
print('  %d images a revoir, %d planches' % (len(a_revoir), len(planches)))
print('  dossier : %s' % SORTIE)
