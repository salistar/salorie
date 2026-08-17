'use client';
// Agenda sportif — un vrai calendrier, pas une liste.
// ---------------------------------------------------------------------------
// Planifier, c'est repartir un effort dans le temps : voir qu'on a mis trois
// seances lundi-mardi-mercredi et rien du reste de la semaine. Une LISTE ne
// montre pas ce trou ; une GRILLE mensuelle si. C'est le seul ecran de la liste
// ou le grand format change la nature de l'information, pas seulement son
// confort.
//
// Attention aux deux champs de date : `when` est la date PREVUE (choisie), `date`
// celle de la CREATION (posee par `logEntry`). Les confondre afficherait toutes
// les seances le jour ou on les a saisies.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

type Seance = { id: string; what?: string; when?: string; date?: string };

/** Cle AAAA-MM-JJ locale — jamais `toISOString`, qui bascule en UTC et decale
 *  d'un jour tous les soirs pour qui vit a l'est de Greenwich. */
function cle(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Les 42 cases d'une grille mensuelle, lundi en premiere colonne. */
function grilleDuMois(annee: number, mois: number): Date[] {
  const premier = new Date(annee, mois, 1);
  const decalage = (premier.getDay() + 6) % 7; // dimanche=0 -> 6
  const debut = new Date(annee, mois, 1 - decalage);
  return Array.from({ length: 42 }, (_, i) => new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i));
}

export default function PageAgenda() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);
  const locale = langue === 'ar' ? 'ar-MA' : langue === 'en' ? 'en-GB' : 'fr-FR';

  const [seances, setSeances] = useState<Seance[]>([]);
  const [charge, setCharge] = useState(false);
  // Le mois affiche est pose apres le montage : cette page est pre-rendue au
  // build, et un mois fige dans le HTML serait celui de la compilation.
  const [curseur, setCurseur] = useState<{ a: number; m: number } | null>(null);
  const [quoi, setQuoi] = useState('');
  const [quand, setQuand] = useState('');
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    const n = new Date();
    setCurseur({ a: n.getFullYear(), m: n.getMonth() });
    setQuand(cle(n));
  }, []);

  const charger = useCallback(async () => {
    if (!uid) return;
    try {
      const snap = await getDocs(collection(firestore(), 'users', uid, 'sport_agenda'));
      setSeances(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } catch {
      setSeances([]);
    } finally {
      setCharge(true);
    }
  }, [uid]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Regroupement par jour PREVU. Une seance sans `when` retombe sur `date` :
  // mieux vaut la montrer au mauvais endroit que la faire disparaitre.
  const parJour = useMemo(() => {
    const m: Record<string, Seance[]> = {};
    for (const s of seances) {
      const j = s.when || s.date;
      if (!j) continue;
      (m[j] ||= []).push(s);
    }
    return m;
  }, [seances]);

  const ajouter = async () => {
    const q = quoi.trim();
    if (!q || !uid || occupe) return;
    setOccupe(true);
    try {
      await addDoc(collection(firestore(), 'users', uid, 'sport_agenda'), {
        what: q.slice(0, 120),
        when: quand,
        // Memes champs que `logEntry` cote mobile, pour que les deux clients
        // ecrivent des documents interchangeables.
        date: cle(new Date()),
        timestamp: serverTimestamp(),
      });
      setQuoi('');
      await charger();
    } finally {
      setOccupe(false);
    }
  };

  const supprimer = async (id: string) => {
    if (!uid) return;
    await deleteDoc(doc(firestore(), 'users', uid, 'sport_agenda', id));
    setSeances((l) => l.filter((s) => s.id !== id));
  };

  if (!curseur) return <div className="me-page" dir={sens}><p className="me-sous">{t('communChargement')}</p></div>;

  const cases = grilleDuMois(curseur.a, curseur.m);
  const aujourdhui = cle(new Date());
  const nomMois = new Date(curseur.a, curseur.m, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const jours = Array.from({ length: 7 }, (_, i) =>
    // 2024-01-01 etait un lundi : point de depart pour nommer les colonnes dans
    // la langue du profil, sans table de traduction a maintenir.
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }),
  );
  const decaler = (n: number) => {
    const d = new Date(curseur.a, curseur.m + n, 1);
    setCurseur({ a: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('agendaTitre')}</h1>
        <p className="me-sous">{t('agendaSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ">
          <input
            className="champ-amis" style={{ flex: '1 1 240px' }}
            value={quoi} onChange={(e) => setQuoi(e.target.value.slice(0, 120))}
            placeholder={t('agendaQuoi')} aria-label={t('agendaQuoi')}
          />
          <input
            className="champ-amis" style={{ flex: '0 1 180px' }} type="date"
            value={quand} onChange={(e) => setQuand(e.target.value)} aria-label={t('agendaQuand')}
          />
          <button className="btn btn-primary" onClick={ajouter} disabled={!quoi.trim() || occupe}>
            {t('agendaAjouter')}
          </button>
        </div>
      </section>

      <section className="carte-amis">
        <div className="ligne-champ" style={{ justifyContent: 'space-between' }}>
          {/* Les fleches sont posees dans le SENS DE LECTURE : en arabe, revenir
              au mois precedent se fait vers la droite. */}
          <button className="btn btn-ghost" onClick={() => decaler(-1)} aria-label={t('agendaMoisPrec')}>
            {sens === 'rtl' ? '›' : '‹'}
          </button>
          <strong style={{ textTransform: 'capitalize' }}>{nomMois}</strong>
          <button className="btn btn-ghost" onClick={() => decaler(1)} aria-label={t('agendaMoisSuiv')}>
            {sens === 'rtl' ? '‹' : '›'}
          </button>
        </div>

        <div className="cal-entete">
          {jours.map((j, i) => <span key={i} className="me-sous">{j}</span>)}
        </div>
        <div className="cal-grille">
          {cases.map((d) => {
            const k = cle(d);
            const dedans = d.getMonth() === curseur.m;
            const items = parJour[k] || [];
            return (
              <div key={k} className={`cal-case${dedans ? '' : ' cal-hors'}${k === aujourdhui ? ' cal-jour' : ''}`}>
                <span className="cal-num">{d.getDate()}</span>
                {items.map((s) => (
                  <button
                    key={s.id}
                    className="cal-seance"
                    onClick={() => supprimer(s.id)}
                    title={t('agendaSupprimer')}
                  >
                    {s.what}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <p className="me-note">{t('agendaAstuce')}</p>
      </section>

      {charge && seances.length === 0 ? <p className="me-sous">{t('agendaVide')}</p> : null}
      <p className="me-note">{t('agendaNoteGps')}</p>
    </div>
  );
}
