'use client';
// Accueil de l'espace personnel : la preuve visible que le compte web EST le compte
// mobile. Tout ce qui s'affiche ici vient de `users/{uid}` et de sa sous-collection
// `logs`, lus en direct par le navigateur sous les règles Firestore existantes.
import { useMemo, useState } from 'react';
import { useMe } from './MeProvider';
import { useProfil, useJournal, useLogsDepuis, jourLocal, totaux } from '../../lib/useFirestoreMe';

const OBJECTIFS: Record<string, string> = {
  lose: 'Perdre du poids',
  lose_weight: 'Perdre du poids',
  gain: 'Prendre du poids',
  gain_weight: 'Prendre du poids',
  maintain: 'Maintenir mon poids',
  muscle: 'Prendre du muscle',
  build_muscle: 'Prendre du muscle',
};

/**
 * Mini-tendance d'une tuile : la FORME des sept derniers jours, rien d'autre.
 * Pas d'axes, pas d'etiquettes, pas de bulle — c'est le regime du sparkline :
 * il accompagne un chiffre, il ne le remplace pas. Un point marque la fin.
 */
function Sparkline({ valeurs }: { valeurs: number[] }) {
  // Tout a zero : ne rien dessiner. Une ligne plate au ras du sol ressemblerait
  // a une donnee, alors que c'est une absence.
  if (!valeurs.length || valeurs.every((v) => v === 0)) return null;
  const L = 100;
  const H = 28;
  const max = Math.max(...valeurs, 1);
  const pts = valeurs.map((v, i) => ({
    x: (i / (valeurs.length - 1)) * (L - 6) + 3,
    y: H - 4 - (v / max) * (H - 8),
  }));
  const d = 'M ' + pts.map((p2) => `${p2.x.toFixed(1)},${p2.y.toFixed(1)}`).join(' L ');
  const fin = pts[pts.length - 1];
  return (
    <svg className="me-tuile-spark" viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={fin.x} cy={fin.y} r="2.6" fill="currentColor" />
    </svg>
  );
}

function Tuile({
  titre,
  valeur,
  detail,
  accent,
  spark,
}: {
  titre: string;
  valeur: string;
  detail?: string;
  accent?: boolean;
  spark?: number[];
}) {
  return (
    <div className={`me-tuile${accent ? ' accent' : ''}`}>
      <div className="me-tuile-titre">{titre}</div>
      <div className="me-tuile-valeur">{valeur}</div>
      {detail ? <div className="me-tuile-detail">{detail}</div> : null}
      {spark ? <Sparkline valeurs={spark} /> : null}
    </div>
  );
}

/** `YYYY-MM-DD` local, décalé de n jours. */
function jourDecale(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return jourLocal(d);
}

/**
 * La semaine en barres — sept jours de calories face à l'objectif.
 *
 * Choix de forme (et pas d'ornement) : sept magnitudes quotidiennes → des
 * barres ancrées à la ligne de base ; UNE série, donc pas de légende, le titre
 * suffit. L'objectif est une référence discrète en pointillés, pas une seconde
 * série. Étiquettes SÉLECTIVES : la valeur ne s'affiche que sur aujourd'hui et
 * sur le jour survolé ou focalisé — un chiffre sur chaque barre serait du bruit.
 */
function SemaineKcal({ lignes, cible }: { lignes: any[]; cible: number }) {
  const [survol, setSurvol] = useState<number | null>(null);

  const jours = useMemo(() => {
    const parJour = new Map<string, number>();
    for (const l of lignes) {
      if (l.type !== 'meal' || !l.date) continue;
      parJour.set(l.date, (parJour.get(l.date) || 0) + (Number(l.calories) || 0));
    }
    const auj = jourLocal();
    return Array.from({ length: 7 }, (_, i) => {
      const date = jourDecale(i - 6);
      const d = new Date(`${date}T00:00:00`);
      return {
        date,
        // Initiale du jour : assez pour se repérer, pas assez pour encombrer.
        libelle: d.toLocaleDateString('fr-FR', { weekday: 'narrow' }),
        long: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
        kcal: Math.round(parJour.get(date) || 0),
        aujourdhui: date === auj,
      };
    });
  }, [lignes]);

  // L'échelle inclut l'objectif : une barre qui le dépasse doit se voir DÉPASSER.
  const max = Math.max(cible, ...jours.map((j) => j.kcal), 1);
  const rien = jours.every((j) => j.kcal === 0);

  return (
    <section className="carte-amis sem-carte">
      <div className="ligne-champ" style={{ justifyContent: 'space-between' }}>
        <h2 className="me-h2" style={{ margin: 0 }}>Ta semaine</h2>
        {cible ? <span className="me-note">objectif {cible} kcal / jour</span> : null}
      </div>

      <div className="sem-cadre">
        {cible ? (
          <div className="sem-objectif" style={{ bottom: `${(cible / max) * 100}%` }} aria-hidden />
        ) : null}
        <div className="sem-barres">
          {jours.map((j, i) => (
            <div
              key={j.date}
              className="sem-jour"
              tabIndex={0}
              role="img"
              aria-label={`${j.long} : ${j.kcal} kcal`}
              onMouseEnter={() => setSurvol(i)}
              onMouseLeave={() => setSurvol(null)}
              onFocus={() => setSurvol(i)}
              onBlur={() => setSurvol(null)}
            >
              <span className={`sem-valeur${j.aujourdhui || survol === i ? ' visible' : ''}`}>
                {j.kcal}
              </span>
              <div
                className={`sem-barre${j.aujourdhui ? ' actuel' : ''}`}
                style={{ height: `${Math.max(j.kcal > 0 ? 4 : 2, (j.kcal / max) * 100)}%` }}
              />
              <span className={`sem-libelle${j.aujourdhui ? ' actuel' : ''}`}>{j.libelle}</span>
            </div>
          ))}
        </div>
      </div>

      {rien ? (
        <p className="me-note">Encore rien cette semaine — le premier repas enregistré dessinera la première barre.</p>
      ) : null}
    </section>
  );
}

export default function AccueilMe() {
  const { uid, prenom, email } = useMe();
  const { profil, charge, erreur } = useProfil(uid);
  const aujourdhui = jourLocal();
  const { lignes } = useJournal(uid, aujourdhui);
  const t = totaux(lignes);

  // UNE lecture de sept jours, partagee entre le graphique de la semaine et
  // les mini-tendances des tuiles — pas une requete par tuile.
  const { lignes: semaine } = useLogsDepuis(uid, jourDecale(-6));
  const tendances = useMemo(() => {
    const jours = Array.from({ length: 7 }, (_, i) => jourDecale(i - 6));
    const zero = () => new Map(jours.map((j) => [j, 0]));
    const kcal = zero(), prot = zero(), brulees = zero(), eau = zero();
    for (const l of semaine) {
      if (!l.date || !kcal.has(l.date)) continue;
      const v = Number(l.calories) || 0;
      if (l.type === 'meal') {
        kcal.set(l.date, (kcal.get(l.date) || 0) + v);
        prot.set(l.date, (prot.get(l.date) || 0) + (Number(l.protein) || 0));
      } else if (l.type === 'activity') {
        brulees.set(l.date, (brulees.get(l.date) || 0) + v);
      } else if (l.type === 'water') {
        eau.set(l.date, (eau.get(l.date) || 0) + v);
      }
    }
    const serie = (m: Map<string, number>) => jours.map((j) => m.get(j) || 0);
    return { kcal: serie(kcal), prot: serie(prot), brulees: serie(brulees), eau: serie(eau) };
  }, [semaine]);

  const nom = profil?.firstName || prenom || email.split('@')[0];
  const objectif = profil?.goal ? OBJECTIFS[profil.goal] || profil.goal : null;
  const cible = Number(profil?.nutritionalPlan?.dailyCalories) || 0;
  const restant = cible ? Math.max(0, cible - t.kcal) : 0;

  if (erreur) {
    return (
      <div className="me-centre">
        <p className="me-erreur">Lecture refusée par Firestore : {erreur}</p>
        <p className="me-centre-txt">
          Cela signifie que la session ne porte pas l'identité attendue. Déconnecte-toi puis
          reconnecte-toi.
        </p>
      </div>
    );
  }

  return (
    <div className="me-page">
      <header className="me-entete">
        <h1>
          Bon retour, <span className="me-prenom">{nom}</span> 👋
        </h1>
        <p className="me-sous">
          {objectif ? (
            <>
              Ton objectif : <b>{objectif}</b>
              {profil?.weight ? <> · Poids actuel : <b>{profil.weight} kg</b></> : null}
            </>
          ) : charge ? (
            <>Ton profil n'a pas encore d'objectif — ouvre l'app pour terminer ton parcours.</>
          ) : (
            <>Chargement de ton profil…</>
          )}
        </p>
      </header>

      <section className="me-tuiles">
        <Tuile
          titre="Calories du jour"
          valeur={cible ? `${t.kcal} / ${cible}` : String(t.kcal)}
          detail={cible ? `${restant} kcal restantes` : 'Objectif non défini'}
          accent
          spark={tendances.kcal}
        />
        <Tuile titre="Repas enregistrés" valeur={String(t.nbRepas)} detail="aujourd'hui" />
        <Tuile
          titre="Protéines"
          valeur={`${t.proteines} g`}
          detail={`Glucides ${t.glucides} g · Lipides ${t.lipides} g`}
          spark={tendances.prot}
        />
        <Tuile
          titre="Activité"
          valeur={t.kcalBrulees ? `${t.kcalBrulees} kcal` : '—'}
          detail={t.nbActivites ? `${t.nbActivites} séance(s)` : 'Aucune séance'}
          spark={tendances.brulees}
        />
        <Tuile
          titre="Hydratation"
          valeur={t.eauMl ? `${(t.eauMl / 1000).toFixed(1)} L` : '—'}
          detail="objectif 2 L"
          spark={tendances.eau}
        />
      </section>

      {uid ? <SemaineKcal lignes={semaine} cible={cible} /> : null}

      <section className="me-actions">
        <a className="btn btn-primary btn-lg" href="/me/diary">
          Ouvrir mon journal
        </a>
        <a className="btn btn-lg" href="/me/scan">
          Scanner un repas
        </a>
      </section>

      <p className="me-note">
        Ces données sont les mêmes que sur ton téléphone, en direct : une modification d'un
        côté apparaît de l'autre sans rechargement.
      </p>
    </div>
  );
}
