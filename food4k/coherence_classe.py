# -*- coding: utf-8 -*-
"""Une classe montre-t-elle UN plat, ou un fourre-tout ?

⚠ LE DEFAUT QUE CE SCRIPT ATTRAPE, ET QU'AUCUN AUTRE NE VOIT.
Constate le 05/09/2026. La recherche web a rendu 200 images pour « khringo ».
Elles venaient de 60 domaines differents — la concentration par source ne
signalait donc rien. Mais en les regardant : la plupart etaient des BAGHRIR,
les crepes mille trous, qui sont une AUTRE classe de notre taxonomie. La page
source s'intitulait « 10 noms de plats marocains super bizarres » : le moteur
avait rendu les images d'un article qui MENTIONNE khringo parmi dix plats.

Aucun des controles existants ne pouvait le voir :
  - le controle mecanique ne juge que la taille, la saturation, les doublons ;
  - le juge ImageNet dit « c'est de la nourriture » — et c'en est ;
  - la detection de contradiction compare les OCTETS, et ces baghrir-la ne sont
    pas ceux de notre classe baghrir.
Le mal est pourtant le pire de tous : apprendre au modele que le baghrir est du
khringo corrompt LES DEUX classes.

CE QUE MESURE CE SCRIPT
La coherence VISUELLE interne d'une classe, sans reference exterieure : les
images d'une vraie classe se ressemblent entre elles. On projette chaque image
dans l'espace de traits d'un reseau generaliste (MobileNetV3, avant sa derniere
couche), puis on regarde quelle part des images se tient pres du centre.
  fekkas   -> des biscottis aux amandes, partout : groupe serre
  khringo  -> crepes, beignets, et un logo sportif : groupe eclate

⚠ CE SCRIPT NE REPARE RIEN, ET C'EST VOULU.
Il ne « garde que le plus gros groupe » : pour khringo, ce groupe serait celui
des baghrir, et on aurait fabrique une classe fausse mais coherente — pire que
le desordre, parce qu'invisible. Il NOMME les classes douteuses et laisse la
decision : les re-moissonner autrement, ou les ecarter.

Usage :
  python food4k/coherence_classe.py <dossier> [--seuil 0.55] [--mini 20]
"""
import argparse
import collections
import io
import json
import os
import shutil
import sys

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import numpy as np  # noqa: E402


def classe_de(nom):
    return nom[:-4].rsplit('_', 1)[0] if nom.endswith('.jpg') else nom


def traits(dossier, fichiers, lot=64):
    """Les traits visuels de chaque image, normalises pour la similarite cosinus."""
    import tensorflow as tf
    from tensorflow.keras.preprocessing import image as kimage
    # `include_top=False` + moyenne globale : on veut la DESCRIPTION de l'image,
    # pas le vote sur 1000 categories. Deux plats absents d'ImageNet peuvent
    # avoir des votes egalement nuls tout en etant visuellement tres differents.
    base = tf.keras.applications.MobileNetV3Large(
        input_shape=(224, 224, 3), include_top=False, weights='imagenet',
        pooling='avg', include_preprocessing=True)

    sortie, gardes = [], []
    for debut in range(0, len(fichiers), lot):
        tableau, noms = [], []
        for f in fichiers[debut:debut + lot]:
            try:
                im = kimage.load_img(os.path.join(dossier, f), target_size=(224, 224))
                tableau.append(kimage.img_to_array(im))
                noms.append(f)
            except Exception:
                continue
        if not tableau:
            continue
        v = base.predict(np.stack(tableau), verbose=0)
        v = v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
        sortie.append(v)
        gardes.extend(noms)
        if debut and debut % (lot * 10) == 0:
            print('    ... %d/%d' % (debut, len(fichiers)), flush=True)
    return (np.concatenate(sortie) if sortie else np.zeros((0, 960))), gardes


def coherence(v, seuil):
    """Part des images proches du MEDOIDE — l'image la plus centrale du groupe.

    On prend le medoide plutot que la moyenne : une moyenne se laisse tirer par
    les intrus, et une classe a moitie polluee afficherait un centre qui ne
    ressemble a aucune de ses images.
    """
    if len(v) < 3:
        return None, None
    sim = v @ v.T
    medoide = int(sim.mean(axis=1).argmax())
    proches = sim[medoide]
    return float((proches >= seuil).mean()), medoide


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dossier')
    ap.add_argument('--seuil', type=float, default=0.55,
                    help='similarite au-dela de laquelle deux images « se ressemblent »')
    ap.add_argument('--mini', type=float, default=0.50,
                    help='part minimale d images proches du centre pour qu une classe passe')
    ap.add_argument('--appliquer', action='store_true')
    a = ap.parse_args()

    fichiers = sorted(f for f in os.listdir(a.dossier) if f.lower().endswith('.jpg'))
    if not fichiers:
        print('  aucune image dans %s' % a.dossier)
        return 1
    print('  %d images, %d classes' % (len(fichiers),
                                       len(set(map(classe_de, fichiers)))))
    print('  seuil de ressemblance %.2f, part minimale %.2f\n' % (a.seuil, a.mini))

    v, gardes = traits(a.dossier, fichiers)
    par_classe = collections.defaultdict(list)
    for i, f in enumerate(gardes):
        par_classe[classe_de(f)].append(i)

    resultats = []
    for c, idx in sorted(par_classe.items()):
        part, _ = coherence(v[idx], a.seuil)
        resultats.append((c, len(idx), part))

    resultats.sort(key=lambda x: (x[2] is None, x[2]))
    print('  %-32s %5s  %s' % ('classe', 'n', 'part groupee'))
    for c, n, part in resultats:
        etat = '  trop peu d images' if part is None else (
            '  %.0f %%%s' % (part * 100, '   <-- FOURRE-TOUT' if part < a.mini else ''))
        print('  %-32s %5d%s' % (c[:32], n, etat))

    douteuses = [c for c, n, p in resultats if p is not None and p < a.mini]
    print('\n  %d classe(s) sous le seuil de coherence.' % len(douteuses))
    if douteuses:
        print('  Elles montrent plusieurs choses differentes. NE PAS en garder')
        print('  « le plus gros groupe » : ce serait fabriquer une classe fausse')
        print('  mais coherente — pire, parce qu invisible ensuite.')
        print('      ' + ', '.join(douteuses))

    if a.appliquer and douteuses:
        for c in douteuses:
            cible = os.path.join(a.dossier, 'rejets', 'fourre_tout', c)
            os.makedirs(cible, exist_ok=True)
            for f in fichiers:
                if classe_de(f) == c:
                    try:
                        shutil.move(os.path.join(a.dossier, f), os.path.join(cible, f))
                    except Exception:
                        pass
        print('\n  classes douteuses deplacees dans %s/rejets/fourre_tout/' % a.dossier)

    io.open(os.path.join(a.dossier, 'coherence.json'), 'w', encoding='utf-8').write(
        json.dumps({'seuil': a.seuil, 'part_minimale': a.mini,
                    'classes': {c: {'images': n, 'part_groupee': p}
                                for c, n, p in resultats}},
                   ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
