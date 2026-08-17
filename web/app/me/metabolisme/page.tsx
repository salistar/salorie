'use client';
// Mon metabolisme — le chiffre, et surtout COMMENT il a ete obtenu.
// ---------------------------------------------------------------------------
// C'est l'ecran le plus mal servi par le telephone. Le TDEE adaptatif est un
// calcul contre-intuitif : « tu manges 2100 kcal, tu perds 300 g par semaine,
// donc ta maintenance est autour de 2430 ». Sans le raisonnement affiche, le
// chiffre a l'air sorti de nulle part — et un chiffre qu'on ne comprend pas, on
// ne le suit pas.
//
// La page montre les DEUX cotes : la conclusion, et les donnees qui la portent
// (combien de jours de repas, combien de pesees, sur quelle duree). Quand il n'y
// en a pas assez, elle le dit et n'affiche AUCUN chiffre — un TDEE invente est
// pire qu'un TDEE absent.
import { useMemo } from 'react';
import { useMe } from '../MeProvider';
import { useProfil, useHistoriquePoids, useLogsDepuis } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { computeAdaptiveTDEE } from '../../../lib/partage/adaptiveTDEE';

/** Fenetre d'observation, identique au mobile. */
const FENETRE_JOURS = 21;
/** 1 kg de tissu adipeux ≈ 7700 kcal — la constante qui rend le calcul lisible. */
const KCAL_PAR_KG = 7700;

function ilYA(jours: number): string {
  const d = new Date(Date.now() - jours * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PageMetabolisme() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const depuis = useMemo(() => ilYA(FENETRE_JOURS), []);
  const { lignes } = useLogsDepuis(uid, depuis);
  const points = useHistoriquePoids(uid);

  const res = useMemo(() => {
    // `computeAdaptiveTDEE` lit `.timestamp` sur les pesees ; l'historique web ne
    // porte qu'une `date` (AAAA-MM-JJ). Sans cette conversion, chaque pesee
    // ressortait a 0 ms, donc filtree — et la page aurait affiche « pas assez de
    // donnees » indefiniment, meme avec des mois d'historique.
    const pesees = (points || []).map((p) => ({ weight: p.weight, timestamp: p.date }));
    // Meme precaution cote repas : toutes les lignes n'ont pas forcement un
    // `timestamp`, mais toutes ont une `date` — c'est le champ sur lequel elles
    // sont requetees. `toMs` sait lire les deux.
    const repas = (lignes || [])
      .filter((l) => l.type !== 'activity' && l.type !== 'water')
      .map((l) => ({ calories: l.calories, timestamp: l.timestamp ?? l.date }));
    return computeAdaptiveTDEE(repas, pesees, profil?.goal, FENETRE_JOURS);
  }, [lignes, points, profil?.goal]);

  const planActuel = Number(profil?.nutritionalPlan?.dailyCalories) || 0;
  // L'ecart entre la cible actuelle et celle que les donnees suggerent : c'est
  // la seule information qui appelle une decision.
  const ecart = res.recommendedTarget && planActuel ? res.recommendedTarget - planActuel : 0;

  const badge =
    res.confidence === 'high' ? 'verdict-super' : res.confidence === 'medium' ? 'verdict-correct' : 'verdict-eviter';

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('metaTitre')}</h1>
        <p className="me-sous">{t('metaSous')}</p>
      </header>

      {res.tdee == null ? (
        <section className="carte-amis">
          <h2 className="me-h2">{t('metaPasAssez')}</h2>
          {/* On dit ce qui manque, avec les compteurs reels — « reviens plus tard »
              n'apprend rien a personne. */}
          <div className="grille-series">
            <div className="tuile-serie">
              <span className="serie-nombre">{res.intakeDays}<span className="serie-sur"> / 7</span></span>
              <span className="me-sous">{t('metaJoursRepas')}</span>
            </div>
            <div className="tuile-serie">
              <span className="serie-nombre">{res.weighIns}<span className="serie-sur"> / 2</span></span>
              <span className="me-sous">{t('metaPesees')}</span>
            </div>
            <div className="tuile-serie">
              <span className="serie-nombre">{res.spanDays}<span className="serie-sur"> / 7</span></span>
              <span className="me-sous">{t('metaEtendue')}</span>
            </div>
          </div>
          <p className="me-note">{t('metaPourquoiDeux')}</p>
        </section>
      ) : (
        <>
          <section className="carte-amis">
            <div className="ligne-champ" style={{ justifyContent: 'space-between' }}>
              <h2 className="me-h2" style={{ margin: 0 }}>{t('metaMaintenance')}</h2>
              <span className={`puce-verdict ${badge}`}>{t(`metaConfiance_${res.confidence}`)}</span>
            </div>
            <p className="meta-grand">{res.tdee} <span className="meta-unite">kcal / {t('metaJour')}</span></p>

            {/* LE RAISONNEMENT, pas seulement le resultat. C'est tout l'objet de
                cette page : rendre le calcul verifiable a la main. */}
            <ol className="meta-etapes">
              <li>
                {t('metaEtape1').replace('{n}', String(res.avgIntake)).replace('{j}', String(res.intakeDays))}
              </li>
              <li>
                {t(res.trendKgPerWeek < 0 ? 'metaEtape2Perte' : res.trendKgPerWeek > 0 ? 'metaEtape2Prise' : 'metaEtape2Stable')
                  .replace('{kg}', Math.abs(res.trendKgPerWeek).toFixed(2))
                  .replace('{p}', String(res.weighIns))
                  .replace('{d}', String(res.spanDays))}
              </li>
              <li>
                {t('metaEtape3')
                  .replace('{kcal}', String(Math.abs(Math.round((res.trendKgPerWeek / 7) * KCAL_PAR_KG))))
                  .replace('{sens}', t(res.trendKgPerWeek < 0 ? 'metaPuise' : 'metaStocke'))}
              </li>
              <li>
                {t('metaEtape4').replace('{a}', String(res.avgIntake)).replace('{t}', String(res.tdee))}
              </li>
            </ol>
          </section>

          {res.recommendedTarget ? (
            <section className="carte-amis">
              <h2 className="me-h2">{t('metaCible')}</h2>
              <div className="grille-series">
                <div className="tuile-serie">
                  <span className="serie-nombre">{res.recommendedTarget}</span>
                  <span className="me-sous">{t('metaConseillee')}</span>
                </div>
                {planActuel ? (
                  <div className="tuile-serie">
                    <span className="serie-nombre">{planActuel}</span>
                    <span className="me-sous">{t('metaActuelle')}</span>
                  </div>
                ) : null}
                {ecart ? (
                  <div className="tuile-serie">
                    <span className="serie-nombre">{ecart > 0 ? `+${ecart}` : ecart}</span>
                    <span className="me-sous">{t('metaEcart')}</span>
                  </div>
                ) : null}
              </div>
              <p className="me-note">
                {t(profil?.goal === 'lose' ? 'metaRegleLose' : profil?.goal === 'gain' ? 'metaRegleGain' : 'metaRegleMaintain')}
              </p>
              {/* On NE change PAS la cible d'ici. Modifier un objectif calorique
                  se fait en connaissance de cause, sur l'ecran prevu pour, avec
                  son garde-fou de 1200 kcal. */}
              <a className="btn btn-ghost" href="/me/reglages">{t('metaAllerReglages')}</a>
            </section>
          ) : null}
        </>
      )}

      <section className="carte-amis">
        <h2 className="me-h2">{t('metaPourquoiTitre')}</h2>
        <p className="me-sous">{t('metaPourquoiTexte').replace('{k}', String(KCAL_PAR_KG))}</p>
      </section>

      <p className="me-note">{t('metaAvertissement')}</p>
    </div>
  );
}
