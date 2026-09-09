# -*- coding: utf-8 -*-
"""Donne aux 172 classes leur nom français et arabe dans la base du telephone.

⚠ LE DEFAUT, ET POURQUOI IL NE SE VOIT QUE SUR UN TELEPHONE.
`assets/data/local-foods.json` est la base hors ligne que lit l'application
(lib/onDeviceVision.ts). Quelqu'un y a verse les 172 classes du modele en
gardant leur identifiant ANGLAIS dans le champ `n` — celui-la meme qui est
AFFICHE a l'utilisateur. Un Marocain qui scanne des pieds de veau lit donc
« feet of beef », et une chakchouka s'annonce « shakchouka ».

Le lookup, lui, fonctionne : il apparie 170 classes sur 172 et trouve les bonnes
macros. Ce n'est pas la correspondance qui est cassee, c'est le LIBELLE. Une
mesure qui aurait seulement compte les appariements reussis aurait conclu que
tout allait bien — elle l'a d'ailleurs conclu, avant qu'on regarde vers quoi ces
appariements pointaient.

⚠ ON NE TOUCHE QU'AUX ENTREES QUI PORTENT EXACTEMENT UN NOM DE CLASSE.
La base compte 653 aliments ; 481 n'ont rien a voir avec le modele et sont deja
en francais. Les renommer en masse abimerait une base saine pour reparer une
partie.

Usage :  python food4k/franciser_base_locale.py [--appliquer]
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
    appliquer = '--appliquer' in sys.argv
    chemin = os.path.join(RACINE, 'assets', 'data', 'local-foods.json')
    base = json.load(io.open(chemin, encoding='utf-8'))
    noms = json.load(io.open(os.path.join(ICI, 'names_172.json'), encoding='utf-8'))

    # L'index se fait sur le nom EXACT, insensible a la casse. Une correspondance
    # approximative renommerait « Tajine de poulet aux olives » (une entree saine
    # de la base) sous pretexte qu'elle ressemble a la classe `tagine`.
    par_classe = {c.lower(): v for c, v in noms.items() if isinstance(v, dict)}

    renommes, arabise, intacts = [], [], 0
    for it in base:
        n = str(it.get('n', '')).strip()
        e = par_classe.get(n.lower())
        if not e:
            intacts += 1
            continue
        fr = (e.get('fr') or '').strip()
        ar = (e.get('ar') or '').strip()
        # Ne rien changer quand le francais EST l'anglais : `couscous`, `harira`,
        # `pizza` s'ecrivent pareil, et « corriger » ne ferait que changer la
        # casse pour rien.
        if fr and fr.lower() != n.lower():
            renommes.append((n, fr))
            it['n'] = fr
        elif fr:
            # Meme mot, mais la base l'ecrit en minuscules : on prend la graphie
            # de names_172.json, qui porte la majuscule d'affichage.
            if it['n'] != fr:
                renommes.append((n, fr))
                it['n'] = fr
        if ar and not str(it.get('ar', '')).strip():
            arabise.append((it['n'], ar))
            it['ar'] = ar

    print('  %d aliments dans la base, %d sans rapport avec le modele (intacts)'
          % (len(base), intacts))
    print('\n  %d libelles francises :' % len(renommes))
    for avant, apres in renommes[:16]:
        print('     %-32s -> %s' % (avant[:32], apres))
    if len(renommes) > 16:
        print('     ... et %d autres' % (len(renommes) - 16))

    print('\n  %d noms arabes ajoutes :' % len(arabise))
    for n, ar in arabise[:10]:
        print('     %-32s %s' % (n[:32], ar))
    if len(arabise) > 10:
        print('     ... et %d autres' % (len(arabise) - 10))

    reste = [it.get('n') for it in base if not str(it.get('ar', '')).strip()]
    print('\n  %d aliments de la base restent sans nom arabe' % len(reste))
    if reste:
        print('     (hors des 172 classes du modele : %s%s)'
              % (', '.join(str(x)[:22] for x in reste[:6]),
                 ' …' if len(reste) > 6 else ''))

    if not appliquer:
        print('\n  (constat seul — relancer avec --appliquer)')
        return 0
    # ⚠ `indent=0`, LE FORMAT D'ORIGINE DU FICHIER. Ecrire avec `indent=1`
    # reformate les 653 entrees et produit un diff de 10 448 lignes pour 147
    # renommages : le vrai changement devient introuvable en revue, et personne
    # ne peut plus verifier ce qui a ete modifie.
    io.open(chemin, 'w', encoding='utf-8', newline='\n').write(
        json.dumps(base, ensure_ascii=False, indent=0) + '\n')
    print('\n  assets/data/local-foods.json reecrit')
    return 0


if __name__ == '__main__':
    sys.exit(main())
