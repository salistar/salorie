'use client';
// Defis entre villes — le classement complet, et sa part personnelle.
// ---------------------------------------------------------------------------
// Un defi ville contre ville, c'est un TABLEAU : deux totaux, un nombre de
// participants, et sa propre contribution dedans. Sur telephone on voit un
// chiffre a la fois et on fait la soustraction de tete. Ici les defis en cours,
// termines et a venir tiennent sur le meme ecran, et l'ecart entre les deux
// villes se lit sans calcul.
//
// La CONTRIBUTION reste au telephone : elle vient des kilometres parcourus et
// des seances enregistrees, mesures par l'appareil qu'on a sur soi.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';

type Defi = {
  id: string;
  title: string;
  cityA: string;
  cityB: string;
  metric: string;
  status: string;
  startTs?: number;
  endTs?: number;
};

type Classement = { totalA: number; totalB: number; participants: number; maValeur: number; maVille: string | null };

const norm = (v: any) => String(v || '').trim().toLowerCase();

export default function PageVilles() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [defis, setDefis] = useState<Defi[]>([]);
  const [classements, setClassements] = useState<Record<string, Classement>>({});
  const [charge, setCharge] = useState(false);
  const [maVille, setMaVille] = useState('');
  const [etat, setEtat] = useState<'' | 'ok' | 'erreur'>('');

  const charger = useCallback(async () => {
    if (!uid) return;
    try {
      const snap = await getDocs(collection(firestore(), 'city_challenges'));
      const l = snap.docs.map((d) => {
        const x = d.data() as any;
        return {
          id: d.id,
          title: String(x.title || ''),
          cityA: String(x.cityA || ''),
          cityB: String(x.cityB || ''),
          metric: String(x.metric || 'km'),
          status: String(x.status || 'active'),
          startTs: Number(x.startTs) || undefined,
          endTs: Number(x.endTs) || undefined,
        } as Defi;
      });

      // Les contributions vivent dans une SOUS-collection par defi. On les lit
      // toutes en parallele : sequentiellement, dix defis feraient dix
      // allers-retours a la suite et la page resterait vide plusieurs secondes.
      const paires = await Promise.all(
        l.map(async (d) => {
          try {
            const cs = await getDocs(collection(firestore(), 'city_challenges', d.id, 'contrib'));
            let a = 0, b = 0, maValeur = 0;
            let maVilleD: string | null = null;
            cs.docs.forEach((s) => {
              const x = s.data() as any;
              const v = Number(x.value) || 0;
              const ville = norm(x.city);
              if (d.cityA && ville === norm(d.cityA)) a += v;
              else if (d.cityB && ville === norm(d.cityB)) b += v;
              if (s.id === uid) { maValeur = v; maVilleD = ville || null; }
            });
            return [d.id, {
              totalA: Math.round(a * 100) / 100,
              totalB: Math.round(b * 100) / 100,
              participants: cs.size,
              maValeur: Math.round(maValeur * 100) / 100,
              maVille: maVilleD,
            }] as const;
          } catch {
            return [d.id, { totalA: 0, totalB: 0, participants: 0, maValeur: 0, maVille: null }] as const;
          }
        }),
      );

      // Actifs d'abord, puis a venir, puis termines : on vient voir ce qui se
      // joue maintenant, pas l'historique.
      const rang = (s: string) => (s === 'active' ? 0 : s === 'upcoming' ? 1 : 2);
      l.sort((x, y) => rang(x.status) - rang(y.status) || (y.startTs || 0) - (x.startTs || 0));
      setDefis(l);
      setClassements(Object.fromEntries(paires));

      const me = await getDoc(doc(firestore(), 'users', uid));
      setMaVille(String((me.data() as any)?.city || ''));
    } catch {
      setDefis([]);
    } finally {
      setCharge(true);
    }
  }, [uid]);

  useEffect(() => {
    charger();
  }, [charger]);

  const choisirVille = async (ville: string) => {
    if (!uid) return;
    setEtat('');
    try {
      // La ville est memorisee sur le profil, comme cote mobile : elle sert d'un
      // defi a l'autre, et personne n'a envie de la retaper a chaque fois.
      await setDoc(doc(firestore(), 'users', uid), { city: ville }, { merge: true });
      setMaVille(ville);
      setEtat('ok');
    } catch {
      setEtat('erreur');
    }
  };

  const actifs = useMemo(() => defis.filter((d) => d.status === 'active'), [defis]);

  const barre = (d: Defi, c: Classement) => {
    const total = c.totalA + c.totalB;
    // Sans aucune contribution, deux barres a 50 % laisseraient croire a une
    // egalite disputee alors que rien n'a commence.
    const pctA = total > 0 ? (c.totalA / total) * 100 : 50;
    return (
      <div className="ville-barre" role="img" aria-label={`${d.cityA} ${c.totalA} — ${d.cityB} ${c.totalB}`}>
        <div className="ville-part ville-a" style={{ width: `${pctA}%` }} />
        <div className="ville-part ville-b" style={{ width: `${100 - pctA}%` }} />
      </div>
    );
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('villesTitre')}</h1>
        <p className="me-sous">{t('villesSous')}</p>
      </header>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : defis.length === 0 ? (
        <p className="me-sous">{t('villesAucun')}</p>
      ) : (
        <>
          {actifs.length ? (
            <section className="carte-amis">
              <h2 className="me-h2">{t('villesMaVille')}</h2>
              <div className="ligne-champ">
                {/* Les villes proposees sont celles des defis ACTIFS uniquement :
                    choisir le camp d'un defi termine ne sert a rien. */}
                {[...new Set(actifs.flatMap((d) => [d.cityA, d.cityB]).filter(Boolean))].map((v) => (
                  <button key={v} className={`btn ${norm(maVille) === norm(v) ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => choisirVille(v)} aria-pressed={norm(maVille) === norm(v)}>
                    {v}
                  </button>
                ))}
              </div>
              {etat === 'ok' ? <p className="me-note">{t('villesVilleChoisie')}</p> : null}
              {etat === 'erreur' ? <p className="me-erreur">{t('villesErreur')}</p> : null}
              <p className="me-note">{t('villesNoteContrib')}</p>
            </section>
          ) : null}

          <ul className="grille-matchs">
            {defis.map((d) => {
              const c = classements[d.id] || { totalA: 0, totalB: 0, participants: 0, maValeur: 0, maVille: null };
              const unite = t(`villesMetric_${d.metric}`) || d.metric;
              return (
                <li key={d.id} className="carte-match">
                  <div className="match-tete">
                    <strong>{d.title || `${d.cityA} — ${d.cityB}`}</strong>
                    <span className="puce-role">{t(`villesStatut_${d.status}`) || d.status}</span>
                  </div>
                  {barre(d, c)}
                  <div className="ville-scores">
                    <span><strong>{d.cityA}</strong> {c.totalA} {unite}</span>
                    <span><strong>{d.cityB}</strong> {c.totalB} {unite}</span>
                  </div>
                  <span className="me-sous">
                    {c.participants} {t('villesParticipants')}
                    {c.maValeur > 0 ? ` · ${t('villesMaPart')} ${c.maValeur} ${unite}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
