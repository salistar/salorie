# -*- coding: utf-8 -*-
"""A quel seuil le palier embarque atteint-il 85 % de justesse, et a quel prix ?

CE QUE CE SCRIPT REPOND, ET POURQUOI LA QUESTION EST MAL POSEE AUTREMENT
« Atteindre 85 % » ne veut rien dire tant qu'on n'a pas dit 85 % DE QUOI.
Trois grandeurs differentes, trois difficultes differentes :

  JUSTESSE BRUTE     la bonne classe sur TOUTES les images, y compris celles ou
                     le modele n'est pas sur. Sur 170 classes de plats dont
                     69 aux etiquettes non verifiees, 85 % n'est pas atteignable
                     — l'etat de l'art sur Food-101 SEUL (101 classes, 75 000
                     images curatees, gros modeles) tourne autour de 93 %.
  TOP-5              la bonne classe parmi les cinq premieres. Plus accessible.
  JUSTESSE DE CE     parmi les reponses que le modele OSE donner. C'est la seule
  QUI EST SERVI      qui compte pour la cascade : sous le seuil, le palier se
                     tait et le suivant repond. Et celle-la se REGLE.

⚠ CE QUE MONTER LE SEUIL FAIT VRAIMENT.
Il n'ameliore pas le modele : il lui apprend a se taire plus souvent. Le gain
est reel — une fausse reponse assuree ARRETE la cascade, une abstention la
laisse continuer — mais il se paie en latence et en appels aux paliers suivants.
La courbe ci-dessous chiffre exactement cet echange, pour qu'il soit choisi et
non subi.

Usage :
  python food4k/courbe_confiance.py [--modele food4k/food_salorie.tflite]
                                    [--etiquettes food4k/label_map_172.json]
                                    [--vise 0.85]
"""
import argparse
import io
import json
import os
import sys

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import numpy as np  # noqa: E402

from comparer_modeles import Modele, echantillon  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--modele', default=os.path.join(ICI, 'food_salorie.tflite'))
    ap.add_argument('--etiquettes', default=os.path.join(ICI, 'label_map_172.json'))
    ap.add_argument('--vise', type=float, default=0.85)
    a = ap.parse_args()

    images = (echantillon('corpus-ia', une_par_plat=True)
              + echantillon('corpus-maghreb'))
    if not images:
        print('  ARRET : aucun corpus de mesure.')
        return 1

    m = Modele(a.modele, a.etiquettes)
    print('  %s, %d classes, %d images de mesure\n'
          % (os.path.basename(a.modele), len(m.classes), len(images)))

    # On predit UNE fois, puis on balaie les seuils sur les memes predictions :
    # refaire l'inference par seuil couterait dix fois plus pour un resultat
    # identique — et introduirait un alea entre deux lignes du tableau.
    resultats = []
    for chemin, vraie in images:
        try:
            predit, conf = m.predire(chemin)
        except Exception:
            continue
        resultats.append((conf, predit == vraie))
    conf = np.array([r[0] for r in resultats])
    juste = np.array([r[1] for r in resultats])
    total = len(resultats)

    print('  %8s %10s %10s %12s' % ('seuil', 'repond', 'couverture', 'justesse'))
    lignes = []
    for seuil in [0.0, 0.30, 0.40, 0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]:
        sert = conf >= seuil
        n = int(sert.sum())
        j = float(juste[sert].mean()) if n else 0.0
        lignes.append((seuil, n, n / total, j))
        print('  %8.2f %10d %9.1f %% %11.1f %%' % (seuil, n, 100.0 * n / total, 100.0 * j))

    # Le seuil le plus BAS qui atteint la cible : le plus bas, parce qu'a
    # justesse egale on prefere servir davantage.
    atteints = [x for x in lignes if x[3] >= a.vise and x[1] >= 20]
    print()
    if atteints:
        seuil, n, couv, j = atteints[0]
        print('  Pour %.0f %% de justesse sur ce qui est servi : seuil %.2f'
              % (a.vise * 100, seuil))
        print('  Le modele repondrait alors sur %.1f %% des photos (%d sur %d),'
              % (100.0 * couv, n, total))
        print('  et les %.1f %% restantes monteraient au palier suivant.'
              % (100.0 * (1 - couv)))
    else:
        atteignable = max(l[3] for l in lignes if l[1] >= 20)
        print('  %.0f %% N EST PAS ATTEIGNABLE en montant le seuil.' % (a.vise * 100))
        print('  Le maximum tenable (au moins 20 reponses) est %.1f %%.'
              % (100.0 * atteignable))
        print('  Monter davantage ne ferait plus que reduire l echantillon jusqu a')
        print('  ce que le chiffre ne veuille plus rien dire.')

    io.open(os.path.join(ICI, 'courbe-confiance.json'), 'w', encoding='utf-8').write(
        json.dumps({'modele': os.path.basename(a.modele), 'images': total,
                    'courbe': [{'seuil': s, 'repond': n, 'couverture': round(c, 4),
                                'justesse': round(j, 4)} for s, n, c, j in lignes]},
                   ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
