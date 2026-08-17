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

// La courbe vit dans un composant partage depuis que les mensurations ont eu
// besoin de la meme. Deux copies auraient diverge sur le garde-fou de plage
// nulle — celui qui evite une courbe invisible au tout debut.
import { Courbe, statsSerie } from '../Courbe';

type Point = { ts: number; v: number; v2?: number };

export default function PageConstantes() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [glycemie, setGlycemie] = useState<Point[]>([]);
  const [tension, setTension] = useState<Point[]>([]);
  const [energie, setEnergie] = useState<Point[]>([]);
  const [sommeil, setSommeil] = useState<Point[]>([]);
  const [charge, setCharge] = useState(false);

  const charger = useCallback(async () => {
    if (!uid) return;
    try {
      // `champs` est explicite par collection : les quatre suivis n'ecrivent pas
      // le meme nom de valeur (`value`, `systolic`, `energy`, `hours`), et une
      // liste de replis en cascade aurait fini par lire le mauvais champ le jour
      // ou deux collections en partagent un.
      const lire = async (col: string, champs: string[]) => {
        const snap = await getDocs(
          query(collection(firestore(), 'users', uid, col), orderBy('timestamp', 'desc'), limit(120)),
        );
        return snap.docs
          .map((d) => {
            const x = d.data() as any;
            const ts = x.timestamp?.seconds ? x.timestamp.seconds * 1000 : Number(x.timestamp) || 0;
            const brut = champs.map((c) => x[c]).find((v) => v != null);
            return { ts, v: Number(brut) || 0, v2: Number(x.diastolic) || undefined };
          })
          .filter((p) => p.ts && p.v > 0)
          // La lecture vient du plus recent ; une courbe se lit du plus ancien au
          // plus recent, donc on inverse.
          .reverse();
      };
      const [g, b, e, s] = await Promise.all([
        lire('glucose', ['value']),
        lire('blood_pressure', ['systolic']),
        lire('mood', ['energy']),
        lire('sleep', ['hours']),
      ]);
      setGlycemie(g);
      setTension(b);
      setEnergie(e);
      setSommeil(s);
    } catch {
      setGlycemie([]);
      setTension([]);
      setEnergie([]);
      setSommeil([]);
    } finally {
      setCharge(true);
    }
  }, [uid]);

  useEffect(() => {
    charger();
  }, [charger]);

  const bloc = (titre: string, points: Point[], couleur: string, unite: string) => {
    const s = statsSerie(points);
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
          {/* Energie et sommeil suivent le meme raisonnement : le mobile n'en
              montre que sept releves, et c'est sur trois mois qu'une baisse
              d'energie devient visible — souvent en meme temps qu'autre chose. */}
          {bloc(t('constantesEnergie'), energie, '#16a34a', '/5')}
          {bloc(t('constantesSommeil'), sommeil, '#7c3aed', 'h')}
        </>
      )}

      {/* Une app de sport n'est pas un dispositif medical, et doit le dire. */}
      <p className="me-note">{t('constantesAvertissement')}</p>
    </div>
  );
}
