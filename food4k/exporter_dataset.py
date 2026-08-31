# -*- coding: utf-8 -*-
"""Transforme les corrections d'utilisateurs en jeu d'entrainement exploitable.

LE CHAINON MANQUANT ENTRE LA COLLECTE ET LE REENTRAINEMENT
L'application collecte deja, a chaque scan enregistre : l'image, ce que le modele
avait predit, et le nom FINAL retenu par l'utilisateur (cf. recordScanFeedback
dans ml.service.ts). C'est exactement la matiere d'un reentrainement.

Sauf que `finalName` est du TEXTE LIBRE, dans la langue de l'utilisateur :
« tajine de poulet », « chicken tagine », « طاجين بالدجاج ». Un modele a 172
classes ne s'entraine pas sur du texte libre. Sans cette etape, on accumulerait
des mois de corrections pour decouvrir au moment de l'entrainement qu'aucune
n'est utilisable.

Ce script vit ICI, a cote de `names_172.json`, parce que c'est ce fichier qui
porte le vocabulaire des trois langues. Le dupliquer cote backend ferait deux
verites qui divergeraient.

⚠ CE QU'IL NE FAIT PAS : deviner. Une correction qu'il ne sait pas rattacher est
comptee et listee, pas rangee de force dans la classe la plus proche. Une
etiquette inventee vaut moins que pas d'etiquette — c'est la lecon du corpus mal
etiquete du 29/08/2026.

Usage :
  python food4k/exporter_dataset.py <feedback.jsonl> [--sortie dataset.json]

Sur le serveur, le fichier vit dans /data/uploads/ml-feedback/feedback.jsonl.
"""
import io
import json
import os
import re
import sys
import unicodedata
from collections import Counter

ICI = os.path.dirname(os.path.abspath(__file__))


def nu(x):
    """Normalise pour comparer : casse, accents, ponctuation, articles."""
    s = unicodedata.normalize('NFD', str(x).lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[^a-z؀-ۿ ]", ' ', s)
    # Les articles et liaisons ne portent pas de sens ici et empechent les
    # correspondances : « tajine DE poulet » vs « tajine poulet ».
    s = ' '.join(m for m in s.split() if m not in {
        'de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'a', 'the', 'of', 'with'})
    return s.strip()


# ⚠ LE VOCABULAIRE OFFICIEL NE SUFFIT PAS, ET IL FAUT SAVOIR POURQUOI.
# `names_172.json` donne, pour les 71 classes marocaines, un nom francais
# IDENTIQUE a l'anglais (verifie le 30/08/2026 : 71 sur 71). Un utilisateur
# francais qui corrige en ecrivant « tajine » — l'orthographe usuelle — ne serait
# donc rattache a aucune classe, et sa correction serait jetee en silence.
#
# Ces alias servent UNIQUEMENT au rattachement. Ils ne sont jamais affiches :
# corriger les noms montres aux utilisateurs est un autre travail, qui demande
# un locuteur natif — surtout pour l'arabe, vide sur 51 classes.
ALIAS = {
    'tagine': ['tajine', 'tagin', 'tajin'],
    'bastila': ['pastilla', 'bstila', 'bisteeya', 'pastila'],
    'chicken basstila': ['pastilla poulet', 'bastila poulet'],
    'fish basstila': ['pastilla poisson', 'bastila poisson'],
    'msemen': ['msemmen', 'msmen', 'rghaif'],
    'baghrir': ['bagrir', 'crepe mille trous'],
    'chebakia': ['chebbakia', 'griwech'],
    'briouat': ['briouate', 'briwat'],
    'kaab el ghazal': ['corne gazelle', 'cornes gazelle', 'kaab ghazal'],
    'mechoui': ['mechwi', 'meshoui'],
    'harcha': ['harsha'],
    'sfenj': ['sfendj', 'beignet marocain'],
    'maakouda': ['maakoud', 'makouda'],
    'matbucha': ['matbukha', 'matbouha'],
    'zaalouk': ['zalouk', 'zaalouk aubergine'],
    'taktouka': ['taktuka'],
    'bissara': ['bessara'],
    'rfissa': ['rfisa'],
    'tanjia': ['tangia'],
    'seffa': ['sefa'],
    'sellou': ['slilou', 'sfouf'],
    'amlou': ['amlu'],
    'fekkas': ['fekas'],
    'batbout': ['batbot', 'pain marocain'],
    'loubia': ['lubia', 'haricots blancs'],
    'harira': ['hrira'],
    'couscous': ['seksu', 'kouskous'],
}


def charger_vocabulaire():
    """classe -> tous les noms qui la designent, dans les trois langues."""
    noms = json.load(io.open(os.path.join(ICI, 'names_172.json'), encoding='utf-8'))
    vocab = {}
    for classe, trad in noms.items():
        formes = {nu(classe.replace('_', ' '))}
        for langue in ('en', 'fr', 'ar'):
            v = (trad or {}).get(langue)
            if v:
                formes.add(nu(v))
        for a in ALIAS.get(classe.lower(), []):
            formes.add(nu(a))
        vocab[classe] = {f for f in formes if f}
    return vocab


def rattacher(nom, vocab):
    """La classe designee par ce nom, ou None. Exact d'abord, inclusion ensuite."""
    n = nu(nom)
    if not n:
        return None
    for classe, formes in vocab.items():
        if n in formes:
            return classe
    # Inclusion : « tajine poulet » contient « tajine ». On exige que la forme
    # connue fasse au moins quatre caracteres, sinon « the » rattacherait tout.
    meilleures = []
    for classe, formes in vocab.items():
        for f in formes:
            if len(f) >= 4 and (f in n or n in f):
                meilleures.append((len(f), classe))
    if not meilleures:
        return None
    # La forme la plus LONGUE gagne : « tagine with beef » plutot que « tagine ».
    meilleures.sort(reverse=True)
    return meilleures[0][1]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        print(__doc__.strip().split('Usage :')[1])
        return 2
    source = args[0]
    sortie = None
    if '--sortie' in sys.argv:
        sortie = sys.argv[sys.argv.index('--sortie') + 1]

    if not os.path.exists(source):
        print('  introuvable : %s' % source)
        return 1

    vocab = charger_vocabulaire()
    lignes = [l for l in io.open(source, encoding='utf-8').read().split('\n') if l.strip()]

    total = 0
    corrections = []
    non_rattaches = Counter()
    sans_image = 0

    for l in lignes:
        try:
            r = json.loads(l)
        except Exception:
            continue
        total += 1
        # Seules les VRAIES corrections servent : un scan valide sans edition
        # n'apprend rien au modele qu'il ne sache deja.
        if not r.get('gold'):
            continue
        if not r.get('image'):
            sans_image += 1
            continue
        classe = rattacher(r.get('finalName', ''), vocab)
        if not classe:
            non_rattaches[str(r.get('finalName', ''))[:40]] += 1
            continue
        corrections.append({
            'image': r['image'], 'classe': classe,
            'nomUtilisateur': r.get('finalName'), 'langue': r.get('language'),
            'predit': r.get('predicted'), 'confiance': r.get('predictedScore'),
        })

    print('  enregistrements lus            : %d' % total)
    print('  vraies corrections (gold)      : %d' % (len(corrections) + sans_image + sum(non_rattaches.values())))
    print('    dont sans image              : %d' % sans_image)
    print('    dont nom non rattachable     : %d' % sum(non_rattaches.values()))
    print('  UTILISABLES POUR L ENTRAINEMENT: %d' % len(corrections))

    if corrections:
        par_classe = Counter(c['classe'] for c in corrections)
        print('\n  classes couvertes : %d' % len(par_classe))
        print('  les mieux fournies : %s'
              % ', '.join('%s (%d)' % kv for kv in par_classe.most_common(6)))
        # ⚠ L'ordre de grandeur qui compte, dit sans le farder.
        if len(corrections) < 500:
            print('\n  ATTENTION : %d exemples, c est trop peu pour reentrainer.' % len(corrections))
            print('  Un reentrainement utile demande des CENTAINES d exemples PAR CLASSE ;')
            print('  en dessous, le modele apprend le bruit de ces images-la.')

    if non_rattaches:
        print('\n  noms non rattaches (a ajouter au vocabulaire si recurrents) :')
        for nom, n in non_rattaches.most_common(10):
            print('    %-42s x%d' % (nom, n))

    if sortie:
        io.open(sortie, 'w', encoding='utf-8').write(
            json.dumps({'source': source, 'exemples': corrections}, ensure_ascii=False, indent=2))
        print('\n  ecrit : %s' % sortie)
    return 0


if __name__ == '__main__':
    sys.exit(main())
