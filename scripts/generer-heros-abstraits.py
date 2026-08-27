# -*- coding: utf-8 -*-
"""Genere les visuels d'en-tete abstraits, conformes par construction.

POURQUOI DE L'ABSTRAIT
La politique d'images interdit toute personne identifiable. Quatre photos en
violaient la regle sur douze emplacements. Plutot que d'aller chercher des
photos libres de droits — qu'il faudrait verifier une a une, et re-verifier a
chaque remplacement — on genere des visuels qui ne peuvent PAS contenir de
personne. La conformite devient structurelle, pas declarative.

LE NOM DIT L'USAGE, PAS LE CONTENU
`weightlifting.jpg` est une photo de vagues, `gain_weight.jpg` montre des
cordes de battle rope. Les noms mentaient, et un audit par nom serait passe a
cote des vraies violations. Ces fichiers sont donc nommes par leur EMPLACEMENT.

Usage : python scripts/generer-heros-abstraits.py
"""
import json
import io
import math
import os
from PIL import Image, ImageDraw, ImageFilter

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, 'assets', 'images', 'abstraits')
THEMES = json.load(io.open(os.path.join(RACINE, 'design', 'themes.json'), encoding='utf-8'))['themes']

L, H = 1200, 800


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def melange(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def degrade(debut, fin):
    """Degrade diagonal. Calcule sur une petite image puis agrandi : 960 000
    pixels dessines un par un prennent des secondes, la version reduite quelques
    millisecondes, et le resultat est identique une fois lisse."""
    p = Image.new('RGB', (64, 64))
    px = p.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126.0
            px[x, y] = melange(debut, fin, t)
    return p.resize((L, H), Image.BICUBIC)


def formes(img, accent, densite=7):
    """Cercles concentriques translucides — une geometrie sobre qui donne de la
    profondeur sans jamais evoquer une silhouette."""
    couche = Image.new('RGBA', (L, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(couche)
    cx, cy = int(L * 0.72), int(H * 0.34)
    for i in range(densite):
        r = 90 + i * 78
        alpha = max(6, 40 - i * 5)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=accent + (alpha,), width=3)
    couche = couche.filter(ImageFilter.GaussianBlur(0.6))
    img = img.convert('RGBA')
    img.alpha_composite(couche)
    return img.convert('RGB')


# Chaque entree : (nom de fichier, theme dont on emprunte les couleurs, usage).
# On emprunte au theme pour que le visuel s'accorde a la marque, sans pour autant
# devoir en generer six versions : ces images servent de fond, sous un voile.
VISUELS = [
    ('hero-connexion', 'obsidian', "ecran de connexion"),
    ('hero-duel', 'ocean', "duel 1 contre 1"),
    ('hero-seance', 'obsidian', "seance et entrainement"),
    ('hero-sante', 'ivory', "synchronisation sante"),
    ('hero-progression', 'gold', "progression et poids"),
]

os.makedirs(SORTIE, exist_ok=True)
for nom, cle, usage in VISUELS:
    t = THEMES[cle]
    debut = hexrgb(t['bg'])
    fin = hexrgb(t['surface2'])
    img = degrade(debut, fin)
    img = formes(img, hexrgb(t['accent']))
    chemin = os.path.join(SORTIE, nom + '.jpg')
    img.save(chemin, 'JPEG', quality=86, optimize=True, progressive=True)
    print('  %-20s %-22s %6.0f Ko' % (nom + '.jpg', usage, os.path.getsize(chemin) / 1024))

print('\n  %d visuels dans assets/images/abstraits/' % len(VISUELS))
print('  Aucune personne possible : ils sont calcules, pas photographies.')
