'use client';
// Accueil de l'espace personnel : la preuve visible que le compte web EST le compte
// mobile. Tout ce qui s'affiche ici vient de `users/{uid}` et de sa sous-collection
// `logs`, lus en direct par le navigateur sous les regles Firestore existantes.
import { useMe } from './MeProvider';
import { useProfil, useJournal, jourLocal, totaux } from '../../lib/useFirestoreMe';

const OBJECTIFS: Record<string, string> = {
  lose: 'Perdre du poids',
  lose_weight: 'Perdre du poids',
  gain: 'Prendre du poids',
  gain_weight: 'Prendre du poids',
  maintain: 'Maintenir mon poids',
  muscle: 'Prendre du muscle',
  build_muscle: 'Prendre du muscle',
};

function Tuile({
  titre,
  valeur,
  detail,
  accent,
}: {
  titre: string;
  valeur: string;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <div className={`me-tuile${accent ? ' accent' : ''}`}>
      <div className="me-tuile-titre">{titre}</div>
      <div className="me-tuile-valeur">{valeur}</div>
      {detail ? <div className="me-tuile-detail">{detail}</div> : null}
    </div>
  );
}

export default function AccueilMe() {
  const { uid, prenom, email } = useMe();
  const { profil, charge, erreur } = useProfil(uid);
  const aujourdhui = jourLocal();
  const { lignes } = useJournal(uid, aujourdhui);
  const t = totaux(lignes);

  const nom = profil?.firstName || prenom || email.split('@')[0];
  const objectif = profil?.goal ? OBJECTIFS[profil.goal] || profil.goal : null;
  const cible = Number(profil?.nutritionalPlan?.dailyCalories) || 0;
  const restant = cible ? Math.max(0, cible - t.kcal) : 0;

  if (erreur) {
    return (
      <div className="me-centre">
        <p className="me-erreur">Lecture refusee par Firestore : {erreur}</p>
        <p className="me-centre-txt">
          Cela signifie que la session ne porte pas l'identite attendue. Deconnecte-toi puis
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
          detail={cible ? `${restant} kcal restantes` : 'Objectif non defini'}
          accent
        />
        <Tuile titre="Repas enregistres" valeur={String(t.nbRepas)} detail="aujourd'hui" />
        <Tuile
          titre="Proteines"
          valeur={`${t.proteines} g`}
          detail={`Glucides ${t.glucides} g · Lipides ${t.lipides} g`}
        />
        <Tuile
          titre="Activite"
          valeur={t.kcalBrulees ? `${t.kcalBrulees} kcal` : '—'}
          detail={t.nbActivites ? `${t.nbActivites} seance(s)` : 'Aucune seance'}
        />
        <Tuile
          titre="Hydratation"
          valeur={t.eauMl ? `${(t.eauMl / 1000).toFixed(1)} L` : '—'}
          detail="objectif 2 L"
        />
      </section>

      <section className="me-actions">
        <a className="btn btn-primary btn-lg" href="/me/diary">
          Ouvrir mon journal
        </a>
        <a className="btn btn-lg" href="/me/scan">
          Scanner un repas
        </a>
      </section>

      <p className="me-note">
        Ces donnees sont les memes que sur ton telephone, en direct : une modification d'un
        cote apparait de l'autre sans rechargement.
      </p>
    </div>
  );
}
