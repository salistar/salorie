# -*- coding: utf-8 -*-
"""Met un modele candidat en place — ou REFUSE, en disant pourquoi.

CE QUE CE SCRIPT PROTEGE
Remplacer le classifieur embarque touche le premier palier de la cascade : celui
qui repond sans reseau, gratuitement, avant le serveur, avant Cloudflare, avant
les fournisseurs. Un candidat qui se degrade n'echoue pas bruyamment — il rend
des reponses plausibles et fausses, et la cascade s'arrete a lui parce qu'il est
sur de lui. C'est pour cela que le deploiement est conditionne a une MESURE, et
non a une intention.

LES QUATRE VERIFICATIONS, ET CE QU'ELLES EMPECHENT
  1. LE CANDIDAT FAIT-IL MIEUX ?     Mesure sur `corpus-ia`, que ni l'un ni
                                     l'autre n'a vu a l'apprentissage. Sans
                                     cela, on remplace un modele mesure par un
                                     modele espere.
  2. LES ETIQUETTES CORRESPONDENT ?  Le modele rend des indices ; ce sont les
                                     etiquettes qui leur donnent un sens. Un
                                     decalage d'UN rang fait dire « harira » a
                                     un tajine, sans aucune erreur visible.
  3. LES DEUX COPIES SONT-ELLES      `food4k/` sert le serveur, `assets/models/`
     IDENTIQUES ?                    part dans l'APK. La CI compare deja leurs
                                     SHA-256 ; les ecrire d'un seul geste evite
                                     le telephone et le serveur en desaccord.
  4. LES DEUX FICHIERS D'ETIQUETTES  `label_map_172.json` (serveur) et
     SONT-ILS D'ACCORD ?             `lib/foodSalorieLabels.ts` (telephone).

⚠ SI LE NOMBRE DE CLASSES CHANGE, TOUT CHANGE.
Un candidat entraine avec `--mini` a moins de classes que les 172 d'origine. Ce
n'est pas un defaut : une classe apprise sur trois images attire a elle les
images des autres et abime le reste. Mais les deux fichiers d'etiquettes et le
modele doivent alors changer ENSEMBLE, et c'est ce que fait ce script.

Usage :
  python food4k/deployer_modele.py food4k/modele_entraine [--appliquer]
Sans `--appliquer`, il mesure et dit ce qu'il ferait, sans rien ecrire.
"""
import io
import json
import os
import re
import shutil
import subprocess
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.abspath(os.path.join(ICI, '..'))

# Le repere historique du modele en place : 57,4 % de justesse globale, mesures
# le 29/08/2026 par food4k/valider_modele.py sur corpus-ia.
#
# ⚠ IL NE SERT PLUS DE BARRE, ET C'EST DELIBERE.
# Ce chiffre porte sur les 172 classes du modele en place. Le comparer au score
# d'un candidat qui en a moins reviendrait a comparer deux examens differents.
# La decision revient a `comparer_modeles.py`, qui interroge les deux modeles
# sur LES MEMES images. Ce nombre reste ici comme repere de lecture, pas comme
# seuil.
JUSTESSE_HISTORIQUE_172_CLASSES = 0.574

CIBLES_MODELE = ['food4k/food_salorie.tflite', 'assets/models/food_salorie.tflite']
CIBLE_LABELS_SERVEUR = 'food4k/label_map_172.json'
CIBLE_LABELS_TELEPHONE = 'lib/foodSalorieLabels.ts'


def assainir(nom):
    """La meme transformation que preparer-entrainement.js applique aux dossiers."""
    return re.sub(r'[^a-z0-9]+', '_', nom, flags=re.I).lower()


def mesurer(tflite, etiquettes):
    """Compare le candidat au modele en place, SUR LES MEMES IMAGES.

    ⚠ CE N'EST PLUS `valider_modele.py` QUI TRANCHE, ET VOICI POURQUOI.
    Ce validateur ecarte les images dont la classe est absente du modele
    (« hors de son domaine, pas sa faute »). C'est juste pour mesurer UN modele,
    et FAUX pour en comparer deux qui n'ont pas le meme nombre de classes : un
    candidat entraine avec `--mini` abandonne les classes maigres, donc n'est
    interroge que sur ce qu'il connait. Moins de classes, moins de facons de se
    tromper, meilleur score.

    Constate le 05/09/2026 sur un modele d'essai a 3 classes : `valider_modele`
    l'interrogeait sur 3 images. La comparaison honnete, sur les 437 images de
    mesure, montrait qu'il servait 76 % des photos avec 0 % de justesse — dont
    331 reponses ASSUREES sur des plats jamais appris. L'ancien garde-fou
    comparait ce modele-la aux 57,4 % du modele en place comme si les deux
    chiffres parlaient de la meme chose.

    `comparer_modeles.py` pose la seule question qui decide : sur les memes
    images, lequel des deux se trompe le moins QUAND IL OSE REPONDRE.
    Il rend 0 si le candidat merite d'etre pose, 1 sinon.
    """
    r = subprocess.run(
        [sys.executable, os.path.join(ICI, 'comparer_modeles.py'), tflite, etiquettes,
         '--seuil', '0.50'],
        cwd=RACINE, capture_output=True, text=True, encoding='utf-8', errors='replace')
    sortie = (r.stdout or '') + (r.stderr or '')
    for ligne in sortie.splitlines():
        if ligne.strip() and 'WARNING' not in ligne and 'absl' not in ligne:
            print(ligne)
    return r.returncode == 0, sortie


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    dossier = sys.argv[1]
    appliquer = '--appliquer' in sys.argv

    tflite = os.path.join(dossier, 'modele.tflite')
    etiquettes = os.path.join(dossier, 'etiquettes.json')
    for f in (tflite, etiquettes):
        if not os.path.exists(f):
            print('  candidat incomplet : %s manque' % f)
            return 1

    candidates = json.load(io.open(etiquettes, encoding='utf-8'))['classes']
    # ⚠⚠ ON VALIDE CONTRE LA CARTE CANONIQUE, PAS CONTRE LE MODELE EN PLACE. ⚠⚠
    # Premiere version : elle lisait `label_map_172.json`, c'est-a-dire le modele
    # ACTUELLEMENT deploye — un fichier que ce script REECRIT lui-meme a chaque
    # bascule. Le vocabulaire ne pouvait donc que retrecir : une classe ecartee
    # une fois faute d'images disparaissait de la reference, et un futur modele
    # qui la ramenait se la voyait refuser comme « inconnue ».
    #
    # Constate le 08/09/2026 : le v1 avait ecarte `bissara` et `sfenj`, trop
    # maigres. Le v2, entraine sur un corpus assaini, les ramenait — et le
    # deployeur les a rejetees, alors qu'il etait lui-meme la cause de leur
    # absence. Un garde-fou qui interdit toute reparation n'est plus un
    # garde-fou : c'est un cliquet.
    officielles = json.load(io.open(os.path.join(ICI, 'classes_officielles.json'),
                                    encoding='utf-8'))['classes']

    # ── 2. Les etiquettes se raccrochent-elles aux noms officiels ? ─────────
    # Le jeu d'entrainement porte des noms de DOSSIERS (« tagine_with_beef ») ;
    # le telephone affiche des noms lisibles (« tagine with beef »). On remonte
    # par la transformation, jamais par une reecriture a la main : « seffa with
    # rice » et « seffa_with_rice » doivent designer la MEME classe, prouvee.
    par_assaini = {assainir(c): c for c in officielles}
    resolues, perdues = [], []
    for c in candidates:
        vrai = par_assaini.get(assainir(c))
        (resolues.append(vrai) if vrai else perdues.append(c))

    print('  candidat : %d classes' % len(candidates))
    print('  modele en place : %d classes' % len(officielles))
    if perdues:
        print('\n  /!\\ %d classes du candidat ne correspondent a AUCUNE classe'
              ' officielle :' % len(perdues))
        for c in perdues[:15]:
            print('       %s' % c)
        print('\n  REFUS : une etiquette qu on ne sait pas nommer ne peut pas etre servie.')
        return 1
    print('  toutes les classes du candidat se raccrochent a un nom officiel')
    abandonnees = [c for c in officielles if c not in resolues]
    if abandonnees:
        print('\n  %d classes DISPARAISSENT du modele embarque :' % len(abandonnees))
        for c in abandonnees[:25]:
            print('       %s' % c)
        if len(abandonnees) > 25:
            print('       ... et %d autres' % (len(abandonnees) - 25))
        print('  Elles ne disparaissent pas de l application : la cascade les')
        print('  traitera au palier suivant (serveur, Cloudflare, fournisseurs).')

    # ── 1 bis. Chaque classe servie a-t-elle de quoi etre affichee ? ────────
    # Le modele rend un nom ; l'application doit ensuite montrer des calories et
    # un libelle en francais et en arabe. Une classe predite sans entree dans
    # `nutrition_172.json` ou `names_172.json` produit un ecran vide — le pire
    # resultat possible, parce que la cascade s'est arretee la, sure d'elle.
    manquantes = {}
    for fichier, cle in (('nutrition_172.json', 'nutrition'), ('names_172.json', 'noms')):
        chemin = os.path.join(ICI, fichier)
        if not os.path.exists(chemin):
            continue
        table = json.load(io.open(chemin, encoding='utf-8'))
        absentes = [c for c in resolues if c not in table]
        if absentes:
            manquantes[cle] = absentes
    if manquantes:
        print()
        for cle, absentes in manquantes.items():
            print('  /!\\ %d classe(s) sans %s : %s'
                  % (len(absentes), cle, ', '.join(absentes[:10])))
        print('  Elles seraient annoncees a l utilisateur sans rien a afficher.')
        print('  Completer les tables, ou retirer ces classes du jeu (--mini).')

    # ── 1. Le candidat fait-il mieux, sur LES MEMES images ? ────────────────
    print('\n  ── les deux modeles, les memes images, la meme question ──')
    meilleur, _ = mesurer(tflite, etiquettes)
    if not meilleur:
        print('\n  REFUS : le candidat ne fait pas mieux. Rien n a ete touche.')
        print('  Ce refus est le but du script, pas un incident.')
        return 1

    # Les chiffres de la comparaison, relus DEPUIS SON fichier plutot que
    # recalcules ici : deux mesures ecrites deux fois divergent, et c'est
    # toujours la plus flatteuse qu'on finit par citer.
    comparaison = json.load(io.open(os.path.join(ICI, 'comparaison.json'), encoding='utf-8'))

    if not appliquer:
        print('\n  (constat seul — relancer avec --appliquer pour deployer)')
        return 0

    # ── 3 et 4. Ecrire les quatre fichiers, ou aucun ────────────────────────
    octets = io.open(tflite, 'rb').read()
    for cible in CIBLES_MODELE:
        chemin = os.path.join(RACINE, cible)
        os.makedirs(os.path.dirname(chemin), exist_ok=True)
        # Une copie de l ancien, a cote : revenir en arriere doit etre trivial.
        if os.path.exists(chemin):
            shutil.copy2(chemin, chemin + '.precedent')
        io.open(chemin, 'wb').write(octets)
    print('\n  modele ecrit dans les %d emplacements (memes octets)' % len(CIBLES_MODELE))

    chemin = os.path.join(RACINE, CIBLE_LABELS_SERVEUR)
    shutil.copy2(chemin, chemin + '.precedent')
    io.open(chemin, 'w', encoding='utf-8').write(
        json.dumps({'classes': resolues}, ensure_ascii=False, indent=1))

    chemin = os.path.join(RACINE, CIBLE_LABELS_TELEPHONE)
    shutil.copy2(chemin, chemin + '.precedent')
    lignes = [
        '// Labels du modele on-device Salorie (food_salorie.tflite) — %d classes.'
        % len(resolues),
        '// ⚠ CE FICHIER EST GENERE par food4k/deployer_modele.py. Ne pas le modifier',
        '//   a la main : il doit rester rang pour rang identique a',
        '//   food4k/label_map_172.json, sinon un decalage d UN rang fait dire',
        '//   « harira » a un tajine, sans aucune erreur visible.',
        '//',
        '// Mesure comparative face au modele precedent, sur LES MEMES images',
        '// (corpus-ia + corpus-maghreb, jamais vus a l apprentissage) :',
        '//     ce modele        sert %.1f %% des photos, dont %.1f %% justes'
        % (comparaison['candidat']['couverture'], comparaison['candidat']['justesse']),
        '//     le precedent     servait %.1f %%, dont %.1f %% justes'
        % (comparaison['en_place']['couverture'], comparaison['en_place']['justesse']),
        '// « Sert » = repond au-dessus du seuil de confiance ; en dessous, il se',
        '// tait et la cascade prend le relais. Un modele qui sert moins mais plus',
        '// juste est un bon echange : le cout est en latence, pas en justesse.',
        '//',
        '// Le chiffre precedemment inscrit ici annoncait « ≈ 86 % » ; il venait de',
        '// l entrainement d origine, sur ses propres donnees, et d aucune mesure.',
        'export const FOOD_SALORIE_LABELS: string[] = [',
    ]
    lignes += ['  %s,' % json.dumps(c, ensure_ascii=False) for c in resolues]
    lignes += ['];', '']
    io.open(chemin, 'w', encoding='utf-8', newline='\n').write('\n'.join(lignes))

    print('  etiquettes ecrites dans les 2 fichiers (%d classes)' % len(resolues))
    print('\n  Les anciens fichiers sont a cote, en « .precedent ».')
    print('  Prochaine etape : la CI food4k-justesse.yml compare les SHA des deux')
    print('  copies du modele et remesure. Ne pas pousser sans qu elle passe.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
