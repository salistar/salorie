'use client';
// Journal alimentaire web — le MEME que celui du telephone.
// ---------------------------------------------------------------------------
// Les lignes sont lues en direct (`onSnapshot`) et ecrites directement dans
// `users/{uid}/logs` par le navigateur, sous les regles existantes. Il n'y a donc
// aucune synchronisation a declencher : ajouter un repas ici le fait apparaitre sur
// le telephone dans la seconde, et l'inverse est vrai aussi.
import { useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useMe } from '../MeProvider';
import { firestore } from '../../../lib/firebaseClient';
import { useProfil, useJournal, jourLocal, totaux, type LigneJournal } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, locale, type Langue } from '../../../lib/i18nMe';

const MOMENTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
const CLES_MOMENT: Record<string, string> = {
  breakfast: 'petitDej',
  lunch: 'dejeuner',
  snack: 'collation',
  dinner: 'diner',
};

/** Decale une date `YYYY-MM-DD` de n jours, sans jamais passer par UTC. */
function decaler(date: string, n: number): string {
  const [a, m, j] = date.split('-').map(Number);
  const d = new Date(a, m - 1, j + n);
  return jourLocal(d);
}

export default function PageJournal() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const [date, setDate] = useState(jourLocal());
  const { lignes, charge } = useJournal(uid, date);

  const langue = (profil?.language || 'fr') as Langue;
  const t = traducteur(langue);
  const dir = sensLecture(langue);

  const tot = totaux(lignes);
  const cible = Number(profil?.nutritionalPlan?.dailyCalories) || 0;

  const libelleDate = useMemo(() => {
    const auj = jourLocal();
    if (date === auj) return t('aujourdhui');
    if (date === decaler(auj, -1)) return t('hier');
    const [a, m, j] = date.split('-').map(Number);
    return new Date(a, m - 1, j).toLocaleDateString(locale(langue), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }, [date, langue, t]);

  const repas = lignes.filter((l) => l.type === 'meal');
  const activites = lignes.filter((l) => l.type === 'activity');

  const supprimer = async (ligne: LigneJournal) => {
    if (!confirm(t('confirmerSuppression'))) return;
    await deleteDoc(doc(firestore(), 'users', uid, 'logs', ligne.id));
  };

  return (
    <div className="me-page" dir={dir}>
      <header className="me-entete">
        <h1>{t('journal')}</h1>
        <div className="jour-nav">
          <button className="btn btn-sm" onClick={() => setDate(decaler(date, -1))} aria-label={t('jourPrecedent')}>
            ‹
          </button>
          <span className="jour-libelle">{libelleDate}</span>
          <button
            className="btn btn-sm"
            onClick={() => setDate(decaler(date, 1))}
            aria-label={t('jourSuivant')}
            disabled={date >= jourLocal()}
          >
            ›
          </button>
        </div>
      </header>

      <section className="me-tuiles">
        <div className="me-tuile accent">
          <div className="me-tuile-titre">{t('calories')}</div>
          <div className="me-tuile-valeur">{cible ? `${tot.kcal} / ${cible}` : tot.kcal}</div>
          {cible ? (
            <div className="me-tuile-detail">
              {Math.max(0, cible - tot.kcal)} kcal {t('restant')}
            </div>
          ) : null}
        </div>
        <div className="me-tuile">
          <div className="me-tuile-titre">{t('proteines')}</div>
          <div className="me-tuile-valeur">{tot.proteines} g</div>
        </div>
        <div className="me-tuile">
          <div className="me-tuile-titre">{t('glucides')}</div>
          <div className="me-tuile-valeur">{tot.glucides} g</div>
        </div>
        <div className="me-tuile">
          <div className="me-tuile-titre">{t('lipides')}</div>
          <div className="me-tuile-valeur">{tot.lipides} g</div>
        </div>
      </section>

      <FormulaireAjout uid={uid} date={date} t={t} />

      <h2 className="me-h2">{t('repas')}</h2>
      {!charge ? (
        <div className="me-vide">…</div>
      ) : repas.length ? (
        <ul className="liste-lignes">
          {repas.map((l) => (
            <li key={l.id} className="ligne">
              <div className="ligne-nom">
                <b>{l.name}</b>
                {l.slot ? <span className="ligne-slot">{t(CLES_MOMENT[l.slot] || l.slot)}</span> : null}
              </div>
              <div className="ligne-macros">
                {l.protein ? <span>P {Math.round(l.protein)}</span> : null}
                {l.carbs ? <span>G {Math.round(l.carbs)}</span> : null}
                {l.fat ? <span>L {Math.round(l.fat)}</span> : null}
              </div>
              <div className="ligne-kcal">{Math.round(Number(l.calories) || 0)} kcal</div>
              <button className="btn btn-sm btn-ghost" onClick={() => supprimer(l)} title={t('supprimer')}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="me-vide">{t('aucuneLigne')}</div>
      )}

      {activites.length ? (
        <>
          <h2 className="me-h2">{t('activites')}</h2>
          <ul className="liste-lignes">
            {activites.map((l) => (
              <li key={l.id} className="ligne">
                <div className="ligne-nom">
                  <b>{l.name}</b>
                  {l.intensity ? <span className="ligne-slot">{l.intensity}</span> : null}
                </div>
                <div className="ligne-kcal">
                  {Math.round(Number(l.calories) || 0)} kcal {t('brulees')}
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => supprimer(l)} title={t('supprimer')}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="me-note">{t('syncNote')}</p>
    </div>
  );
}

function FormulaireAjout({
  uid,
  date,
  t,
}: {
  uid: string;
  date: string;
  t: (c: string) => string;
}) {
  const [nom, setNom] = useState('');
  const [kcal, setKcal] = useState('');
  const [prot, setProt] = useState('');
  const [gluc, setGluc] = useState('');
  const [lip, setLip] = useState('');
  const [moment, setMoment] = useState<string>('lunch');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim()) return;
    setEnvoi(true);
    setErreur('');
    try {
      // Exactement la forme ecrite par le mobile (cf. NutritionLog) : sans quoi les
      // deux clients afficheraient des totaux differents pour la meme journee.
      await addDoc(collection(firestore(), 'users', uid, 'logs'), {
        userId: uid,
        type: 'meal',
        name: nom.trim(),
        calories: Number(kcal) || 0,
        protein: Number(prot) || 0,
        carbs: Number(gluc) || 0,
        fat: Number(lip) || 0,
        date,
        slot: moment,
        timestamp: serverTimestamp(),
      });
      setNom('');
      setKcal('');
      setProt('');
      setGluc('');
      setLip('');
    } catch {
      setErreur(t('erreurEcriture'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form className="carte-ajout" onSubmit={envoyer}>
      <div className="ajout-grille">
        <label className="ajout-nom">
          <span>{t('nom')}</span>
          <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} required />
        </label>
        <label>
          <span>{t('calories')}</span>
          <input className="input" type="number" min="0" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </label>
        <label>
          <span>{t('proteines')} (g)</span>
          <input className="input" type="number" min="0" value={prot} onChange={(e) => setProt(e.target.value)} />
        </label>
        <label>
          <span>{t('glucides')} (g)</span>
          <input className="input" type="number" min="0" value={gluc} onChange={(e) => setGluc(e.target.value)} />
        </label>
        <label>
          <span>{t('lipides')} (g)</span>
          <input className="input" type="number" min="0" value={lip} onChange={(e) => setLip(e.target.value)} />
        </label>
        <label>
          <span>{t('moment')}</span>
          <select className="input" value={moment} onChange={(e) => setMoment(e.target.value)}>
            {MOMENTS.map((m) => (
              <option key={m} value={m}>
                {t(CLES_MOMENT[m])}
              </option>
            ))}
          </select>
        </label>
      </div>
      {erreur ? <div className="me-erreur">{erreur}</div> : null}
      <button className="btn btn-primary" type="submit" disabled={envoi}>
        {envoi ? t('enregistrement') : t('ajouterRepas')}
      </button>
    </form>
  );
}
