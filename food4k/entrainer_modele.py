# -*- coding: utf-8 -*-
"""Entraine le classifieur de plats, et l'exporte pour le telephone.

CE QUE CE SCRIPT FAIT, ET CE QU'IL NE PEUT PAS FAIRE
Il fait un REGLAGE FIN : il part d'un modele deja entraine sur ImageNet (1,3
million d'images) et ne reapprend que la fin. C'est le seul entrainement
possible a notre echelle. Entrainer depuis zero demanderait environ mille images
par classe ; nous en avons entre 3 et 200 selon la classe.

⚠ LE DESEQUILIBRE EST LE VRAI DANGER, PAS LE VOLUME.
Une classe a 200 images et une autre a 3. Un modele qui ne predit JAMAIS la
classe a 3 images se trompe 3 fois ; un modele qui essaie se trompe davantage.
Minimiser l'erreur pousse donc mecaniquement a abandonner les classes rares —
et ce sont precisement celles qu'on veut apprendre.
Deux garde-fous, et ils ne suffisent pas a inventer de l'information :
  - PONDERATION PAR CLASSE : une erreur sur une classe rare coute plus cher.
  - PLANCHER D'ADMISSION : sous `--mini`, une classe est ECARTEE du modele
    plutot qu'apprise sur trois exemples. Une classe apprise sur trois images
    ne se trompe pas seulement elle-meme : elle attire a elle les images des
    autres classes et abime tout le reste.

⚠ LA FUITE ENTRE ENTRAINEMENT ET VALIDATION.
La partition vient de `preparer-entrainement.js`, qui la fixe par hachage du nom
de fichier. Mais deux fichiers de noms differents peuvent porter la MEME photo
(recompressee). `verifier_images.py` les ecarte AVANT : sans ce passage, le score
de validation serait flatteur et faux, parce que le modele aurait deja vu
l'image qu'on lui presente comme nouvelle.

Usage :
  python food4k/entrainer_modele.py <dossier du jeu> [--mini 20] [--epoques 12]
Le dossier attendu est celui que produit `scripts/preparer-entrainement.js` :
  entrainement/<classe>/*.jpg  et  validation/<classe>/*.jpg
"""
import argparse
import collections
import io
import json
import os
import shutil
import sys

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')

# La console Windows est en cp1252 : sans cela, un simple caractere accentue ou
# un pictogramme fait planter le script APRES son travail, et l'appelant croit a
# un echec la ou tout s'est bien passe.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


import numpy as np  # noqa: E402
import tensorflow as tf  # noqa: E402

# ⚠ MESURE, PAS CHOIX PAR DEFAUT.
# Sonde lineaire du 09/09/2026 sur un echantillon equilibre de 172 classes :
#     224 px  46,4 %  justes, 14,9 ms/image
#     288 px  49,4 %  justes, 29,6 ms/image   (+3,0 points, cout x2,0)
#     320 px  49,0 %  justes, 32,3 ms/image   (+2,6 points — le rendement
#                                              s'INVERSE au-dela de 288)
# Le doublement du temps de calcul est payable : le palier embarque passe de
# ~50 a ~100 ms, quand le moindre aller-retour reseau en coute 300. Il reste
# le plus rapide de la cascade, ce qui est sa seule raison d'exister.
#
# Le chargeur du telephone lit la taille DANS le modele
# (`model.inputs[0].shape` dans lib/onDeviceVision.ts) : changer cette valeur
# ne demande aucune modification de l'application.
COTE = 288
# Le lot descend de 32 a 24 : a 288 px chaque image occupe 1,65 fois plus de
# memoire, et un lot de 32 faisait deborder la machine pendant la mise en cache.
LOT = 24


def compter(dossier):
    n = {}
    if not os.path.isdir(dossier):
        return n
    for c in sorted(os.listdir(dossier)):
        d = os.path.join(dossier, c)
        if os.path.isdir(d):
            n[c] = sum(1 for f in os.listdir(d) if f.lower().endswith(('.jpg', '.jpeg', '.png')))
    return n


def preparer_dossier(source, mini, travail):
    """Ecarte les classes trop maigres, en le DISANT.

    On copie vers un dossier de travail plutot que de toucher au jeu d'origine :
    changer le seuil `--mini` doit pouvoir se refaire sans re-moissonner.
    """
    ent = compter(os.path.join(source, 'entrainement'))
    val = compter(os.path.join(source, 'validation'))
    classes = sorted(set(ent) | set(val))

    gardees, ecartees = [], []
    for c in classes:
        # Une classe sans AUCUNE image de validation ne peut pas etre jugee :
        # la garder ferait croire a une couverture qu'on ne sait pas verifier.
        if ent.get(c, 0) >= mini and val.get(c, 0) >= 1:
            gardees.append(c)
        else:
            ecartees.append((c, ent.get(c, 0), val.get(c, 0)))

    print('  %d classes dans le jeu' % len(classes))
    print('  %d gardees (>= %d images d entrainement ET >= 1 de validation)'
          % (len(gardees), mini))
    print('  %d ecartees :' % len(ecartees))
    for c, e, v in ecartees[:40]:
        print('     %-38s entrainement %3d, validation %3d' % (c[:38], e, v))
    if len(ecartees) > 40:
        print('     ... et %d autres' % (len(ecartees) - 40))

    if os.path.isdir(travail):
        shutil.rmtree(travail)
    for partie in ('entrainement', 'validation'):
        for c in gardees:
            src = os.path.join(source, partie, c)
            if not os.path.isdir(src):
                continue
            dst = os.path.join(travail, partie, c)
            os.makedirs(dst, exist_ok=True)
            for f in os.listdir(src):
                if f.lower().endswith(('.jpg', '.jpeg', '.png')):
                    os.link(os.path.join(src, f), os.path.join(dst, f)) \
                        if hasattr(os, 'link') else shutil.copy2(
                            os.path.join(src, f), os.path.join(dst, f))
    return gardees, ecartees


def jeux(travail):
    ent = tf.keras.utils.image_dataset_from_directory(
        os.path.join(travail, 'entrainement'), image_size=(COTE, COTE),
        batch_size=LOT, label_mode='int', shuffle=True, seed=1789)
    val = tf.keras.utils.image_dataset_from_directory(
        os.path.join(travail, 'validation'), image_size=(COTE, COTE),
        batch_size=LOT, label_mode='int', shuffle=False)
    classes = ent.class_names
    # L'augmentation compense en partie le petit nombre d'images : la meme photo
    # vue retournee, recadree et plus sombre apprend davantage qu'une seule fois.
    # ⚠ Pas de retournement VERTICAL : un plat photographie a l'envers n'existe
    # pas, et l'apprendre gaspillerait de la capacite sur un cas impossible.
    aug = tf.keras.Sequential([
        tf.keras.layers.RandomFlip('horizontal'),
        tf.keras.layers.RandomRotation(0.08),
        tf.keras.layers.RandomZoom(0.15),
        tf.keras.layers.RandomContrast(0.15),
        tf.keras.layers.RandomBrightness(0.15, value_range=(0, 255)),
    ], name='augmentation')
    A = tf.data.AUTOTUNE
    ent = ent.map(lambda x, y: (aug(x, training=True), y), num_parallel_calls=A).prefetch(A)
    val = val.prefetch(A)
    return ent, val, classes


def poids_par_classe(travail, classes):
    """Une erreur sur une classe rare coute plus cher, proportionnellement."""
    n = compter(os.path.join(travail, 'entrainement'))
    total = sum(n.get(c, 0) for c in classes)
    k = len(classes)
    poids = {}
    for i, c in enumerate(classes):
        # Formule usuelle : total / (nb_classes * effectif). Bornee, parce
        # qu'un poids de 50 sur une classe a 3 images fait diverger la perte.
        p = total / max(1, k * max(1, n.get(c, 0)))
        poids[i] = float(min(p, 8.0))
    return poids


def perte_lissee(lissage):
    """Entropie croisee AVEC lissage, tout en gardant des etiquettes entieres.

    ⚠ POURQUOI CETTE FONCTION PLUTOT QU'UN PARAMETRE KERAS.
    `SparseCategoricalCrossentropy` n'accepte pas `label_smoothing` ; seule la
    version categorielle le fait, et elle exige des etiquettes one-hot. Or
    passer en one-hot casserait `class_weight`, qui a besoin d'entiers — et
    `class_weight` est ce qui empeche le modele d'abandonner les classes rares.
    On fait donc le one-hot A L'INTERIEUR de la perte : les deux garde-fous
    tiennent ensemble.

    CE QUE LE LISSAGE CHANGE, ET POURQUOI IL COMPTE ICI.
    Sans lui, la cible d'une image de `tagine with quince` est « 100 % tagine
    aux coings, 0 % tagine ». Le modele est donc puni pour hesiter entre deux
    plats que l'oeil humain ne separe pas non plus. Il apprend alors la seule
    chose qui reduit cette punition : l'exces de confiance. Et un palier
    embarque trop sur de lui ARRETE la cascade sur une fausse reponse — le pire
    comportement possible, celui qu'aucun palier suivant ne peut rattraper.
    """
    def perte(y_vrai, y_predit):
        n = tf.shape(y_predit)[-1]
        y = tf.one_hot(tf.cast(tf.reshape(y_vrai, [-1]), tf.int32), n)
        y = y * (1.0 - lissage) + lissage / tf.cast(n, tf.float32)
        return tf.keras.losses.categorical_crossentropy(y, y_predit)
    perte.__name__ = 'entropie_lissee_%g' % lissage
    return perte


def construire(nb_classes):
    """Le socle et la tete SEPAREMENT, pour pouvoir entrainer la tete seule.

    ⚠ POURQUOI CETTE SEPARATION VAUT DES HEURES.
    En phase 1, le socle est gele : il rend exactement les memes traits a chaque
    epoque. Le faire retraverser douze fois par 23 000 images coute, mesure sur
    cette machine (CPU seul, 15,8 ms par image), plus de deux heures — pour
    recalculer douze fois un resultat identique.
    On calcule donc les traits UNE fois, et la tete — une seule couche dense —
    s'entraine dessus en quelques secondes par epoque.

    La phase 2 est differente : le socle y apprend, ses traits changent, et il
    faut bien retraverser les images. Elle garde le chemin complet.
    """
    base = tf.keras.applications.MobileNetV3Large(
        input_shape=(COTE, COTE, 3), include_top=False, weights='imagenet',
        pooling='avg', include_preprocessing=True)
    base.trainable = False
    tete = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(base.output_shape[-1],)),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(nb_classes, activation='softmax', name='plats'),
    ], name='tete')

    entree = tf.keras.Input(shape=(COTE, COTE, 3))
    complet = tf.keras.Model(entree, tete(base(entree, training=False)))
    return complet, base, tete


def traits_caches(base, jeu, tours):
    """Les traits du socle gele, calcules une fois pour toutes.

    `tours` > 1 rejoue le jeu avec ses augmentations : la meme photo, retournee
    ou recadree, rend des traits differents. Sans cela, la tete ne verrait chaque
    image que sous un seul angle et surapprendrait plus vite.
    """
    X, y = [], []
    for tour in range(tours):
        for lot_x, lot_y in jeu:
            X.append(base.predict(lot_x, verbose=0))
            y.append(lot_y.numpy())
        print('    tour %d/%d de mise en cache' % (tour + 1, tours), flush=True)
    return np.concatenate(X), np.concatenate(y)


def exporter_tflite(modele, chemin):
    conv = tf.lite.TFLiteConverter.from_keras_model(modele)
    conv.optimizations = [tf.lite.Optimize.DEFAULT]
    # float16 : moitie moins lourd, sans la perte de justesse de l'int8, et
    # accepte tel quel par TensorFlow Lite sur Android.
    conv.target_spec.supported_types = [tf.float16]
    octets = conv.convert()
    io.open(chemin, 'wb').write(octets)
    return len(octets)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('jeu')
    ap.add_argument('--mini', type=int, default=20,
                    help='images d entrainement minimum pour qu une classe soit apprise')
    ap.add_argument('--epoques', type=int, default=12)
    ap.add_argument('--epoques-fines', type=int, default=6)
    ap.add_argument('--tours-cache', type=int, default=3,
                    help='passages augmentes mis en cache pour la phase 1')
    ap.add_argument('--couches-fines', type=int, default=20,
                    help='couches du socle degelees en phase 2')
    ap.add_argument('--taux-fin', type=float, default=5e-6)
    ap.add_argument('--lissage', type=float, default=0.1,
                    help='lissage d etiquettes : 0 pour l ancien comportement')
    ap.add_argument('--sortie', default='food4k/modele_entraine')
    a = ap.parse_args()

    travail = os.path.join(os.path.dirname(a.sortie) or '.', '_jeu_filtre')
    gardees, ecartees = preparer_dossier(a.jeu, a.mini, travail)
    if len(gardees) < 2:
        print('\n  ⚠ moins de deux classes atteignent le seuil : rien a entrainer.')
        return 1

    ent, val, classes = jeux(travail)
    poids = poids_par_classe(travail, classes)
    print('\n  %d classes retenues, poids de %.2f a %.2f'
          % (len(classes), min(poids.values()), max(poids.values())))

    modele, base, tete = construire(len(classes))
    os.makedirs(a.sortie, exist_ok=True)
    rappels = [
        tf.keras.callbacks.EarlyStopping(monitor='val_accuracy', patience=4,
                                         restore_best_weights=True),
        tf.keras.callbacks.ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=2),
    ]
    mesures = ['accuracy', tf.keras.metrics.SparseTopKCategoricalAccuracy(k=5, name='top5')]

    print('\n  ── phase 1 : la tete seule, sur des traits calcules UNE fois ──')
    print('  mise en cache des traits du socle gele...', flush=True)
    Xe, ye = traits_caches(base, ent, a.tours_cache)
    Xv, yv = traits_caches(base, val, 1)
    print('  %d exemples en cache (%d de validation), %d dimensions'
          % (len(Xe), len(Xv), Xe.shape[1]))

    perte = (perte_lissee(a.lissage) if a.lissage > 0
             else 'sparse_categorical_crossentropy')
    tete.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss=perte, metrics=mesures)
    # Le cache rend chaque epoque quasi gratuite : on peut en faire beaucoup
    # plus, et laisser l'arret anticipe decider quand s'arreter vraiment.
    tete.fit(Xe, ye, validation_data=(Xv, yv), epochs=max(a.epoques, 40),
             batch_size=256, class_weight=poids, callbacks=rappels, verbose=2)

    print('\n  ── phase 2 : reglage fin des dernieres couches du socle ──')
    # ⚠ CE QUI A RATE AU PREMIER ESSAI, LE 08/09/2026.
    # 40 couches degelees, taux 1e-5, perte sans lissage. La justesse
    # d'entrainement est montee de 42 % a 58 % pendant que celle de VALIDATION
    # baissait (55,3 -> 54,1). Le modele n'apprenait plus : il memorisait.
    # L'arret anticipe a restaure la premiere epoque, donc 45 minutes de calcul
    # ont rapporte 0,2 point. Trois corrections, chacune pour une raison :
    #
    #   MOINS DE COUCHES  20 au lieu de 40. Plus on degele, plus on a de
    #                     parametres a nourrir — et 25 000 images n'y suffisent
    #                     pas. Le haut du reseau porte le specifique ; le bas,
    #                     les bords et les textures, que nos plats partagent
    #                     avec ImageNet.
    #   LISSAGE 0,1       Nos classes sont VOLONTAIREMENT confusables : `tagine`
    #                     et ses quatre variantes, `bastila` et ses deux.
    #                     Exiger une certitude absolue entre deux plats quasi
    #                     identiques n'apprend rien de vrai — cela apprend
    #                     l'exces de confiance, qui est justement ce qui fait
    #                     qu'un palier embarque ARRETE la cascade sur du faux.
    #   TAUX PLUS BAS     5e-6 : on cherche a affiner, pas a redecouvrir.
    # ⚠ Seulement le HAUT du socle, et a taux d'apprentissage tres bas. Degeler
    # tout le reseau sur quelques milliers d'images effacerait ce qu'ImageNet a
    # appris et donnerait un modele PIRE qu'avant le reglage fin.
    base.trainable = True
    for couche in base.layers[:-a.couches_fines]:
        couche.trainable = False
    # ⚠ Les couches de normalisation par lot restent GELEES meme dans la partie
    # degelee. Leurs moyennes courantes ont ete estimees sur 1,3 million
    # d'images ; les reestimer sur nos lots de 32 les rend bruyantes, et le
    # modele se degrade sans que la perte d'entrainement le montre.
    for couche in base.layers:
        if isinstance(couche, tf.keras.layers.BatchNormalization):
            couche.trainable = False
    modele.compile(optimizer=tf.keras.optimizers.Adam(a.taux_fin),
                   loss=perte, metrics=mesures)
    # Le modele complet porte DEJA la tete entrainee en phase 1 : `tete` est le
    # meme objet Keras des deux cotes, pas une copie. Le reglage fin repart donc
    # d'une tete competente, et non de poids au hasard qui detruiraient le socle
    # des la premiere mise a jour.
    modele.fit(ent, validation_data=val, epochs=a.epoques_fines,
               class_weight=poids, callbacks=rappels, verbose=2)

    perte, just, top5 = modele.evaluate(val, verbose=0)
    print('\n  validation : %.1f %% de justesse, %.1f %% dans le top 5'
          % (just * 100, top5 * 100))

    # ── Ce qui sert vraiment : la justesse PAR CLASSE ────────────────────────
    # Un score global cache l'abandon des classes rares : un modele qui ignore
    # 30 classes maigres peut afficher un bon total. On regarde donc classe par
    # classe, et on nomme celles que le modele ne trouve JAMAIS.
    vrais, predits = [], []
    for lot_x, lot_y in val:
        p = modele.predict(lot_x, verbose=0)
        vrais.extend(lot_y.numpy().tolist())
        predits.extend(p.argmax(axis=1).tolist())
    bons = collections.Counter()
    total = collections.Counter()
    for v, pr in zip(vrais, predits):
        total[v] += 1
        if v == pr:
            bons[v] += 1
    jamais = [classes[i] for i in range(len(classes)) if total[i] and not bons[i]]
    print('  %d classes ne sont JAMAIS trouvees : %s'
          % (len(jamais), ', '.join(jamais[:18]) + ('…' if len(jamais) > 18 else '')))

    # ── QUI EST PRIS POUR QUI ────────────────────────────────────────────────
    # Un score par classe dit QU'ON se trompe ; il ne dit pas AVEC QUOI. Or
    # c'est la seule information qui permette d'agir : deux classes qui
    # s'echangent leurs images sont soit mal nourries, soit le meme plat sous
    # deux noms.
    #
    # ⚠ CAS CONNU AU 06/09/2026 : `khringo` et `baghrir` designent le MEME plat
    # (les crepes mille trous). Les titres de leurs images le disent —
    # « Baghrir / Khringo ». La carte des 172 classes les separe quand meme,
    # par decision. Cette liste montrera donc leur confusion : elle n'est pas un
    # defaut du modele, elle est la consequence de la carte.
    confusions = collections.Counter()
    for v, pr in zip(vrais, predits):
        if v != pr:
            confusions[(classes[v], classes[pr])] += 1
    if confusions:
        print('\n  les confusions les plus frequentes :')
        for (vrai, pris), n in confusions.most_common(12):
            reciproque = confusions.get((pris, vrai), 0)
            print('    %-28s pris pour %-28s %d fois%s'
                  % (vrai[:28], pris[:28], n,
                     '  (et %d fois l inverse)' % reciproque if reciproque else ''))

    modele.save(os.path.join(a.sortie, 'modele.keras'))
    taille = exporter_tflite(modele, os.path.join(a.sortie, 'modele.tflite'))
    io.open(os.path.join(a.sortie, 'etiquettes.json'), 'w', encoding='utf-8').write(
        json.dumps({'classes': classes}, ensure_ascii=False, indent=1))
    io.open(os.path.join(a.sortie, 'RESULTAT.json'), 'w', encoding='utf-8').write(
        json.dumps({
            'classes_apprises': len(classes),
            'classes_ecartees': [{'classe': c, 'entrainement': e, 'validation': v}
                                 for c, e, v in ecartees],
            'justesse_validation': round(float(just), 4),
            'top5_validation': round(float(top5), 4),
            'classes_jamais_trouvees': jamais,
            # Qui est pris pour qui : la seule information qui permette d agir.
            'confusions': [{'vraie': v, 'predite': p, 'fois': n}
                           for (v, p), n in confusions.most_common(30)],
            'justesse_par_classe': {classes[i]: round(bons[i] / total[i], 3)
                                    for i in range(len(classes)) if total[i]},
            'seuil_mini': a.mini,
            'tflite_octets': taille,
            'avertissement': 'Reglage fin sur peu d images. Comparer a l existant '
                             '(57,4 % global) AVANT de remplacer quoi que ce soit.',
        }, ensure_ascii=False, indent=1))

    print('\n  ecrit dans %s' % a.sortie)
    print('    modele.tflite      %.1f Mo' % (taille / 1e6))
    print('    etiquettes.json    %d classes' % len(classes))
    # Pas de « %% » ici : sans operateur % applique derriere, ce n'est pas un
    # echappement et la console affiche les deux caracteres tels quels.
    # ⚠ NE PAS RENVOYER VERS `valider_modele.py` POUR DECIDER.
    # Il ecarte les images dont la classe est absente du modele. Un candidat qui
    # a moins de classes y passe donc un examen plus facile, et son score n'est
    # pas comparable a celui du modele en place. C'est `comparer_modeles.py` qui
    # interroge les deux sur LES MEMES images.
    print('\n  Pour decider s il doit remplacer le modele du telephone :')
    print('    python food4k/comparer_modeles.py %s %s'
          % (os.path.join(a.sortie, 'modele.tflite'),
             os.path.join(a.sortie, 'etiquettes.json')))
    print('  puis, seulement s il fait mieux :')
    print('    python food4k/deployer_modele.py %s --appliquer' % a.sortie)
    return 0


if __name__ == '__main__':
    sys.exit(main())
