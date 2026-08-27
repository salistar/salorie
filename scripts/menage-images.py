# -*- coding: utf-8 -*-
"""Retire les images qu'aucun code n'appelle.

⚠ POURQUOI CE N'EST PAS UN SIMPLE `rm`
`assetBundlePatterns` contient `assets/images/**/*` : TOUT le dossier part dans
l'APK, que le code s'en serve ou non. C'est pour cela que 113 images inutilisees
pesaient dans le binaire sans que rien ne le signale.

Mais « non reference dans le code » ne veut pas dire « inutile » :
  · app.json cite directement les icones et le splash ;
  · une image peut servir de repli, ou etre citee hors TypeScript.

On EXCLUT donc explicitement ce qui est protege, et on ne touche a rien d'autre
que ce que le manifeste liste comme non utilise.

Usage :
  python scripts/menage-images.py            liste, ne supprime rien
  python scripts/menage-images.py --appliquer supprime
"""
import io
import json
import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES = os.path.join(RACINE, 'assets', 'images')
MANIFESTE = os.path.join(RACINE, 'assets', 'images.manifest.json')

m = json.load(io.open(MANIFESTE, encoding='utf-8'))
candidates = list(m.get('imagesNonUtilisees', []))

# ── Ce qu'on ne touche JAMAIS ───────────────────────────────────────────────
app_json = io.open(os.path.join(RACINE, 'app.json'), encoding='utf-8').read()
cites = set(
    c.lstrip('./').replace('assets/images/', '')
    for c in re.findall(r'\./?assets/images/[^"]+\.(?:png|jpg)', app_json)
)

# Les icones et ecrans de lancement sont lus par le systeme, jamais par le code :
# aucun balayage de source ne peut les voir. Les supprimer casse le build.
PROTEGES_MOTIF = re.compile(
    r'(icon|favicon|splash|adaptive|notification|logo)', re.I)

garde, supprime = [], []
for rel in candidates:
    if rel in cites or PROTEGES_MOTIF.search(rel):
        garde.append(rel)
    else:
        supprime.append(rel)

poids = 0
for rel in supprime:
    p = os.path.join(IMAGES, rel)
    if os.path.exists(p):
        poids += os.path.getsize(p)

print('  candidates                : %d' % len(candidates))
print('  PROTEGEES (app.json/icones): %d' % len(garde))
for g in sorted(garde):
    print('      garde : %s' % g)
print('  a supprimer               : %d  (%.1f Mo)' % (len(supprime), poids / 1048576.0))

if '--appliquer' not in sys.argv:
    print('')
    print('  Rien supprime. Relancer avec --appliquer.')
    raise SystemExit(0)

n = 0
for rel in supprime:
    p = os.path.join(IMAGES, rel)
    if os.path.exists(p):
        os.remove(p)
        n += 1

# Les dossiers devenus vides ne servent qu'a tromper la lecture.
for base, dirs, fichiers in os.walk(IMAGES, topdown=False):
    if not dirs and not fichiers and base != IMAGES:
        os.rmdir(base)

print('')
print('  %d fichiers supprimes, %.1f Mo liberes de l APK' % (n, poids / 1048576.0))
