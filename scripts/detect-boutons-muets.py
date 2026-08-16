# -*- coding: utf-8 -*-
"""Trouve les boutons qui ne disent RIEN a un lecteur d'ecran.

Le bon indicateur n'est pas « combien de accessibilityLabel » — un bouton qui
affiche deja son texte est lu tel quel, et lui ajouter un libelle est au mieux
redondant, au pire trompeur s'il diverge du texte visible.

Le vrai defaut, c'est le bouton a ICONE SEULE sans libelle : TalkBack annonce
« bouton », et rien de plus. Sur un ecran qui en aligne cinq, la personne n'a aucun
moyen de savoir lequel envoie, lequel supprime, lequel revient en arriere.

Usage :  python scripts/detect-boutons-muets.py [--details]
"""
import io, re, sys, glob

OUVRE = re.compile(r'<(TouchableOpacity|Pressable|PressableScale|TouchableHighlight)\b')
# Un composant d'icone : <Camera .../>, <ChevronRight .../> — nom capitalise, sans
# enfants. La liste lucide-react-native suit cette convention sans exception.
ICONE = re.compile(r'<[A-Z][A-Za-z0-9]*\s+size=')
TEXTE = re.compile(r'<Text[\s>]|<Trans[\s>]')
LIBELLE = re.compile(r'accessibilityLabel')


def bloc(source, debut):
    """Rend le fragment d'un element JSX, de sa balise ouvrante a sa fermeture."""
    prof, i, n = 0, debut, len(source)
    while i < n:
        if source.startswith('</', i):
            prof -= 1
            if prof <= 0:
                return source[debut:source.find('>', i) + 1]
        elif source.startswith('/>', i):
            if prof <= 1:
                return source[debut:i + 2]
            prof -= 1
        elif source[i] == '<' and re.match(r'<[A-Za-z]', source[i:i + 2]):
            prof += 1
        i += 1
    return source[debut:debut + 1200]


muets, avec_texte, deja = [], 0, 0
for f in sorted(glob.glob('app/**/*.tsx', recursive=True) + glob.glob('components/**/*.tsx', recursive=True)):
    src = io.open(f, encoding='utf-8').read()
    for m in OUVRE.finditer(src):
        frag = bloc(src, m.start())
        if LIBELLE.search(frag):
            deja += 1
            continue
        if TEXTE.search(frag):
            # Le texte visible EST le libelle : rien a corriger.
            avec_texte += 1
            continue
        if ICONE.search(frag):
            ligne = src[:m.start()].count('\n') + 1
            ic = ICONE.search(frag).group(0).strip('< ').split()[0]
            muets.append((f, ligne, ic))

par_f = {}
for f, l, i in muets:
    par_f.setdefault(f, []).append((l, i))

print('Boutons deja nommes ........... %d' % deja)
print('Boutons portant un texte visible %d  (rien a faire)' % avec_texte)
print('BOUTONS MUETS (icone seule) ... %d dans %d fichiers\n' % (len(muets), len(par_f)))
details = '--details' in sys.argv
for f in sorted(par_f, key=lambda k: -len(par_f[k]))[:20 if not details else 999]:
    print('%2d  %s' % (len(par_f[f]), f))
    if details:
        for l, i in par_f[f]:
            print('      L%-6d %s' % (l, i))
