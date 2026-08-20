'use client';
// Analyses personnelles : poids, calories, hydratation, et l'analyse precalculee.
// Les memes chiffres que sur le telephone, puisque ce sont les memes documents.
import { useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { Courbe, Barres } from '../Graphiques';
import {
  useProfil,
  useHistoriquePoids,
  useLogsDepuis,
  useInsight,
  clePeriode,
  jourLocal,
} from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';

/** Les N derniers jours, du plus ancien au plus recent, au format `YYYY-MM-DD`. */
function derniersJours(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const j = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
    out.push(jourLocal(j));
  }
  return out;
}

export default function PageAnalyses() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language || 'fr') as Langue;
  const t = traducteur(langue);
  const dir = sensLecture(langue);
  const rtl = dir === 'rtl';

  const [portee, setPortee] = useState<'week' | 'month'>('week');
  const jours = useMemo(() => derniersJours(30), []);
  const { lignes, charge } = useLogsDepuis(uid, jours[0]);
  const poids = useHistoriquePoids(uid);
  const { insight } = useInsight(uid, clePeriode(portee));

  const cible = Number(profil?.nutritionalPlan?.dailyCalories) || 0;

  // Calories par jour sur 30 jours : les jours sans repas comptent zero, sinon la
  // courbe se resserrerait sur les seuls jours renseignes et donnerait une fausse
  // impression de regularite.
  const parJour = useMemo(() => {
    const somme = new Map<string, number>();
    for (const j of jours) somme.set(j, 0);
    for (const l of lignes) {
      if (l.type !== 'meal' || !l.date) continue;
      if (somme.has(l.date)) somme.set(l.date, (somme.get(l.date) || 0) + (Number(l.calories) || 0));
    }
    return jours.map((j) => ({ x: j, y: somme.get(j) || 0 }));
  }, [jours, lignes]);

  const courbePoids = useMemo(
    () => poids.filter((p) => Number(p.weight)).map((p) => ({ x: String(p.date).slice(5), y: Number(p.weight) })),
    [poids],
  );

  const eauParJour = useMemo(() => {
    const somme = new Map<string, number>();
    for (const l of lignes) {
      if (l.type !== 'water' || !l.date) continue;
      somme.set(l.date, (somme.get(l.date) || 0) + (Number(l.calories) || 0));
    }
    const valeurs = jours.map((j) => somme.get(j) || 0).filter((v) => v > 0);
    return valeurs.length ? Math.round(valeurs.reduce((a, b) => a + b, 0) / valeurs.length) : 0;
  }, [jours, lignes]);

  const joursActifs = parJour.filter((p) => p.y > 0).length;
  const moyenneKcal = joursActifs
    ? Math.round(parJour.reduce((a, p) => a + p.y, 0) / joursActifs)
    : 0;

  const texte = (insight?.[langue] || insight?.fr || insight?.en) as Record<string, string> | undefined;

  return (
    <div className="me-page" dir={dir}>
      <header className="me-entete">
        <h1>{t('analysesTitre')}</h1>
        <p className="me-sous">{t('analysesSous')}</p>
      </header>

      <section className="me-tuiles">
        <div className="me-tuile accent">
          <div className="me-tuile-titre">{t('analysesMoyenne')}</div>
          <div className="me-tuile-valeur">{moyenneKcal || '—'}</div>
          <div className="me-tuile-detail">
            kcal · {joursActifs} {t('analysesJoursSuivis')}
          </div>
        </div>
        <div className="me-tuile">
          <div className="me-tuile-titre">{t('analysesPoids')}</div>
          <div className="me-tuile-valeur">
            {courbePoids.length ? `${courbePoids[courbePoids.length - 1].y} kg` : '—'}
          </div>
          <div className="me-tuile-detail">
            {courbePoids.length > 1
              ? `${(courbePoids[courbePoids.length - 1].y - courbePoids[0].y > 0 ? '+' : '')}${(
                  courbePoids[courbePoids.length - 1].y - courbePoids[0].y
                ).toFixed(1)} kg`
              : t('analysesPasAssez')}
          </div>
        </div>
        <div className="me-tuile">
          <div className="me-tuile-titre">{t('eau')}</div>
          <div className="me-tuile-valeur">{eauParJour ? `${(eauParJour / 1000).toFixed(1)} L` : '—'}</div>
          <div className="me-tuile-detail">{t('analysesMoyenneJour')}</div>
        </div>
        {insight?.healthScore != null ? (
          <div className="me-tuile">
            <div className="me-tuile-titre">{t('analysesScore')}</div>
            <div className="me-tuile-valeur">{insight.healthScore}/100</div>
            <div className="me-tuile-detail">
              {insight.source === 'ai' ? t('analysesParIA') : t('analysesCalcule')}
            </div>
          </div>
        ) : null}
      </section>

      <h2 className="me-h2">{t('analysesCaloriesJour')}</h2>
      <div className="carte-graphe">
        {charge ? <Barres points={parJour} cible={cible} inverse={rtl} /> : <div className="graphe-vide">…</div>}
        {cible ? <p className="graphe-legende">{t('analysesTraitObjectif')} : {cible} kcal</p> : null}
      </div>

      <h2 className="me-h2">{t('analysesEvolutionPoids')}</h2>
      <div className="carte-graphe">
        <Courbe points={courbePoids} unite=" kg" inverse={rtl} />
      </div>

      <h2 className="me-h2">{t('analysesBilan')}</h2>
      <div className="onglets">
        <button
          className={`onglet${portee === 'week' ? ' actif' : ''}`}
          onClick={() => setPortee('week')}
        >
          {t('analysesSemaine')}
        </button>
        <button
          className={`onglet${portee === 'month' ? ' actif' : ''}`}
          onClick={() => setPortee('month')}
        >
          {t('analysesMois')}
        </button>
      </div>

      {texte ? (
        <div className="carte-bilan">
          <p className="bilan-resume">{texte.summary}</p>
          <div className="bilan-grille">
            <div>
              <span>{t('analysesAlimentFrequent')}</span>
              <b>{texte.topFood}</b>
            </div>
            <div>
              <span>{t('eau')}</span>
              <b>{texte.hydrationStatus}</b>
            </div>
          </div>
          {texte.exerciseAnalysis ? <p className="bilan-ligne">{texte.exerciseAnalysis}</p> : null}
          {texte.recommendation ? (
            <p className="bilan-conseil">💡 {texte.recommendation}</p>
          ) : null}
        </div>
      ) : (
        <div className="me-vide">{t('analysesBilanAbsent')}</div>
      )}

      <p className="me-note">{t('analysesNote')}</p>
    </div>
  );
}
