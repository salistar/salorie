# -*- coding: utf-8 -*-
"""Ecrit lib/foodSalorieNoms.ts depuis names_172.json.

POURQUOI CE FICHIER DOIT EXISTER
Le modele rend un identifiant ANGLAIS (`feet of beef`). La base hors ligne du
telephone est en FRANCAIS depuis le 09/09/2026 (`Pieds de veau`) — c'est ce que
l'utilisateur doit lire. Sans table de correspondance, le telephone cherche
« feet of beef » dans une base qui dit « Pieds de veau » et ne trouve rien :
mesure faite, 93 classes sur 172 perdaient leurs macros hors ligne.

⚠ GENERE, JAMAIS ECRIT A LA MAIN.
Trois fichiers doivent rester d'accord : `names_172.json` (serveur),
`assets/data/local-foods.json` (macros du telephone) et celui-ci. Les tenir a
jour separement, c'est se garantir qu'ils divergeront — le projet a deja paye
cette lecon avec les deux listes d'etiquettes, ou un decalage d'un rang faisait
dire « harira » a un tajine.

Usage :  python food4k/generer_noms_telephone.py
"""
import io
import json
import os
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.abspath(os.path.join(ICI, '..'))
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


def main():
    noms = json.load(io.open(os.path.join(ICI, 'names_172.json'), encoding='utf-8'))
    classes = json.load(io.open(os.path.join(ICI, 'label_map_172.json'),
                                encoding='utf-8'))['classes']

    manquantes = [c for c in classes if not isinstance(noms.get(c), dict)]
    if manquantes:
        print('  ARRET : %d classes sans entree dans names_172.json : %s'
              % (len(manquantes), ', '.join(manquantes[:8])))
        return 1

    lignes = [
        "// Noms affichables des classes du modele embarque — FR et AR.",
        "//",
        "// ⚠ FICHIER GENERE par food4k/generer_noms_telephone.py. Ne pas editer :",
        "//   la source est food4k/names_172.json, et trois fichiers doivent rester",
        "//   d'accord (celui-ci, names_172.json, et assets/data/local-foods.json).",
        "//",
        "// POURQUOI IL EXISTE. Le modele rend un identifiant anglais (`feet of",
        "// beef`) ; la base hors ligne et l'ecran sont en francais (`Pieds de",
        "// veau`). Sans cette table, `localMacroForLabel` cherchait l'anglais dans",
        "// une base francaise : 93 classes sur 172 perdaient leurs macros hors",
        "// ligne — mesure le 09/09/2026, apres la francisation de la base.",
        "export const FOOD_SALORIE_NOMS: Record<string, { fr: string; ar: string }> = {",
    ]
    for c in classes:
        e = noms[c]
        lignes.append('  %s: { fr: %s, ar: %s },' % (
            json.dumps(c, ensure_ascii=False),
            json.dumps((e.get('fr') or c).strip(), ensure_ascii=False),
            json.dumps((e.get('ar') or '').strip(), ensure_ascii=False)))
    lignes += ['};', '']

    chemin = os.path.join(RACINE, 'lib', 'foodSalorieNoms.ts')
    io.open(chemin, 'w', encoding='utf-8', newline='\n').write('\n'.join(lignes))
    sans_ar = sum(1 for c in classes if not (noms[c].get('ar') or '').strip())
    print('  lib/foodSalorieNoms.ts ecrit : %d classes' % len(classes))
    print('  %d sans nom arabe' % sans_ar)
    return 0


if __name__ == '__main__':
    sys.exit(main())
