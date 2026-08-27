# -*- coding: utf-8 -*-
"""Pictogrammes d'exercices — equipement, jamais de personne.

POURQUOI
La revue du 27/08 a trouve 38 photos de demonstration avec des personnes sur les
41 images de la bibliotheque d'exercices. La politique impose, quand un humain
serait indispensable, un pictogramme neutre sans visage.

LE PARTI PRIS : montrer L'EQUIPEMENT.
Un halterophile est reconnaissable ; un halter ne l'est pas. Dessiner des
silhouettes aurait reintroduit le probleme sous une autre forme — une silhouette
reste genree, et la politique les exclut explicitement. L'equipement identifie
l'exercice aussi bien, et il est neutre par nature.

Effet secondaire utile : 38 photos d'origines disparates deviennent une serie
d'un seul style.

Usage : python scripts/generer-pictos-exercices.py
"""
import io
import json
import os
from PIL import Image, ImageDraw

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, 'assets', 'images', 'exercices')
THEMES = json.load(io.open(os.path.join(RACINE, 'design', 'themes.json'), encoding='utf-8'))['themes']

T = 512          # cote de l'image
M = 92           # marge interieure
TRAIT = 22       # epaisseur du trait


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# Le fond est celui du theme clair, l'accent celui du theme clair : ces icones
# sont posees sur des cartes, pas en plein ecran.
FOND = rgb(THEMES['ivory']['accentSoft'])
TRACE = rgb(THEMES['ivory']['accent'])
DOUX = rgb(THEMES['ivory']['accent2'])


def base():
    im = Image.new('RGB', (T, T), FOND)
    return im, ImageDraw.Draw(im)


def barre(d, y, x1=M, x2=T - M, ep=TRAIT, c=TRACE):
    d.rounded_rectangle([x1, y - ep // 2, x2, y + ep // 2], radius=ep // 2, fill=c)


def disque(d, cx, cy, r, c=TRACE):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)


# ── Les formes ──────────────────────────────────────────────────────────────

def halter(d):
    """Un halter court : deux masses, une poignee."""
    cy = T // 2
    barre(d, cy, 170, T - 170, 26)
    for cx in (150, T - 150):
        d.rounded_rectangle([cx - 34, cy - 78, cx + 34, cy + 78], radius=22, fill=TRACE)


def barre_disques(d):
    """Barre olympique chargee."""
    cy = T // 2
    barre(d, cy, M, T - M, 18)
    for cx in (M + 62, T - M - 62):
        d.rounded_rectangle([cx - 20, cy - 104, cx + 20, cy + 104], radius=14, fill=TRACE)
    for cx in (M + 22, T - M - 22):
        d.rounded_rectangle([cx - 15, cy - 66, cx + 15, cy + 66], radius=10, fill=DOUX)


def banc(d):
    """Banc de musculation, vu de profil."""
    d.rounded_rectangle([M, 210, T - M, 262], radius=24, fill=TRACE)
    for x in (M + 34, T - M - 34):
        d.rounded_rectangle([x - 13, 262, x + 13, T - M], radius=10, fill=DOUX)
    d.rounded_rectangle([M - 10, 262, T - M + 10, 286], radius=10, fill=DOUX)


def machine(d):
    """Poulie : un montant, un cable, une poignee."""
    d.rounded_rectangle([M, M, M + 42, T - M], radius=18, fill=TRACE)
    disque(d, M + 21, M + 40, 30, DOUX)
    d.line([M + 21, M + 40, T - M - 60, 200], fill=TRACE, width=12)
    d.rounded_rectangle([T - M - 96, 190, T - M - 24, 214], radius=12, fill=TRACE)
    d.rounded_rectangle([M - 6, T - M - 120, M + 48, T - M], radius=14, fill=DOUX)


def tapis(d):
    """Tapis de sol, deroule."""
    d.rounded_rectangle([M - 20, 240, T - M - 40, 320], radius=18, fill=TRACE)
    disque(d, T - M - 44, 280, 56, DOUX)
    disque(d, T - M - 44, 280, 20, FOND)


def kettlebell(d):
    """⚠ Premiere version lue comme un CADENAS : l'anse etait trop refermee et
    le trou central evoquait une serrure. Anse elargie, ouverte vers le bas, et
    plus de trou — c'est la masse pleine qui fait la kettlebell."""
    cy = 316
    disque(d, T // 2, cy, 118)
    # L'anse deborde la cloche de chaque cote : c'est ce debord qui la rend
    # lisible, une anse plus etroite que la masse ressemble a un fermoir.
    d.arc([T // 2 - 104, cy - 236, T // 2 + 104, cy - 36], 180, 360, fill=TRACE, width=32)
    # Le col, qui relie l'anse a la masse.
    d.rounded_rectangle([T // 2 - 46, cy - 148, T // 2 + 46, cy - 78], radius=16, fill=TRACE)


def velo(d):
    cy = 320
    for cx in (168, T - 168):
        d.ellipse([cx - 84, cy - 84, cx + 84, cy + 84], outline=TRACE, width=22)
    d.line([168, cy, 256, 196], fill=TRACE, width=18)
    d.line([256, 196, T - 168, cy], fill=TRACE, width=18)
    d.line([256, 196, 300, 196], fill=DOUX, width=18)


def piste(d):
    """Piste d'athletisme : deux couloirs et une ligne d'arrivee."""
    for i, y in enumerate((236, 316)):
        barre(d, y, M - 20, T - M + 20, 30, TRACE if i == 0 else DOUX)
    for x in range(M + 10, T - M, 66):
        d.rounded_rectangle([x, 168, x + 16, 200], radius=6, fill=TRACE)


def nage(d):
    """Trois vagues — le couloir de nage."""
    for i, y in enumerate((210, 280, 350)):
        c = TRACE if i % 2 == 0 else DOUX
        pts = []
        for x in range(M - 20, T - M + 21, 8):
            import math
            pts.append((x, y + int(18 * math.sin((x - M) / 44.0))))
        d.line(pts, fill=c, width=22, joint='curve')


def rameur(d):
    """Rame et glissiere."""
    barre(d, 300, M - 20, T - M + 20, 20, DOUX)
    d.line([M + 20, 220, T - M - 20, 380], fill=TRACE, width=22)
    disque(d, M + 20, 220, 26, TRACE)
    disque(d, T - M - 20, 380, 26, TRACE)


def montagne(d):
    """Randonnee : un relief, pas un randonneur."""
    d.polygon([(M - 20, T - M), (200, 170), (300, 300), (350, 236), (T - M + 20, T - M)], fill=TRACE)
    d.polygon([(170, 216), (200, 170), (232, 216), (200, 240)], fill=FOND)


def barre_traction(d):
    """Barre fixe."""
    barre(d, 170, M - 10, T - M + 10, 24)
    for x in (M + 6, T - M - 6):
        d.rounded_rectangle([x - 12, 170, x + 12, T - M], radius=10, fill=DOUX)


# ── Affectation : chaque exercice vers la forme qui l'identifie ─────────────
FORMES = {
    'halter': halter, 'barre': barre_disques, 'banc': banc, 'machine': machine,
    'tapis': tapis, 'kettlebell': kettlebell, 'velo': velo, 'piste': piste,
    'nage': nage, 'rameur': rameur, 'montagne': montagne, 'traction': barre_traction,
}

EXERCICES = {
    'barbell_row': 'barre', 'deadlift': 'barre', 'romanian_dl': 'barre',
    'squat': 'barre', 'squats': 'barre', 'front_raise': 'barre',
    'shoulder_press': 'barre', 'lunges': 'barre',
    'bicep_curl': 'halter', 'hammer_curl': 'halter', 'dumbbell_row': 'halter',
    'lateral_raise': 'halter', 'chest_fly': 'halter', 'preacher_curl': 'halter',
    'bench_press': 'banc', 'incline_bench': 'banc', 'hip_thrust': 'banc',
    'tricep_dips': 'banc',
    'leg_curl': 'machine', 'leg_extension': 'machine', 'leg_press': 'machine',
    'lat_pulldown': 'machine', 'cable_crossover': 'machine',
    'tricep_pushdown': 'machine', 'face_pull': 'machine',
    'crunches': 'tapis', 'plank': 'tapis', 'plankSec': 'tapis',
    'pushups': 'tapis', 'russian_twist': 'tapis', 'abs': 'tapis',
    'bulgarian_split': 'kettlebell', 'calf_raise': 'kettlebell',
    'pullup': 'traction', 'hanging_knee': 'traction',
    'cycling': 'velo', 'running': 'piste', 'walking': 'piste',
    'swimming': 'nage', 'rowing': 'rameur', 'hiking': 'montagne',
}

os.makedirs(SORTIE, exist_ok=True)
for nom, forme in sorted(EXERCICES.items()):
    im, d = base()
    FORMES[forme](d)
    chemin = os.path.join(SORTIE, nom + '.png')
    im.save(chemin, 'PNG', optimize=True)

print('  %d pictogrammes dans assets/images/exercices/' % len(EXERCICES))
print('  %d formes distinctes : %s' % (len(FORMES), ', '.join(sorted(FORMES))))
print('  Aucune personne possible : ce sont des objets, dessines.')


# ── Choix du genre a l'onboarding ───────────────────────────────────────────
# `female.jpg` et `male.jpg` etaient deux PORTRAITS, sur l'un des tout premiers
# ecrans que voit un nouvel utilisateur. Remplaces par les symboles de Mars et
# de Venus : universellement compris, et sans personne a representer — ce qui
# evite au passage de choisir a quoi « un homme » ou « une femme » ressemble.
def symbole_venus(d):
    cx, cy, r = T // 2, 218, 96
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=TRACE, width=30)
    d.line([cx, cy + r, cx, T - M + 6], fill=TRACE, width=30)
    d.line([cx - 62, T - M - 56, cx + 62, T - M - 56], fill=TRACE, width=30)


def symbole_mars(d):
    cx, cy, r = 214, T - 214, 96
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=TRACE, width=30)
    d.line([cx + 62, cy - 62, T - M - 16, M + 16], fill=TRACE, width=30)
    d.line([T - M - 118, M + 16, T - M - 16, M + 16], fill=TRACE, width=30)
    d.line([T - M - 16, M + 16, T - M - 16, M + 118], fill=TRACE, width=30)


for nom, forme in (('genre-femme', symbole_venus), ('genre-homme', symbole_mars)):
    im, d = base()
    forme(d)
    im.save(os.path.join(SORTIE, nom + '.png'), 'PNG', optimize=True)
print('  + 2 symboles de genre (Venus, Mars) — aucun portrait')
