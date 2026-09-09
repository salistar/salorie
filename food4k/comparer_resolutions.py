# -*- coding: utf-8 -*-
"""Le modele voit-il assez gros ?

POURQUOI LA QUESTION SE POSE ICI PLUS QU'AILLEURS
Nos classes se distinguent par des details fins : la croute d'une `bastila` et
celle d'une `chicken basstila`, le grain d'un `msemen` et celui d'un `rghayf`,
les quatre variantes de tajine qui ne different que par leur garniture. A 224
pixels, ces details tiennent dans quelques dizaines de pixels — parfois moins
que le bruit de compression.

Augmenter la resolution est un levier connu sur la reconnaissance de plats.
Il n'est pas gratuit : le cout d'inference croit avec le CARRE du cote, et ce
modele tourne sur le telephone de l'utilisateur. Passer de 224 a 320 double le
temps de calcul. On mesure donc le gain avant de payer ce prix.

⚠ MEME METHODE QUE POUR LES SOCLES, ET POUR LA MEME RAISON.
Sonde lineaire sur traits geles : quelques minutes par resolution au lieu de
deux heures. Le classement se conserve ; les valeurs absolues, non.

⚠ ET LE MEME ECHANTILLON POUR TOUTES.
Equilibre par classe. Un tirage au hasard sur-representerait les classes riches
et noterait les resolutions sur leur aptitude a reconnaitre des pizzas.

Usage :
  python food4k/comparer_resolutions.py <jeu> [--par-classe 30] [--epoques 30]
"""
import argparse
import collections
import io
import json
import os
import sys
import time

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import numpy as np  # noqa: E402
import tensorflow as tf  # noqa: E402

from comparer_socles import echantillon_equilibre  # noqa: E402

RESOLUTIONS = [224, 288, 320]


def charger(fichiers, cote):
    X = np.zeros((len(fichiers), cote, cote, 3), dtype=np.float32)
    for i, f in enumerate(fichiers):
        try:
            img = tf.io.decode_image(tf.io.read_file(f), channels=3,
                                     expand_animations=False)
            X[i] = tf.image.resize(img, (cote, cote)).numpy()
        except Exception:
            pass
    return X


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('jeu')
    ap.add_argument('--par-classe', type=int, default=30)
    ap.add_argument('--epoques', type=int, default=30)
    a = ap.parse_args()

    lots = echantillon_equilibre(a.jeu, a.par_classe)
    fe, ye, classes = lots['entrainement']
    fv, yv, _ = lots['validation']
    print('  %d classes, %d images d entrainement, %d de validation\n'
          % (len(classes), len(fe), len(fv)))

    n = collections.Counter(ye.tolist())
    poids = {i: float(min(len(ye) / max(1, len(classes) * n.get(i, 1)), 8.0))
             for i in range(len(classes))}

    resultats = []
    for cote in RESOLUTIONS:
        t0 = time.time()
        base = tf.keras.applications.MobileNetV3Large(
            input_shape=(cote, cote, 3), include_top=False, weights='imagenet',
            pooling='avg', include_preprocessing=True)
        base.trainable = False

        Te = base.predict(charger(fe, cote), batch_size=16, verbose=0)
        Tv = base.predict(charger(fv, cote), batch_size=16, verbose=0)

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
        # Le cout d'inference, mesure et non suppose : c'est lui qui decide si
        # le gain est payable sur un telephone.
        x = np.random.randint(0, 255, (16, cote, cote, 3)).astype('float32')
        base.predict(x, verbose=0)
        t1 = time.time()
        for _ in range(3):
            base.predict(x, verbose=0)
        ms = (time.time() - t1) / (3 * 16) * 1000

        resultats.append((cote, just, top5, ms))
        print('  %3d px  %5.1f %% justes, %5.1f %% top5, %5.1f ms/image, prepare en %3.0f s'
              % (cote, just * 100, top5 * 100, ms, time.time() - t0), flush=True)
        del base, Te, Tv, tete

    base_just = resultats[0][1]
    base_ms = resultats[0][3]
    print('\n  gain par rapport a 224 px :')
    for cote, just, _, ms in resultats[1:]:
        print('    %3d px : %+.1f point(s) de justesse, pour %.1f fois le temps de calcul'
              % (cote, (just - base_just) * 100, ms / base_ms))
    print('\n  ⚠ Sonde lineaire sur echantillon : ces valeurs CLASSENT les')
    print('    resolutions, elles n annoncent pas la justesse d un modele entraine.')

    io.open(os.path.join(ICI, 'resolutions.json'), 'w', encoding='utf-8').write(
        json.dumps({'par_classe': a.par_classe,
                    'resultats': [{'cote': c, 'justesse': round(j, 4),
                                   'top5': round(t, 4), 'ms_par_image': round(m, 2)}
                                  for c, j, t, m in resultats]},
                   ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
