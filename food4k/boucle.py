# -*- coding: utf-8 -*-
"""Moissonner, controler, recommencer — jusqu'a l'objectif ou jusqu'au mur.

POURQUOI UNE BOUCLE ET PAS UNE PASSE
Les deux sources restantes ont des limites qui se rouvrent avec le temps, pas
avec l'insistance :
  Openverse       190 requetes par JOUR en anonyme. Une passe sert une douzaine
                  de classes ; il faut revenir.
  Recherche web   le moteur bloque au bout de ~400 images, puis rouvre. Insister
                  tout de suite ne rend rien ; attendre rend a nouveau.
Une boucle qui repasse, controle, et mesure le progres reel est donc la seule
forme honnete de « jusqu'a 200 par classe ».

⚠ ELLE S'ARRETE QUAND ELLE N'AVANCE PLUS, ET ELLE DIT POURQUOI.
Un tour qui n'ajoute rien signifie l'une de deux choses, et elles n'appellent pas
la meme suite :
  - les quotas sont epuisES  -> revenir demain sert
  - les fonds sont vides     -> revenir ne servira jamais
Le compte rendu final separe les deux. Confondre « je n'ai pas pu voir » et
« il n'y a rien » est l'erreur que ce projet a deja payee deux fois.

Usage :
  python food4k/boucle.py [--tours 6] [--objectif 200] [--attente 20]
  --attente : minutes de pause entre deux tours (les quotas se rouvrent)
"""
import argparse
import io
import json
import os
import subprocess
import sys
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.abspath(os.path.join(ICI, '..'))
PYTHON = sys.executable
CORPUS = ['corpus-entrainement', 'corpus-maghreb-hf', 'corpus-maghreb-plus', 'corpus-web']


def lancer(titre, commande, minutes=90):
    print('\n  --- %s ---' % titre, flush=True)
    try:
        r = subprocess.run(commande, cwd=RACINE, timeout=minutes * 60,
                           capture_output=True, text=True,
                           encoding='utf-8', errors='replace')
        # On n'imprime que la fin : ces outils sont bavards, et c'est leur
        # conclusion qui compte pour decider du tour suivant.
        print('\n'.join((r.stdout or '').splitlines()[-14:]), flush=True)
        return r.stdout or ''
    except subprocess.TimeoutExpired:
        print('  (interrompu apres %d min — le tour suivant reprendra)' % minutes, flush=True)
        return ''


def compter():
    """Images par classe, lues sur le disque. Le nom de fichier EST l'etiquette."""
    m = json.load(io.open(os.path.join(ICI, 'label_map_172.json'),
                          encoding='utf-8'))['classes']
    f101 = set(c.replace('_', ' ').lower() for c in json.load(
        io.open(os.path.join(ICI, 'label_map.json'), encoding='utf-8'))['classes'])
    compte = {}
    for d in CORPUS:
        chemin = os.path.join(RACINE, d)
        if not os.path.isdir(chemin):
            continue
        for nom in os.listdir(chemin):
            if not nom.endswith('.jpg'):
                continue
            base = nom[:-4]
            if d == 'corpus-entrainement':
                c = base.split('_', 1)[1].rsplit('_', 1)[0]
            elif d == 'corpus-maghreb-hf':
                c = base.rsplit('_', 2)[0]
            else:
                c = base.rsplit('_', 1)[0]
            c = c.replace('_', ' ').lower()
            compte[c] = compte.get(c, 0) + 1
    return {c: compte.get(c.lower(), 0) for c in m if c.lower() not in f101}


def resume(loc, objectif):
    v = sorted(loc.values())
    return {
        'total': sum(v),
        'atteintes': sum(1 for x in v if x >= objectif),
        'centaine': sum(1 for x in v if x >= 100),
        'vingtaine': sum(1 for x in v if x >= 20),
        'zero': sum(1 for x in v if x == 0),
        'mediane': v[len(v) // 2] if v else 0,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tours', type=int, default=6)
    ap.add_argument('--objectif', type=int, default=200)
    ap.add_argument('--attente', type=int, default=20)
    a = ap.parse_args()

    print('  objectif : %d images par classe' % a.objectif)
    print('  %d tours au plus, %d min de pause entre deux\n' % (a.tours, a.attente))

    avant = resume(compter(), a.objectif)
    print('  depart : %d images, %d classes a l objectif, mediane %d'
          % (avant['total'], avant['atteintes'], avant['mediane']))

    sansProgres = 0
    for tour in range(1, a.tours + 1):
        print('\n' + '=' * 74)
        print('  TOUR %d / %d' % (tour, a.tours))
        print('=' * 74, flush=True)

        # ── moissonner : d'abord sous licence, ensuite seulement le web ──────
        lancer('Openverse, par besoin',
               ['node', 'scripts/completer-openverse.js', str(a.objectif), '190'], 60)
        lancer('recherche web (sans licence)',
               ['node', 'scripts/construire-corpus-web.js', str(a.objectif)], 75)

        # ── controler : sans quoi le compte ci-dessous serait un mensonge ────
        for d in ('corpus-maghreb-plus', 'corpus-web'):
            if os.path.isdir(os.path.join(RACINE, d)):
                lancer('controle mecanique — %s' % d,
                       [PYTHON, 'food4k/verifier_images.py', d, '--appliquer'], 40)
                lancer('controle semantique — %s' % d,
                       [PYTHON, 'food4k/detecter_non_aliment.py', d, '--appliquer'], 60)
        lancer('controle de fuite', [PYTHON, 'food4k/verifier_fuite.py', '--appliquer'], 40)

        apres = resume(compter(), a.objectif)
        gagne = apres['total'] - avant['total']
        print('\n  tour %d : %+d images, %d classes a l objectif, mediane %d'
              % (tour, gagne, apres['atteintes'], apres['mediane']), flush=True)

        if apres['atteintes'] >= 71:
            print('\n  OBJECTIF ATTEINT sur les 71 classes.')
            break
        # Un gain nul deux fois de suite : les quotas ne se rouvrent pas assez
        # vite, ou les fonds sont vides. Insister ne sert plus a rien.
        sansProgres = sansProgres + 1 if gagne <= 0 else 0
        avant = apres
        if sansProgres >= 2:
            print('\n  ARRET : deux tours sans le moindre gain.')
            break
        if tour < a.tours:
            print('  pause de %d min — les quotas se rouvrent avec le temps' % a.attente,
                  flush=True)
            time.sleep(a.attente * 60)

    # ── Le compte rendu qui distingue les deux murs ─────────────────────────
    loc = compter()
    fin = resume(loc, a.objectif)
    print('\n' + '=' * 74)
    print('  %d images marocaines, mediane %d' % (fin['total'], fin['mediane']))
    print('    %d classes >= %d   (objectif)' % (fin['atteintes'], a.objectif))
    print('    %d classes >= 100' % fin['centaine'])
    print('    %d classes >= 20    (le seuil d admission a l entrainement)' % fin['vingtaine'])
    print('    %d classes a zero' % fin['zero'])
    manquantes = sorted((n, c) for c, n in loc.items() if n < 20)
    if manquantes:
        print('\n  les %d classes sous 20 images — celles que le modele ecartera :'
              % len(manquantes))
        for n, c in manquantes:
            print('     %-38s %d' % (c[:38], n))
    print('\n  Suite : python food4k/chaine.py --depuis 5 --appliquer')
    print('  (preparation du jeu, entrainement, puis mesure contre les 57,4 %)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
