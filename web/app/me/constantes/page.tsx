'use client';
// Glycemie et tension — ces donnees parlent sur TROIS MOIS, pas au jour le jour.
// ---------------------------------------------------------------------------
// Une mesure isolee ne dit rien ; c'est la tendance qui compte, et c'est
// exactement ce qu'un ecran de telephone ne peut pas montrer. Quatre-vingt-dix
// points ne tiennent pas sur six pouces.
//
// La SAISIE reste sur le telephone : on mesure sa tension chez soi, l'appareil a
// la main, pas devant un ordinateur. Ici on regarde.
import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

type Point = { ts: number; v: number; v2?: number };

/** Une courbe simple en SVG — pas de bibliotheque pour tracer une ligne. */
function Courbe({ points, couleur, hauteur = 110 }: { points: Point[]; couleur: string; hauteur?: number }) {
  if (points.length < 2) return null;
  const L = 600;
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  // Une plage nulle (toutes les valeurs identiques) donnerait une division par
  // zero et une courbe invisible : on force une hauteur minimale.
  const plage = Math.max(1, max - min);
  const pas = L / Math.max(1, points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * pas).toFixed(1)} ${(hauteur - ((p.v - min) / plage) * (hauteur - 16) - 8).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${L} ${hauteur}`} className="courbe" role="img" aria-hidden>
      <path d={d} fill="none" stroke={couleur} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function stats(points: Point[]) {
  if (!points.length) return null;
  const v = points.map((p) => p.v);
  return {
    n: v.length,
    moy: Math.round(v.reduce((a, b) => a + b, 0) / v.length),
    min: Math.min(...v),
    max: Math.max(...v),
    dernier: points[points.length - 1].v,
  };
}

export default function PageConstantes() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [glycemie, setGlycemie] = useState<Point[]>([]);
  const [tension, setTension] = useState<Point[]>([]);
  const [charge, setCharge] = useState(false);

  const charger = useCallback(async () => {
    if (!uid) return;
    try {
      const lire = async (col: string) => {
        const snap = await getDocs(
          query(collection(firestore(), 'users', uid, col), orderBy('timestamp', 'desc'), limit(120)),
        );
        return snap.docs
          .map((d) => {
            const x = d.data() as any;
            const ts = x.timestamp?.seconds ? x.timestamp.seconds * 1000 : Number(x.timestamp) || 0;
            return { ts, v: Number(x.value ?? x.systolic ?? 0), v2: Number(x.diastolic) || undefined };
          })
          .filter((p) => p.ts && p.v > 0)
          // La lecture vient du plus recent ; une courbe se lit du plus ancien au
          // plus recent, donc on inverse.
          .reverse();
      };
      const [g, b] = await Promise.all([lire('glucose'), lire('blood_pressure')]);
      setGlycemie(g);
      setTension(b);
    } catch {
      setGlycemie([]);
      setTension([]);
    } finally {
      setCharge(true);
    }
  }, [uid]);

  useEffect(() => {
    charger();
  }, [charger]);

  const bloc = (titre: string, points: Point[], couleur: string, unite: string) => {
    const s = stats(points);
    return (
      <section className="carte-amis">
        <h2 className="me-h2">{titre}</h2>
        {!s ? (
          <p className="me-sous">{t('constantesAucune')}</p>
        ) : (
          <>
            <Courbe points={points} couleur={couleur} />
            <div className="grille-series">
              <div className="tuile-serie"><span className="serie-nombre">{s.dernier}</span><span className="me-sous">{t('constantesDernier')} ({unite})</span></div>
              <div className="tuile-serie"><span className="serie-nombre">{s.moy}</span><span className="me-sous">{t('constantesMoyenne')}</span></div>
              <div className="tuile-serie"><span className="serie-nombre">{s.min}–{s.max}</span><span className="me-sous">{t('constantesEtendue')}</span></div>
              <div className="tuile-serie"><span className="serie-nombre">{s.n}</span><span className="me-sous">{t('constantesMesures')}</span></div>
            </div>
          </>
        )}
      </section>
    );
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('constantesTitre')}</h1>
        <p className="me-sous">{t('constantesSous')}</p>
      </header>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : (
        <>
          {bloc(t('constantesGlycemie'), glycemie, '#0ea5e9', 'g/L')}
          {bloc(t('constantesTension'), tension, '#a2571c', 'mmHg')}
        </>
      )}

      {/* Une app de sport n'est pas un dispositif medical, et doit le dire. */}
      <p className="me-note">{t('constantesAvertissement')}</p>
    </div>
  );
}
