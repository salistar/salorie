# -*- coding: utf-8 -*-
"""Fonds clairs figes qui deviennent VRAIMENT illisibles en mode sombre.

Ce script existe parce que les deux mesures precedentes se sont trompees, chaque
fois en gonflant le chiffre :

  · compter les `'#fff'` d'une feuille de style : 162 « bugs », presque tous faux.
  · ne regarder que les surcharges DANS la feuille de style : 72 « bugs », encore
    faux — la surcharge se fait presque toujours cote JSX, pas dans la feuille :

        card: { backgroundColor: '#fff' }                      <- semble fige
        <View style={[s.card, { backgroundColor: tok.surface }]}>  <- ne l'est pas

Un fond n'est un vrai bug que si AUCUN de ses usages ne le surcharge. On part
donc des USAGES, pas des declarations. Une seule cle utilisee dix fois dont neuf
sont surchargees reste un bug : ce sont les usages nus qu'on compte.

Usage :  python scripts/detect-fonds-figes.py [--detail]
"""
import io, re, sys, glob

CLAIR = re.compile(
    r"backgroundColor:\s*'(#fff|#ffffff|#f8f9fa|#f5f5f5|#fafafa|#f1f5f9|#e2e8f0|white)'", re.I)
# Une cle de feuille de style : `nom: { ... }` au premier niveau du StyleSheet.
CLE = re.compile(r'^\s{0,4}(\w+):\s*\{')
# Un ecran qui ne connait pas le theme est clair de bout en bout : pas de contraste casse.
THEME = re.compile(r'useTheme\(\)|useTokens\(\)')

detail = '--detail' in sys.argv
total_nus = 0
total_morts = 0
fichiers_hors_theme = 0
resultats = []

for f in sorted(glob.glob('app/**/*.tsx', recursive=True)
                + glob.glob('components/**/*.tsx', recursive=True)):
    src = io.open(f, encoding='utf-8').read()
    if not CLAIR.search(src):
        continue
    if not THEME.search(src):
        fichiers_hors_theme += 1
        continue

    lignes = src.split('\n')

    # 1. Les cles de feuille de style dont le fond est clair et fige.
    figees = set()
    for l in lignes:
        m = CLE.match(l)
        if m and CLAIR.search(l):
            figees.add(m.group(1))
    if not figees:
        continue

    # 2. Chaque usage JSX de ces cles : surcharge ou nu ?
    nus = []
    for cle in sorted(figees):
        # `styles.cle` ou `s.cle`, puis le reste du tableau de style jusqu'a `]`.
        for m in re.finditer(r'\b\w+\.' + cle + r'\b([^\]\n]*)', src):
            suite = m.group(1)
            if 'backgroundColor' in suite:
                total_morts += 1
                continue
            ligne = src[:m.start()].count('\n') + 1
            # La declaration elle-meme n'est pas un usage.
            if CLE.match(lignes[ligne - 1] or ''):
                continue
            nus.append((cle, ligne, lignes[ligne - 1].strip()[:88]))

    if nus:
        resultats.append((f, nus))
        total_nus += len(nus)

print('Usages NUS d\'un fond clair fige (vrais candidats) : %d dans %d fichiers'
      % (total_nus, len(resultats)))
print('Usages deja surcharges cote JSX (faux positifs ecartes) : %d' % total_morts)
print('Fichiers sans aucune notion de theme (clairs de bout en bout) : %d' % fichiers_hors_theme)

if detail:
    print()
    for f, nus in resultats:
        print(f)
        for cle, ligne, txt in nus:
            print('   %-22s l.%-6d %s' % (cle, ligne, txt))
