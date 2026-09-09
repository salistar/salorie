# -*- coding: utf-8 -*-
"""Le jeu d'entrainement contient-il des images du jeu de MESURE ?

POURQUOI CETTE VERIFICATION EST LA PLUS IMPORTANTE DE TOUTES
Un modele evalue sur des images qu'il a vues a l'apprentissage affiche un score
flatteur et faux. C'est l'erreur la plus difficile a rattraper, parce qu'elle ne
ressemble pas a une erreur : elle ressemble a un succes. On decide de deployer,
on annonce un chiffre, et le modele s'effondre chez l'utilisateur.

⚠ POURQUOI L'EMPREINTE SHA-256 NE SUFFIT PAS.
Le moissonneur ecarte deja les images dont les OCTETS sont identiques. Mais la
meme photo recompressee, redimensionnee ou legerement recadree a des octets
differents et un SHA-256 different. Elle passe. Il faut comparer ce que l'oeil
voit, pas ce que le disque contient — d'ou le dHash.

⚠ DEUX FUITES DISTINCTES, ET ELLES N'ONT PAS LA MEME GRAVITE.
  corpus-ia        partition de VALIDATION de Food-101. Fuite = le score global
                   annonce est faux.
  corpus-maghreb   le SEUL jeu de mesure de la cuisine marocaine. Fuite = le
                   chiffre qui compte le plus — celui du public de Salorie — est
                   faux. Et c'est le cas le plus probable, puisque les corpus
                   marocains viennent tous des memes sources.

Usage :
  python food4k/verifier_fuite.py [--appliquer]
Sans `--appliquer`, il constate sans rien deplacer.
"""
import collections
import io
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ⚠ La console Windows est en cp1252 et ne sait pas ecrire « ⚠ ». Sans cette
# ligne, le script FAIT tout son travail, ecrit son rapport, puis plante sur le
# dernier `print` — et sort en erreur. Un appelant automatique (CI, script
# d'enchainement) en conclurait que la verification a echoue alors qu'elle a
# reussi. C'est la pire forme de panne : celle qui ment sur ce qui s'est passe.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
from verifier_images import dhash  # noqa: E402

Image.MAX_IMAGE_PIXELS = 200_000_000
RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

MESURE = ['corpus-ia', 'corpus-maghreb']
ENTRAINEMENT = ['corpus-entrainement', 'corpus-maghreb-hf', 'corpus-maghreb-plus',
                'corpus-web']

# ⚠ CE SEUIL A ETE MESURE, PAS CHOISI.
# Premiere version : 8, par prudence — « le doute profite a la mesure ». C'etait
# faux dans les deux sens. A 8, le detecteur accusait 19 paires ; la planche de
# controle du 02/09/2026 en a montre 13 qui n'avaient AUCUN rapport (une tarte
# aux pommes contre un bibimbap, un gateau au chocolat contre un poulet roti).
# Un detecteur qui accuse a tort ne protege rien : il retire des images
# d'entrainement au hasard, et on croit avoir assaini.
#
# Les distances reelles, sur les 19 paires :
#     0 ou 1  ->  6 paires, TOUTES authentiques (verifiees a l'oeil)
#     2 a 6   ->  AUCUNE paire
#     7 ou 8  -> 13 paires, TOUTES fausses (verifiees a l'oeil)
# Le seuil se pose au milieu du vide : assez large pour absorber une variante
# un peu plus eloignee, assez etroit pour exclure tout ce qu'on a vu de faux.
DISTANCE = 6


def empreintes(dossier):
    d = os.path.join(RACINE, dossier)
    out = {}
    if not os.path.isdir(d):
        return out
    for f in sorted(x for x in os.listdir(d) if x.lower().endswith('.jpg')):
        try:
            with Image.open(os.path.join(d, f)) as im:
                im.load()
                out[f] = dhash(im)
        except Exception:
            continue
    return out


def main():
    appliquer = '--appliquer' in sys.argv

    # Les empreintes de mesure, regroupees par valeur : deux images identiques
    # dans deux corpus de mesure ne comptent qu'une fois comme reference.
    reference = {}
    for d in MESURE:
        e = empreintes(d)
        print('  %-22s %d images de mesure' % (d, len(e)))
        for f, h in e.items():
            reference.setdefault(h, []).append('%s/%s' % (d, f))
    print()

    # ⚠ EN BOUCLE PYTHON, CETTE COMPARAISON PREND DES HEURES.
    # 16 000 images d'entrainement contre 3 000 de mesure font 48 millions de
    # distances. On ne peut pas raccourcir par un seau sur les premiers bits :
    # deux images proches peuvent differer justement sur ces bits-la, et on
    # raterait la fuite qu'on cherche. On garde donc la comparaison EXHAUSTIVE,
    # mais vectorisee : numpy la fait en secondes, sans rien approximer.
    POPCOUNT = np.array([bin(i).count('1') for i in range(256)], dtype=np.uint8)

    def distances(bloc, ref):
        """Distance de Hamming de chaque element de `bloc` a chaque `ref`."""
        x = np.bitwise_xor(bloc[:, None], ref[None, :]).astype('>u8')
        octets = x.view(np.uint8).reshape(x.shape[0], x.shape[1], 8)
        return POPCOUNT[octets].sum(axis=2)

    cles = list(reference.keys())
    ref = np.array(cles, dtype=np.uint64)

    fuites = collections.defaultdict(list)
    for d in ENTRAINEMENT:
        e = empreintes(d)
        noms = list(e.keys())
        if not noms:
            print('  %-22s absent' % d)
            continue
        vals = np.array([e[f] for f in noms], dtype=np.uint64)
        touches = 0
        BLOC = 512
        for i in range(0, len(noms), BLOC):
            dist = distances(vals[i:i + BLOC], ref)
            plus_proche = dist.argmin(axis=1)
            for j, k in enumerate(plus_proche):
                if dist[j, k] <= DISTANCE:
                    fuites[d].append((noms[i + j], reference[cles[k]][0]))
                    touches += 1
        print('  %-22s %d images, %d FUITES' % (d, len(e), touches))

    total = sum(len(v) for v in fuites.values())
    print('\n  %d fuites au total' % total)
    if total:
        print('\n  exemples :')
        for d, liste in fuites.items():
            for f, src in liste[:8]:
                print('    %s/%-34s  ==  %s' % (d, f[:34], src))

    if appliquer and total:
        for d, liste in fuites.items():
            cible = os.path.join(RACINE, d, 'fuites')
            os.makedirs(cible, exist_ok=True)
            for f, _ in liste:
                try:
                    shutil.move(os.path.join(RACINE, d, f), os.path.join(cible, f))
                except Exception:
                    pass
        print('\n  images deplacees dans <corpus>/fuites/ — rien supprime')

    io.open(os.path.join(RACINE, 'food4k', 'rapport-fuite.json'), 'w', encoding='utf-8').write(
        json.dumps({'distance': DISTANCE, 'total': total,
                    'fuites': {d: [{'image': f, 'trouvee_dans': s} for f, s in v]
                               for d, v in fuites.items()}},
                   ensure_ascii=False, indent=1))
    if total and not appliquer:
        print('\n  ⚠ Relancer avec --appliquer avant tout entrainement.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
