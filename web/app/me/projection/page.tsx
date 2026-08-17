'use client';
// Budget de la semaine, et projection de poids.
// ---------------------------------------------------------------------------
// Deux ecrans du mobile reunis, parce qu'ils repondent a la MEME question a deux
// echelles : « est-ce que je suis sur la bonne trajectoire ? »
//
//   - Le budget calories du mobile ne montre qu'AUJOURD'HUI. Or personne ne
//     mange pareil sept jours de suite : ce qui compte, c'est le solde de la
//     SEMAINE, et le motif qui s'y dessine (le week-end qui annule la semaine).
//   - Le jumeau metabolique projette le poids. Sur telephone, changer l'apport
//     pour voir l'effet demande de retaper un nombre ; ici on tire un curseur et
//     la courbe suit. C'est la question « et si je mangeais 200 kcal de moins ? »
//     qui devient repondable en deux secondes.
//
// Le TDEE utilise est celui MESURE sur les vraies donnees quand il existe, pas
// l'estimation tiree du profil. Afficher deux maintenances differentes dans la
// meme app rendrait les deux suspectes.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil, useHistoriquePoids, useLogsDepuis } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { computeAdaptiveTDEE } from '../../../lib/partage/adaptiveTDEE';
import { estimateTDEE, type ProfileLite } from '../../../lib/partage/projections';

const KCAL_PAR_KG = 7700;
const FENETRE_TDEE = 21;

function jourLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PageProjection() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);
  const locale = langue === 'ar' ? 'ar-MA' : langue === 'en' ? 'en-GB' : 'fr-FR';

  // Fenetre posee apres le montage : page pre-rendue au build, une date figee
  // dans le HTML serait celle de la compilation.
  const [depuis, setDepuis] = useState('');
  useEffect(() => {
    setDepuis(jourLocal(new Date(Date.now() - FENETRE_TDEE * 86400000)));
  }, []);

  const { lignes, charge } = useLogsDepuis(uid, depuis);
  const points = useHistoriquePoids(uid);

  const cible = Number(profil?.nutritionalPlan?.dailyCalories) || 2000;
  const [apport, setApport] = useState<number | null>(null);
  // Le curseur part de la cible actuelle, une fois le profil charge.
  useEffect(() => {
    if (apport === null && profil) setApport(cible);
  }, [profil, cible, apport]);

  // ── Maintenance : mesuree si possible, estimee sinon ────────────────────────
  const { tdee, mesure } = useMemo(() => {
    const pesees = (points || []).map((p) => ({ weight: p.weight, timestamp: p.date }));
    const repas = (lignes || [])
      .filter((l) => l.type !== 'activity' && l.type !== 'water')
      .map((l) => ({ calories: l.calories, timestamp: l.timestamp ?? l.date }));
    const r = computeAdaptiveTDEE(repas, pesees, profil?.goal, FENETRE_TDEE);
    if (r.tdee != null) return { tdee: r.tdee, mesure: true };
    const lite: ProfileLite = {
      weight: profil?.weight,
      goal: profil?.goal,
      dailyCalories: cible,
    };
    return { tdee: estimateTDEE(lite), mesure: false };
  }, [points, lignes, profil, cible]);

  // ── Budget des sept derniers jours ─────────────────────────────────────────
  const semaine = useMemo(() => {
    const parJour: Record<string, number> = {};
    for (const l of lignes || []) {
      if (l.type === 'activity' || l.type === 'water' || !l.date) continue;
      parJour[String(l.date)] = (parJour[String(l.date)] || 0) + (Number(l.calories) || 0);
    }
    const n = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() - (6 - i));
      const k = jourLocal(d);
      const mange = Math.round(parJour[k] || 0);
      return {
        cle: k,
        mange,
        // Un jour sans aucune ligne n'est PAS un jour a -2000 kcal de solde : on
        // ne sait pas ce qui a ete mange. Le compter comme un jeune complet
        // fausserait tout le bilan de la semaine.
        vide: !(k in parJour),
        solde: mange ? cible - mange : 0,
        label: d.toLocaleDateString(locale, { weekday: 'short' }),
      };
    });
  }, [lignes, cible, locale]);

  const joursRenseignes = semaine.filter((j) => !j.vide);
  const soldeSemaine = joursRenseignes.reduce((a, j) => a + j.solde, 0);
  const maxEcart = Math.max(1, ...semaine.map((j) => Math.abs(j.solde)));

  // ── Projection de poids ────────────────────────────────────────────────────
  const poidsActuel = Number(profil?.weight) || (points?.length ? Number(points[points.length - 1]?.weight) : 0) || 0;
  const app = apport ?? cible;
  const kgParSemaine = ((app - tdee) * 7) / KCAL_PAR_KG;

  const courbe = useMemo(() => {
    if (!poidsActuel) return [];
    return Array.from({ length: 27 }, (_, s) => ({
      semaine: s,
      poids: Math.round((poidsActuel + (kgParSemaine * s)) * 10) / 10,
    }));
  }, [poidsActuel, kgParSemaine]);

  const minP = courbe.length ? Math.min(...courbe.map((c) => c.poids)) : 0;
  const maxP = courbe.length ? Math.max(...courbe.map((c) => c.poids)) : 0;
  // Une trajectoire plate donnerait une plage nulle : division par zero et
  // courbe invisible. On force une plage minimale de 1 kg.
  const plage = Math.max(1, maxP - minP);
  const chemin = courbe
    .map((c, i) => {
      const x = (i / Math.max(1, courbe.length - 1)) * 600;
      const y = 130 - ((c.poids - minP) / plage) * 110 - 10;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const dans6mois = courbe.length ? courbe[courbe.length - 1].poids : 0;
  const ecartCible = app - cible;

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('projTitre')}</h1>
        <p className="me-sous">{t('projSous')}</p>
      </header>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : (
        <>
          <section className="carte-amis">
            <h2 className="me-h2">{t('projSemaine')}</h2>
            <div className="budget-semaine">
              {semaine.map((j) => (
                <div key={j.cle} className="budget-col">
                  {/* Chaque jour s'ecarte d'une ligne mediane : au-dessus il
                      reste du budget, en dessous il est depasse. Une barre qui
                      part du bas ne montrerait pas ce signe d'un coup d'oeil. */}
                  <div className="budget-piste">
                    <div
                      className={`budget-barre ${j.vide ? 'budget-inconnu' : j.solde >= 0 ? 'budget-sous' : 'budget-sur'}`}
                      style={
                        j.vide
                          ? { height: '6px', top: '50%' }
                          : j.solde >= 0
                          ? { height: `${(j.solde / maxEcart) * 46}%`, bottom: '50%' }
                          : { height: `${(-j.solde / maxEcart) * 46}%`, top: '50%' }
                      }
                    />
                    <div className="budget-axe" />
                  </div>
                  <span className="budget-val">{j.vide ? '—' : j.solde > 0 ? `+${j.solde}` : j.solde}</span>
                  <span className="barre-lab">{j.label}</span>
                </div>
              ))}
            </div>
            <div className="grille-series">
              <div className="tuile-serie">
                <span className="serie-nombre">{soldeSemaine > 0 ? `+${soldeSemaine}` : soldeSemaine}</span>
                <span className="me-sous">{t('projSoldeSemaine')}</span>
              </div>
              <div className="tuile-serie">
                <span className="serie-nombre">{joursRenseignes.length}<span className="serie-sur"> / 7</span></span>
                <span className="me-sous">{t('projJoursRenseignes')}</span>
              </div>
            </div>
            {joursRenseignes.length < 7 ? <p className="me-note">{t('projJoursManquants')}</p> : null}
          </section>

          <section className="carte-amis">
            <h2 className="me-h2">{t('projProjection')}</h2>
            {!poidsActuel ? (
              <p className="me-sous">{t('projPasDePoids')}</p>
            ) : (
              <>
                <p className="me-note">
                  {t(mesure ? 'projTdeeMesure' : 'projTdeeEstime').replace('{t}', String(tdee))}
                </p>

                <label className="champ-bloc" style={{ marginTop: 12 }}>
                  <span className="me-sous">
                    {t('projApport')} : <strong>{app} kcal</strong>
                    {ecartCible ? ` (${ecartCible > 0 ? '+' : ''}${ecartCible} ${t('projVsCible')})` : ''}
                  </span>
                  {/* Le curseur est bride au meme plancher de 1200 kcal que
                      l'ecran des reglages : une simulation qui laisse explorer
                      800 kcal donne une idee, et une app de sante ne suggere pas
                      d'idees dangereuses. */}
                  <input
                    type="range" min={1200} max={4500} step={50}
                    value={app}
                    onChange={(e) => setApport(Number(e.target.value))}
                    aria-label={t('projApport')}
                    className="curseur"
                  />
                </label>

                <svg viewBox="0 0 600 130" className="courbe-proj" role="img" aria-hidden>
                  <path d={chemin} fill="none" stroke="#2e8b57" strokeWidth="2.5" strokeLinejoin="round" />
                </svg>

                <div className="grille-series">
                  <div className="tuile-serie">
                    <span className="serie-nombre">{poidsActuel}</span>
                    <span className="me-sous">{t('projAujourdhui')} (kg)</span>
                  </div>
                  <div className="tuile-serie">
                    <span className="serie-nombre">{dans6mois}</span>
                    <span className="me-sous">{t('projDansSixMois')} (kg)</span>
                  </div>
                  <div className="tuile-serie">
                    <span className="serie-nombre">{kgParSemaine > 0 ? '+' : ''}{kgParSemaine.toFixed(2)}</span>
                    <span className="me-sous">{t('projParSemaine')}</span>
                  </div>
                </div>

                {Math.abs(kgParSemaine) > 1 ? (
                  <p className="me-erreur">{t('projRythmeEleve')}</p>
                ) : null}
              </>
            )}
          </section>

          <p className="me-note">{t('projAvertissement')}</p>
        </>
      )}
    </div>
  );
}
