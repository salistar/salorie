'use client';
// Sadaqa Jariya — ce que l'effort accumulé a financé.
// ---------------------------------------------------------------------------
// Les kilomètres viennent de `users/{uid}/progression/etat`, le document que le
// téléphone alimente déjà (champ `totalKm`). Aucune nouvelle synchronisation
// n'était nécessaire : celle de la progression, écrite plus tôt dans ce
// portage, portait exactement la donnée dont cet écran a besoin.
//
// Le calcul est importé de `lib/sadaqaCalcul.ts` — extrait du module mobile
// pour l'occasion, parce qu'il était coincé derrière un import AsyncStorage.
// Un écran qui annonce à quelqu'un combien de repas son effort a financés ne
// peut pas donner deux chiffres différents selon l'appareil.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { computeSadaqa, nextMilestones, KM_PER_MEAL, KM_PER_TREE } from '../../../../lib/sadaqaCalcul';

export default function PageSadaqa() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [km, setKm] = useState<number | null>(null);

  useEffect(() => {
    if (!uid) return;
    const stop = onSnapshot(
      doc(firestore(), 'users', uid, 'progression', 'etat'),
      (snap) => {
        const v = Number((snap.data() as any)?.totalKm);
        setKm(Number.isFinite(v) && v >= 0 ? v : 0);
      },
      () => setKm(0),
    );
    return () => stop();
  }, [uid]);

  const impact = computeSadaqa(km ?? 0);
  const suite = nextMilestones(km ?? 0);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('sadaqaTitre')}</h1>
        <p className="me-sous">{t('sadaqaSous')}</p>
      </header>

      {km == null ? (
        <section className="carte-amis"><p className="me-sous">{t('communChargement')}</p></section>
      ) : km === 0 ? (
        <section className="carte-amis">
          <p className="me-sous">{t('sadaqaRienEncore')}</p>
        </section>
      ) : (
        <>
          <section className="carte-amis">
            <div className="grille-series">
              <div className="tuile-serie">
                <span className="serie-nombre">{Math.round(km)}</span>
                <span className="me-sous">{t('sadaqaKm')}</span>
              </div>
              <div className="tuile-serie">
                <span className="serie-nombre">{impact.meals}</span>
                <span className="me-sous">{t('sadaqaRepas')}</span>
              </div>
              <div className="tuile-serie">
                <span className="serie-nombre">{impact.trees}</span>
                <span className="me-sous">{t('sadaqaArbres')}</span>
              </div>
            </div>
          </section>

          <section className="carte-amis">
            <h2 className="me-h2">{t('sadaqaProchains')}</h2>

            {([['sadaqaRepas', suite.mealProgress, suite.kmToNextMeal, KM_PER_MEAL, 'prog-repas'],
               ['sadaqaArbres', suite.treeProgress, suite.kmToNextTree, KM_PER_TREE, 'prog-arbre']] as const)
              .map(([cle, avance, reste, palier, classe]) => (
                <div key={cle} className="palier-bloc">
                  <div className="ligne-champ" style={{ justifyContent: 'space-between' }}>
                    <span className="me-sous">{t(cle)} · {t('sadaqaTous')} {palier} km</span>
                    <span className="me-sous">{reste.toFixed(1)} km</span>
                  </div>
                  <div className="prog-piste">
                    <div className={`prog-remplissage ${classe}`} style={{ width: `${Math.round(avance * 100)}%` }} />
                  </div>
                </div>
              ))}

            <p className="me-note">{t('sadaqaNotePalier')}</p>
          </section>
        </>
      )}

      <section className="carte-amis">
        <p className="me-note">{t('sadaqaNoteSource')}</p>
      </section>
    </div>
  );
}
