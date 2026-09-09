# -*- coding: utf-8 -*-
"""La chaine complete : moissonner, controler, completer, entrainer.

POURQUOI UNE CHAINE, ET PAS SIX COMMANDES
Chaque etape depend de la precedente d'une facon qu'on oublie en trois jours :
le controle qualite doit passer AVANT la separation entrainement/validation,
la verification de fuite AVANT l'entrainement, et la mesure du candidat sur un
corpus qu'il n'a jamais vu. Un ordre inverse ne provoque aucune erreur visible —
il produit un chiffre flatteur et faux. L'ordre est donc inscrit ici, une fois.

L'ORDRE, ET CE QUE CHAQUE ETAPE PROTEGE
  1. moisson            construire-corpus-plus.js (Wikimedia + Openverse),
                        completer-openverse.js (par BESOIN, pas par ordre
                        alphabetique), construire-corpus-web.js (sans licence,
                        en dernier recours). Toutes reprennent ou elles se
                        sont arretees.
  2. controle mecanique verifier_images.py — illisibles, minuscules, quasi-
                        doublons INTERNES (fuite entre les deux partitions)
  3. controle semantique detecter_non_aliment.py — le fort de Bahla n'est pas
                        une patisserie
  4. controle de fuite  verifier_fuite.py — aucune image de mesure dans
                        l'entrainement, sinon tous les chiffres mentent
  4bis. normalisation   normaliser_images.py — un fichier .jpg peut etre un
                        WEBP : PIL l'accepte, le decodeur de TensorFlow non
  5. preparation        preparer-entrainement.js — partition deterministe
  6. entrainement       entrainer_modele.py — reglage fin, classes maigres
                        ecartees explicitement
  7. jugement           valider_modele.py sur corpus-ia — le SEUL chiffre
                        comparable a celui du modele en place

⚠ CE SCRIPT NE DEPLOIE RIEN.
Il produit un candidat et son score. Remplacer le modele du telephone est une
decision, pas une etape : elle demande que le candidat fasse MIEUX que les
57,4 % du modele en place, et cela se lit dans le rapport final.

Usage :
  python food4k/chaine.py                 # tout, sans rien deplacer
  python food4k/chaine.py --appliquer     # les controles deplacent leurs rejets
  python food4k/chaine.py --depuis 4      # reprendre a partir de l etape 4
  python food4k/chaine.py --etat          # seulement l etat du corpus
"""
import io
import json
import os
import subprocess
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

RACINE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
PYTHON = sys.executable
CORPUS_ENTRAINEMENT = ['corpus-entrainement', 'corpus-maghreb-hf', 'corpus-maghreb-plus',
                       'corpus-web']


def lancer(titre, commande):
    print('\n' + '=' * 74)
    print('  %s' % titre)
    print('=' * 74)
    r = subprocess.run(commande, cwd=RACINE)
    if r.returncode != 0:
        print('\n  /!\\ %s a rendu le code %d' % (titre, r.returncode))
    return r.returncode == 0


def etat():
    """Combien d'images par classe, et surtout : lesquelles manquent encore ?"""
    m = json.load(io.open(os.path.join(RACINE, 'food4k', 'label_map_172.json'),
                          encoding='utf-8'))['classes']
    f101 = set(c.replace('_', ' ').lower() for c in json.load(
        io.open(os.path.join(RACINE, 'food4k', 'label_map.json'), encoding='utf-8'))['classes'])

    compte = {}
    for d in CORPUS_ENTRAINEMENT:
        chemin = os.path.join(RACINE, d)
        if not os.path.isdir(chemin):
            continue
        for nom in os.listdir(chemin):
            if not nom.endswith('.jpg'):
                continue
            # Le nom de fichier porte sa classe ; les trois corpus la codent
            # differemment, et deduire au lieu de lire serait ici sans danger
            # car le nom EST l'etiquette ecrite a la moisson.
            base = nom[:-4]
            if d == 'corpus-entrainement':          # « 076_pizza_12 »
                c = base.split('_', 1)[1].rsplit('_', 1)[0]
            elif d == 'corpus-maghreb-hf':          # « couscous_elhariri16_12 »
                c = base.rsplit('_', 2)[0]
            else:                                    # « tagine_with_beef_3 »
                c = base.rsplit('_', 1)[0]
            c = c.replace('_', ' ').lower()
            compte[c] = compte.get(c, 0) + 1

    inter = [(c, compte.get(c.lower(), 0)) for c in m if c.lower() in f101]
    loc = [(c, compte.get(c.lower(), 0)) for c in m if c.lower() not in f101]

    def bloc(nom, paires, objectif=100):
        v = sorted(n for _, n in paires)
        pret = sum(1 for n in v if n >= objectif)
        print('  %-28s %3d classes, %6d images' % (nom, len(v), sum(v)))
        print('     >= %d images  : %d' % (objectif, pret))
        print('     20 a %-3d      : %d' % (objectif - 1, sum(1 for n in v if 20 <= n < objectif)))
        print('     1 a 19        : %d' % sum(1 for n in v if 0 < n < 20))
        print('     zero          : %d' % sum(1 for n in v if n == 0))
        print('     mediane       : %d' % (v[len(v) // 2] if v else 0))

    print('\n  ── etat du corpus d entrainement ──')
    bloc('Food-101 (international)', inter)
    print()
    bloc('marocaines / MENA', loc)
    manquantes = sorted((n, c) for c, n in loc if n < 20)
    if manquantes:
        print('\n  les %d classes marocaines encore sous 20 images :' % len(manquantes))
        for n, c in manquantes[:30]:
            print('     %-38s %d' % (c[:38], n))
    return loc


def main():
    appliquer = '--appliquer' in sys.argv
    depuis = 1
    if '--depuis' in sys.argv:
        depuis = int(sys.argv[sys.argv.index('--depuis') + 1])
    if '--etat' in sys.argv:
        etat()
        return 0

    a = ['--appliquer'] if appliquer else []

    if depuis <= 1:
        lancer('1. moisson elargie (reprend ou elle s etait arretee)',
               ['node', 'scripts/construire-corpus-plus.js', '200'])
    if depuis <= 2:
        for d in ('corpus-maghreb-plus', 'corpus-web', 'corpus-maghreb-hf'):
            if os.path.isdir(os.path.join(RACINE, d)):
                lancer('2. controle mecanique — %s' % d,
                       [PYTHON, 'food4k/verifier_images.py', d] + a)
    if depuis <= 3:
        # corpus-web EN PREMIER : c'est celui dont l'etiquette n'a aucune
        # caution humaine, donc celui qui a le plus besoin d'un juge exterieur.
        for d in ('corpus-web', 'corpus-maghreb-plus'):
            if os.path.isdir(os.path.join(RACINE, d)):
                lancer('3. controle semantique — %s' % d,
                       [PYTHON, 'food4k/detecter_non_aliment.py', d] + a)
    if depuis <= 4:
        lancer('4. controle de fuite entrainement / mesure',
               [PYTHON, 'food4k/verifier_fuite.py'] + a)
        # ⚠ AVANT la preparation, jamais apres. Des fichiers nommes .jpg mais
        # encodes en WEBP, PNG ou CMJN passent tous les controles precedents —
        # PIL les ouvre sans broncher — et font echouer l'entrainement APRES
        # vingt minutes de mise en cache, sur « Number of channels requested
        # does not match input ». Constate le 08/09/2026 : 1 049 fichiers.
        lancer('4 bis. normalisation en vrai JPEG RGB',
               [PYTHON, 'food4k/normaliser_images.py'], 40)
    if depuis <= 5:
        lancer('5. preparation du jeu (partition deterministe)',
               ['node', 'scripts/preparer-entrainement.js'])
    if depuis <= 6:
        jeu = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser('~')),
                           'Desktop', 'salorie-entrainement')
        lancer('6. entrainement (reglage fin)',
               [PYTHON, 'food4k/entrainer_modele.py', jeu, '--mini', '20'])
    if depuis <= 7:
        candidat = os.path.join(RACINE, 'food4k', 'modele_entraine')
        if os.path.exists(os.path.join(candidat, 'modele.tflite')):
            # ⚠ `comparer_modeles.py`, PAS `valider_modele.py`.
            # Le second ecarte les images dont la classe est absente du modele :
            # un candidat a moins de classes y passe un examen plus facile, et
            # son score n'est pas comparable a celui du modele en place.
            lancer('7. les deux modeles sur LES MEMES images',
                   [PYTHON, 'food4k/comparer_modeles.py',
                    os.path.join(candidat, 'modele.tflite'),
                    os.path.join(candidat, 'etiquettes.json'), '--seuil', '0.50'])
        else:
            print('\n  pas de candidat a juger : l etape 6 n a pas produit de modele.')

    etat()
    print('\n  Le modele en place fait 57,4 % global, 71,9 % au-dessus de son seuil.')
    print('  Ne remplacer que si le candidat fait MIEUX sur corpus-ia.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
