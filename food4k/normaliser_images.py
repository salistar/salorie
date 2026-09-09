# -*- coding: utf-8 -*-
"""Toutes les images doivent etre du VRAI JPEG RGB, pas seulement s'appeler .jpg.

⚠ LE DEFAUT QUE CE SCRIPT REPARE, ET POURQUOI IL A ECHAPPE AUX AUTRES.
L'entrainement du 08/09/2026 s'est arrete apres vingt minutes sur :
    InvalidArgumentError: Number of channels requested does not match input
                          [[{{node decode_image/DecodeImage}}]]
Des fichiers telecharges portaient l'extension .jpg mais etaient des PNG, des
GIF, ou des JPEG en CMJN. Le decodeur de TensorFlow exige trois canaux et refuse.

Aucun controle existant ne pouvait le voir : `verifier_images.py` ouvre les
images avec PIL, qui accepte tous ces formats sans broncher et les convertit a
la volee. Le fichier paraissait donc parfaitement sain jusqu'a ce qu'un AUTRE
decodeur y touche. C'est le piege classique du « ca marche chez moi » : deux
bibliotheques, deux tolerances, et la panne arrive au pire moment — apres la
mise en cache, pas avant.

⚠ ON RE-ENREGISTRE PLUTOT QUE D'ECARTER.
Ces images sont bonnes ; c'est leur encodage qui gene. Les jeter perdrait de la
matiere pour rien, surtout sur les classes rares. On les convertit en RGB et on
les reecrit en JPEG — l'original est ecrase, mais son CONTENU est preserve.

Usage :
  python food4k/normaliser_images.py [dossier ...]
Sans argument : tous les corpus d'entrainement.
"""
import collections
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from PIL import Image  # noqa: E402

Image.MAX_IMAGE_PIXELS = 200_000_000
RACINE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
DEFAUT = ['corpus-entrainement', 'corpus-maghreb-plus', 'corpus-maghreb-hf',
          'corpus-web', 'corpus-ia', 'corpus-maghreb']


def normaliser(dossier):
    chemin = os.path.join(RACINE, dossier)
    if not os.path.isdir(chemin):
        return None
    formats = collections.Counter()
    reecrites = illisibles = 0
    fichiers = [f for f in os.listdir(chemin) if f.lower().endswith('.jpg')]
    for i, f in enumerate(fichiers):
        p = os.path.join(chemin, f)
        try:
            with Image.open(p) as im:
                formats['%s/%s' % (im.format, im.mode)] += 1
                # Un JPEG RGB est deja conforme : on n'y touche pas. Le
                # reecrire ferait perdre de la qualite a chaque passage.
                if im.format == 'JPEG' and im.mode == 'RGB':
                    continue
                rgb = im.convert('RGB')
                rgb.load()
            rgb.save(p, 'JPEG', quality=92)
            reecrites += 1
        except Exception:
            illisibles += 1
        if i and i % 5000 == 0:
            print('    ... %d/%d' % (i, len(fichiers)), flush=True)
    return len(fichiers), reecrites, illisibles, formats


def main():
    dossiers = sys.argv[1:] or DEFAUT
    total = reecrites = illisibles = 0
    for d in dossiers:
        r = normaliser(d)
        if r is None:
            continue
        n, re_, ill, formats = r
        total += n
        reecrites += re_
        illisibles += ill
        divers = {k: v for k, v in formats.items() if k != 'JPEG/RGB'}
        print('  %-22s %6d images, %4d reecrites%s'
              % (d, n, re_, (', %d illisibles' % ill) if ill else ''))
        if divers:
            print('       encodages non conformes : %s'
                  % ', '.join('%s x%d' % (k, v) for k, v in
                              sorted(divers.items(), key=lambda kv: -kv[1])[:8]))
    print('\n  %d images examinees, %d reecrites en JPEG RGB' % (total, reecrites))
    if illisibles:
        print('  %d illisibles — elles seront ecartees par verifier_images.py' % illisibles)
    return 0


if __name__ == '__main__':
    sys.exit(main())
