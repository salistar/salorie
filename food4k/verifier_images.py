# -*- coding: utf-8 -*-
"""Controle qualite des images moissonnees, avant d'entrainer quoi que ce soit.

POURQUOI CE CONTROLE PASSE AVANT L'ENTRAINEMENT
Un jeu d'images ramassees sur le web contient toujours des choses qui n'y ont
rien a faire, et chacune abime le modele d'une facon differente :

  IMAGE ILLISIBLE      un fichier tronque fait echouer l'entrainement en plein
                       milieu, souvent apres une heure.
  IMAGE MINUSCULE      une vignette de 80 px agrandie a 224 n'apporte que du
                       flou : le modele apprend le flou.
  QUASI-DOUBLON        la MEME photo recompressee. Elle ne s'ecarte pas par
                       l'empreinte SHA-256 (les octets different) mais elle
                       compte double a l'entrainement, et surtout : si l'une
                       tombe en entrainement et l'autre en validation, le score
                       de validation devient FAUX — le modele a deja vu l'image.
                       C'est la fuite la plus courante et la plus flatteuse.
  DESSIN / SCHEMA      un trait noir sur blanc n'est pas une assiette. Le filtre
                       par titre en laisse passer ; la saturation les trahit.

⚠ CE SCRIPT NE SUPPRIME RIEN.
Il DEPLACE les rejets dans `rejets/<motif>/`. Un filtre trop zele est aussi
nuisible qu'un filtre absent, et on doit pouvoir aller regarder ce qu'il a
ecarte — puis le remettre s'il s'est trompe.

Usage :
  python food4k/verifier_images.py corpus-maghreb-plus [--appliquer]
Sans `--appliquer`, il ne fait que dire ce qu'il ferait.
"""
import collections
import io
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = 200_000_000

# La console Windows est en cp1252 : sans cela, un simple caractere accentue ou
# un pictogramme fait planter le script APRES son travail, et l'appelant croit a
# un echec la ou tout s'est bien passe.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


COTE_MINI = 160          # sous 160 px, l'agrandissement vers 224 n'apporte rien
RAPPORT_MAXI = 3.0       # une banniere n'est pas une photo de plat
SATURATION_MINI = 8.0    # sous ce seuil : image quasi grise, souvent un schema
DISTANCE_DOUBLON = 5     # bits de difference du dHash sous lesquels c'est la meme


def dhash(img, taille=8):
    """Empreinte perceptuelle : survit au recadrage leger et a la recompression.

    On compare chaque pixel a son voisin de droite. Le resultat ne depend pas de
    la luminosite absolue, seulement des variations — donc deux versions de la
    meme photo, l'une plus claire, rendent la meme empreinte.
    """
    g = img.convert('L').resize((taille + 1, taille), Image.LANCZOS)
    a = np.asarray(g, dtype=np.int16)
    bits = a[:, 1:] > a[:, :-1]
    v = 0
    for b in bits.flatten():
        v = (v << 1) | int(b)
    return v


def saturation_moyenne(img):
    petite = img.convert('RGB').resize((64, 64), Image.LANCZOS)
    a = np.asarray(petite, dtype=np.float32)
    return float((a.max(axis=2) - a.min(axis=2)).mean())


def examiner(chemin):
    """Rend (motif_de_rejet, dhash) — motif vaut None si l'image est bonne."""
    try:
        with Image.open(chemin) as img:
            img.load()
            l, h = img.size
            if min(l, h) < COTE_MINI:
                return ('trop_petite_%dx%d' % (l, h)), None
            if max(l, h) / max(1, min(l, h)) > RAPPORT_MAXI:
                return 'rapport_extreme', None
            if saturation_moyenne(img) < SATURATION_MINI:
                return 'quasi_grise', None
            return None, dhash(img)
    except Exception as e:
        return 'illisible_%s' % type(e).__name__, None


def classe_de(nom):
    """Le nom de fichier porte sa classe : « tagine_with_beef_12.jpg »."""
    return nom[:-4].rsplit('_', 1)[0] if nom.endswith('.jpg') else nom


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    dossier = sys.argv[1]
    appliquer = '--appliquer' in sys.argv
    if not os.path.isdir(dossier):
        print('  dossier introuvable : %s' % dossier)
        return 1

    fichiers = sorted(f for f in os.listdir(dossier) if f.lower().endswith('.jpg'))
    print('  %d images a examiner dans %s' % (len(fichiers), dossier))
    print('  mode : %s\n' % ('APPLIQUER — les rejets seront deplaces'
                             if appliquer else 'constat seul (ajouter --appliquer pour agir)'))

    rejets = {}
    empreintes = {}
    doublons_de = {}

    for i, f in enumerate(fichiers):
        if i and i % 2000 == 0:
            print('    ... %d/%d' % (i, len(fichiers)))
        motif, h = examiner(os.path.join(dossier, f))
        if motif:
            rejets[f] = motif
            continue
        # ⚠ Le quasi-doublon n'est cherche QUE dans la meme classe. Deux photos
        # tres proches de deux plats differents sont une information utile, pas
        # un doublon — les ecarter appauvrirait justement les cas durs.
        c = classe_de(f)
        seau = empreintes.setdefault(c, [])
        jumeau = None
        for (autre, hh) in seau:
            if bin(h ^ hh).count('1') <= DISTANCE_DOUBLON:
                jumeau = autre
                break
        if jumeau:
            rejets[f] = 'quasi_doublon'
            doublons_de[f] = jumeau
        else:
            seau.append((f, h))

    # ── La MEME photo sous DEUX etiquettes ─────────────────────────────────
    # ⚠ PLUS GRAVE QU'UN DOUBLON INTERNE, ET INVISIBLE POUR LA BOUCLE CI-DESSUS.
    # Un doublon dans une classe fait compter une image double. La meme image
    # sous deux classes enseigne au modele que ces deux classes sont
    # INDISCERNABLES — donc de ne jamais savoir les separer.
    #
    # Constate le 02/09/2026 : `bastila`, `chicken basstila` et `fish basstila`
    # partageaient 7 cliches CHACUNE. Les trois etaient nourries par la meme
    # categorie Wikimedia « Pastilla ». Ce n'etait pas un accident de moisson :
    # aucune source publique ne distingue ces trois plats.
    #
    # On ecarte TOUTES les copies, pas une au hasard. Garder l'une des deux
    # reviendrait a trancher a pile ou face laquelle dit vrai — et a enseigner
    # ce tirage au modele. Perdre deux images coute moins qu'apprendre un
    # mensonge, surtout quand le compte rendu nomme les classes en cause : ce
    # sont elles qu'il faut fusionner ou re-sourcer.
    par_empreinte = collections.defaultdict(list)
    for c, seau in empreintes.items():
        for (f, h) in seau:
            par_empreinte[h].append((c, f))
    contradictions = collections.Counter()
    for h, liste in par_empreinte.items():
        classes = {c for c, _ in liste}
        if len(classes) > 1:
            for a in sorted(classes):
                for b in sorted(classes):
                    if a < b:
                        contradictions[(a, b)] += 1
            for _, f in liste:
                rejets[f] = 'contradiction'

    # ── Le compte rendu ────────────────────────────────────────────────────
    motifs = collections.Counter(m.split('_')[0] + ('_' + m.split('_')[1]
                                 if m.startswith(('trop', 'quasi', 'rapport')) else '')
                                 for m in rejets.values())
    garde = len(fichiers) - len(rejets)
    print('\n  %d gardees, %d ecartees' % (garde, len(rejets)))
    for m, n in motifs.most_common():
        print('    %-22s %d' % (m, n))

    # Nommer les classes qui se confondent : c'est le diagnostic le plus utile
    # que ce script produise. Il ne dit pas « des images sont en double », il dit
    # « CES DEUX CLASSES viennent de la meme source et rien ne les separe » —
    # une information sur la taxonomie, pas sur les fichiers.
    if contradictions:
        print('\n  /!\\ MEME PHOTO SOUS PLUSIEURS ETIQUETTES — %d couple(s) de classes :'
              % len(contradictions))
        for (a, b), n in contradictions.most_common(15):
            print('    %-30s == %-30s %d fois' % (a[:30], b[:30], n))
        print('    Aucune source ne separe ces classes. Les fusionner, ou les')
        print('    nourrir par des requetes qui les distinguent vraiment.')

    # Ce qui compte vraiment : ce que chaque classe PERD.
    perdu = collections.Counter(classe_de(f) for f in rejets)
    reste = collections.Counter(classe_de(f) for f in fichiers if f not in rejets)
    graves = [(c, perdu[c], reste[c]) for c in perdu if reste[c] < 20]
    if graves:
        print('\n  classes qui restent sous 20 images apres nettoyage :')
        for c, p, r in sorted(graves, key=lambda x: x[2])[:25]:
            print('    %-36s reste %3d (perd %d)' % (c[:36], r, p))

    if appliquer:
        for f, motif in rejets.items():
            fam = motif.split('_')[0] + ('_' + motif.split('_')[1]
                                         if motif.startswith(('trop', 'quasi', 'rapport')) else '')
            cible = os.path.join(dossier, 'rejets', fam)
            os.makedirs(cible, exist_ok=True)
            try:
                shutil.move(os.path.join(dossier, f), os.path.join(cible, f))
            except Exception:
                pass
        io.open(os.path.join(dossier, 'rejets', 'RAPPORT.json'), 'w', encoding='utf-8').write(
            json.dumps({'rejets': rejets, 'doublon_de': doublons_de,
                        'gardees': garde, 'seuils': {
                            'cote_mini': COTE_MINI, 'rapport_maxi': RAPPORT_MAXI,
                            'saturation_mini': SATURATION_MINI,
                            'distance_doublon': DISTANCE_DOUBLON}},
                       ensure_ascii=False, indent=1))
        print('\n  rejets deplaces dans %s/rejets/ — rien n a ete supprime' % dossier)
    return 0


if __name__ == '__main__':
    sys.exit(main())
