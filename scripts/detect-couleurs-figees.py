# -*- coding: utf-8 -*-
"""Cherche les couleurs qui NE BASCULENT PAS en mode sombre.

Signature recherchee : un fond CLAIR ecrit en dur dans une feuille de style, au sein
d'un ecran qui sait pourtant basculer (il lit `isDark`), et dont la cle de style
n'est JAMAIS surchargee en ligne.

Les deux raffinements viennent de faux positifs constates :
  1. `safe: { backgroundColor: '#F8FAFC' }` n'est pas un defaut quand l'ecran ecrit
     `style={[styles.safe, { backgroundColor: bg }]}` — c'est un defaut par defaut,
     que personne ne voit jamais ;
  2. la feuille n'est pas toujours nommee `styles` : `adaptive-tdee` l'appelle `s`.
     Chercher `styles.<cle>` y declarait donc neuf defauts inexistants.

Usage :  python scripts/detect-couleurs-figees.py [--details]
"""
import io, re, sys, glob

def luminance(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c * 2 for c in h)
    if len(h) < 6: return None
    try: r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    except ValueError: return None
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")
CLE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{")
ALIAS = re.compile(r"(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*StyleSheet\.create")

details = '--details' in sys.argv
reels, ecartes = [], 0

for f in sorted(glob.glob('app/**/*.tsx', recursive=True) + glob.glob('components/**/*.tsx', recursive=True)):
    src = io.open(f, encoding='utf-8').read()
    if 'isDark' not in src: continue
    # Tous les noms sous lesquels la feuille peut etre referencee dans CE fichier.
    alias = set(ALIAS.findall(src)) or {'styles'}
    cle = None
    for i, ligne in enumerate(src.split('\n'), 1):
        m = CLE.match(ligne)
        if m: cle = m.group(1)
        if 'isDark' in ligne or 'resolved' in ligne or 'shadowColor' in ligne: continue
        if 'backgroundColor' not in ligne and 'borderColor' not in ligne: continue
        for h in HEX.findall(ligne):
            L = luminance(h)
            if L is None or L <= 0.75: continue
            surcharge = cle and any(
                re.search(r"%s\.%s\s*,\s*\{[^}]*(backgroundColor|borderColor)" % (re.escape(a), re.escape(cle)), src)
                for a in alias)
            if surcharge:
                ecartes += 1
                continue
            reels.append((f, i, h, cle, ligne.strip()[:70]))

par_f = {}
for f, i, h, k, l in reels: par_f.setdefault(f, []).append((i, h, k, l))
print("Ecartes (cle surchargee en ligne) : %d" % ecartes)
print("Fonds clairs figes restants : %d occurrences dans %d fichiers\n" % (len(reels), len(par_f)))
for f in sorted(par_f, key=lambda k: -len(par_f[k]))[:15 if not details else 999]:
    print("%2d  %s" % (len(par_f[f]), f))
    if details:
        for i, h, k, l in par_f[f]:
            print("      L%-5d %-9s cle=%-18s %s" % (i, h, k, l))
