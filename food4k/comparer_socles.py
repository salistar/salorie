# -*- coding: utf-8 -*-
"""Quel socle pre-entraine porte le mieux NOS plats ?

POURQUOI CETTE MESURE AVANT DE RE-ENTRAINER
Un entrainement complet coute deux heures sur cette machine. Choisir son socle au
jugé revient donc a parier deux heures sur une intuition. Or la question se
tranche vite : un socle gele rend des traits fixes, et la qualite de ces traits
se lit en entrainant dessus une simple couche dense — quelques secondes.

Ce qu'on mesure ici n'est pas la justesse finale du modele : c'est la QUANTITE
D'INFORMATION que chaque socle expose sur nos 170 classes. Le classement entre
socles se conserve ensuite ; les valeurs absolues, non (le reglage fin les
releve toutes).

⚠ ON MESURE SUR UN ECHANTILLON, ET ON LE DIT.
Prendre le jeu entier pour choisir un socle couterait presque aussi cher que
l'entrainement qu'on cherche a eviter. On tire donc un sous-ensemble EQUILIBRE —
le meme pour tous les socles, et stratifie par classe : un tirage au hasard
sur-representerait les classes riches et noterait les socles sur leur aptitude a
reconnaitre des pizzas.

Usage :
  python food4k/comparer_socles.py <jeu> [--par-classe 40] [--epoques 30]
"""
import argparse
import collections
import io
import json
import os
import random
import sys
import time

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import numpy as np  # noqa: E402
import tensorflow as tf  # noqa: E402

COTE = 224

# ⚠⚠ CHAQUE SOCLE VEUT SES PROPRES PIXELS, ET SE TROMPER NE LEVE AUCUNE ERREUR.
# Premiere version de ce fichier, le 08/09/2026 : elle tentait
# `include_preprocessing=True` partout et, en cas de refus, enveloppait l'entree
# en [-1, 1]. Resultat annonce :
#     EfficientNetB0    2,1 %   (le hasard, sur 170 classes, donne 0,6 %)
#     MobileNetV2       9,7 %
# Ces chiffres ne disaient rien des socles : EfficientNetB0 normalise EN INTERNE
# et veut du 0-255, il recevait donc du [-1, 1] deja normalise — deux fois. Et
# MobileNetV2, qui n'accepte pas le parametre mais VEUT du [-1, 1], ne recevait
# aucune normalisation du tout, faute d'avoir declenche le repli.
#
# Le modele ne proteste jamais : il rend des traits, simplement vides de sens.
# On declare donc explicitement, pour chacun, la fonction que Keras publie —
# `preprocess_input` — au lieu de deviner. `None` signifie que le socle porte sa
# normalisation lui-meme et veut des pixels bruts.
SOCLES = {
    'MobileNetV3Large': (tf.keras.applications.MobileNetV3Large, None),
    'EfficientNetB0': (tf.keras.applications.EfficientNetB0, None),
    'EfficientNetV2B0': (tf.keras.applications.EfficientNetV2B0, None),
    'MobileNetV2': (tf.keras.applications.MobileNetV2,
                    tf.keras.applications.mobilenet_v2.preprocess_input),
    'ResNet50V2': (tf.keras.applications.ResNet50V2,
                   tf.keras.applications.resnet_v2.preprocess_input),
    'DenseNet121': (tf.keras.applications.DenseNet121,
                    tf.keras.applications.densenet.preprocess_input),
}


def echantillon_equilibre(jeu, par_classe, graine=1789):
    """Le MEME sous-ensemble pour tous les socles, et equilibre par classe."""
    rng = random.Random(graine)
    lots = {}
    for partie in ('entrainement', 'validation'):
        d = os.path.join(jeu, partie)
        fichiers, etiquettes = [], []
        classes = sorted(c for c in os.listdir(d) if os.path.isdir(os.path.join(d, c)))
        for i, c in enumerate(classes):
            noms = sorted(f for f in os.listdir(os.path.join(d, c))
                          if f.lower().endswith(('.jpg', '.jpeg', '.png')))
            rng.shuffle(noms)
            n = par_classe if partie == 'entrainement' else max(3, par_classe // 4)
            for f in noms[:n]:
                fichiers.append(os.path.join(d, c, f))
                etiquettes.append(i)
        lots[partie] = (fichiers, np.array(etiquettes), classes)
    return lots


def charger(fichiers):
    """Les images en memoire, une fois, partagees par tous les socles."""
    X = np.zeros((len(fichiers), COTE, COTE, 3), dtype=np.float32)
    for i, f in enumerate(fichiers):
        try:
            img = tf.io.decode_image(tf.io.read_file(f), channels=3,
                                     expand_animations=False)
            X[i] = tf.image.resize(img, (COTE, COTE)).numpy()
        except Exception:
            pass
        if i and i % 2000 == 0:
            print('    ... %d/%d' % (i, len(fichiers)), flush=True)
    return X


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('jeu')
    ap.add_argument('--par-classe', type=int, default=40)
    ap.add_argument('--epoques', type=int, default=30)
    a = ap.parse_args()

    lots = echantillon_equilibre(a.jeu, a.par_classe)
    (fe, ye, classes) = lots['entrainement']
    (fv, yv, _) = lots['validation']
    print('  %d classes' % len(classes))
    print('  %d images d entrainement, %d de validation (echantillon equilibre)\n'
          % (len(fe), len(fv)))

    print('  chargement des images (une seule fois, partagees)...', flush=True)
    Xe = charger(fe)
    Xv = charger(fv)

    # Les poids par classe : sans eux, un socle serait recompense pour ignorer
    # les classes rares, exactement comme le modele complet le serait.
    n = collections.Counter(ye.tolist())
    poids = {i: float(min(len(ye) / max(1, len(classes) * n.get(i, 1)), 8.0))
             for i in range(len(classes))}

    resultats = []
    for nom, (fabrique, prepare) in SOCLES.items():
        t0 = time.time()
        socle = fabrique(input_shape=(COTE, COTE, 3), include_top=False,
                         weights='imagenet', pooling='avg')
        socle.trainable = False
        if prepare is None:
            # Le socle porte sa normalisation : il veut des pixels bruts 0-255,
            # exactement ce que `charger()` fournit.
            base = socle
        else:
            entree = tf.keras.Input(shape=(COTE, COTE, 3))
            base = tf.keras.Model(entree, socle(prepare(entree)))
        base.trainable = False

        # ⚠ VERIFICATION QUE LA NORMALISATION A BIEN PRIS.
        # Un socle mal normalise rend des traits presque constants d'une image a
        # l'autre : leur ecart-type s'effondre. C'est ce qui distingue « ce socle
        # est faible » de « je lui ai donne n'importe quoi », et sans ce controle
        # les deux se ressemblent — un chiffre bas, sans explication.
        sonde = base.predict(Xe[:64], batch_size=32, verbose=0)
        variation = float(sonde.std(axis=0).mean())
        if variation < 1e-3:
            print('  %-20s ECARTE : traits quasi constants (ecart-type %.5f)'
                  ' — la normalisation ne convient pas a ce socle'
                  % (nom, variation), flush=True)
            del socle, base
            continue

        Te = base.predict(Xe, batch_size=32, verbose=0)
        Tv = base.predict(Xv, batch_size=32, verbose=0)

        tete = tf.keras.Sequential([
            tf.keras.layers.Input(shape=(Te.shape[1],)),
            tf.keras.layers.Dropout(0.3),
            tf.keras.layers.Dense(len(classes), activation='softmax'),
        ])
        tete.compile(optimizer=tf.keras.optimizers.Adam(1e-3),
                     loss='sparse_categorical_crossentropy',
                     metrics=['accuracy',
                              tf.keras.metrics.SparseTopKCategoricalAccuracy(k=5, name='top5')])
        h = tete.fit(Te, ye, validation_data=(Tv, yv), epochs=a.epoques,
                     batch_size=256, class_weight=poids, verbose=0,
                     callbacks=[tf.keras.callbacks.EarlyStopping(
                         monitor='val_accuracy', patience=6, restore_best_weights=True)])
        just = max(h.history['val_accuracy'])
        top5 = max(h.history['val_top5'])
        resultats.append((nom, just, top5, Te.shape[1], time.time() - t0))
        print('  %-20s %5.1f %% justes, %5.1f %% top5, %4d traits, %3.0f s'
              % (nom, just * 100, top5 * 100, Te.shape[1], time.time() - t0), flush=True)
        del socle, base, Te, Tv, tete

    resultats.sort(key=lambda r: -r[1])
    print('\n  classement :')
    for i, (nom, just, top5, dim, _) in enumerate(resultats):
        print('    %d. %-20s %5.1f %%' % (i + 1, nom, just * 100))
    print('\n  ⚠ Ces valeurs sont celles d une SONDE LINEAIRE sur un echantillon.')
    print('    Elles servent a CLASSER les socles, pas a annoncer une justesse.')
    io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'socles.json'),
            'w', encoding='utf-8').write(json.dumps(
                {'par_classe': a.par_classe, 'classes': len(classes),
                 'resultats': [{'socle': n, 'justesse': round(j, 4), 'top5': round(t, 4),
                                'dimensions': d} for n, j, t, d, _ in resultats]},
                ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
