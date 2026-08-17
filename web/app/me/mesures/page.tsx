'use client';
// Mensurations et composition corporelle — la tendance sur des mois.
// ---------------------------------------------------------------------------
// Le poids ment a court terme : il monte de deux kilos apres un repas sale et
// redescend le lendemain. Le tour de taille, lui, ne ment pas — mais il bouge si
// lentement qu'on ne voit rien sur quatre mesures. Il en faut vingt cote a cote,
// et vingt points ne tiennent pas sur six pouces.
//
// C'est aussi l'ecran ou l'ECART compte plus que la valeur : « −4 cm depuis la
// premiere mesure » repond a la question qu'on vient poser ; « 88 cm » n'y
// repond pas.
//
// La SAISIE reste possible ici, contrairement aux constantes : on ne mesure pas
// son tour de taille dans le meme geste qu'on prend sa tension, et un metre
// ruban se lit puis se note plus tard.
import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { Courbe, statsSerie, type PointCourbe } from '../Courbe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

/** Les memes cles que le mobile, au mot pres — deux noms differents pour la
 *  meme mesure donneraient deux courbes qui ne se rejoignent jamais. */
const MENSURATIONS = [
  { cle: 'waist', couleur: '#a2571c', unite: 'cm' },
  { cle: 'hips', couleur: '#0ea5e9', unite: 'cm' },
  { cle: 'chest', couleur: '#16a34a', unite: 'cm' },
  { cle: 'arms', couleur: '#7c3aed', unite: 'cm' },
] as const;

const COMPOSITION = [
  { cle: 'weight', couleur: '#2e8b57', unite: 'kg' },
  { cle: 'fat', couleur: '#d97706', unite: '%' },
  { cle: 'muscle', couleur: '#0ea5e9', unite: 'kg' },
  { cle: 'water', couleur: '#3fa9c9', unite: '%' },
] as const;

type Series = Record<string, PointCourbe[]>;

function jourLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PageMesures() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [mens, setMens] = useState<Series>({});
  const [comp, setComp] = useState<Series>({});
  const [charge, setCharge] = useState(false);
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const [occupe, setOccupe] = useState(false);
  const [etat, setEtat] = useState<'' | 'ok' | 'erreur'>('');

  const charger = useCallback(async () => {
    if (!uid) return;
    try {
      const lire = async (col: string, cles: readonly string[]): Promise<Series> => {
        const snap = await getDocs(
          query(collection(firestore(), 'users', uid, col), orderBy('timestamp', 'desc'), limit(150)),
        );
        // Un document porte SOUVENT plusieurs mesures a la fois (on note taille
        // et hanches d'un coup) mais pas toujours toutes : chaque serie est donc
        // construite separement, et un champ absent ne cree pas de point a zero.
        const out: Series = {};
        for (const c of cles) out[c] = [];
        for (const d of snap.docs) {
          const x = d.data() as any;
          const ts = x.timestamp?.seconds ? x.timestamp.seconds * 1000 : Number(x.timestamp) || 0;
          if (!ts) continue;
          for (const c of cles) {
            const v = Number(x[c]);
            if (Number.isFinite(v) && v > 0) out[c].push({ ts, v });
          }
        }
        // La lecture vient du plus recent ; une courbe se lit dans l'autre sens.
        for (const c of cles) out[c].reverse();
        return out;
      };
      const [m, cp] = await Promise.all([
        lire('measurements', MENSURATIONS.map((x) => x.cle)),
        lire('body_composition', COMPOSITION.map((x) => x.cle)),
      ]);
      setMens(m);
      setComp(cp);
    } catch {
      setMens({});
      setComp({});
    } finally {
      setCharge(true);
    }
  }, [uid]);

  useEffect(() => {
    charger();
  }, [charger]);

  const enregistrer = async (col: string, cles: readonly string[]) => {
    if (!uid || occupe) return;
    const data: Record<string, number> = {};
    for (const c of cles) {
      const n = parseFloat(String(saisie[c] || '').replace(',', '.'));
      // Bornes larges mais reelles : un tour de taille de 900 cm est une faute
      // de frappe, et un seul point aberrant ecrase toute l'echelle de la courbe.
      if (Number.isFinite(n) && n > 0 && n < 400) data[c] = Math.round(n * 10) / 10;
    }
    if (!Object.keys(data).length) return;
    setOccupe(true);
    setEtat('');
    try {
      // Memes champs que `logEntry` cote mobile, pour que les deux clients
      // ecrivent des documents interchangeables.
      await addDoc(collection(firestore(), 'users', uid, col), {
        ...data,
        date: jourLocal(),
        timestamp: serverTimestamp(),
      });
      setSaisie((s) => {
        const n = { ...s };
        for (const c of cles) delete n[c];
        return n;
      });
      setEtat('ok');
      await charger();
    } catch {
      setEtat('erreur');
    } finally {
      setOccupe(false);
    }
  };

  const bloc = (cle: string, couleur: string, unite: string, points: PointCourbe[]) => {
    const s = statsSerie(points);
    if (!s) return null;
    // Baisser est un progres pour le tour de taille, pas pour le muscle. On
    // n'affiche donc PAS de couleur de jugement sur l'ecart — juste son signe.
    return (
      <section className="carte-amis" key={cle}>
        <div className="ligne-champ" style={{ justifyContent: 'space-between' }}>
          <h2 className="me-h2" style={{ margin: 0 }}>{t(`mesures_${cle}`) || cle}</h2>
          <strong className="mesure-delta">
            {s.delta > 0 ? '+' : ''}{s.delta} {unite}
          </strong>
        </div>
        <Courbe points={points} couleur={couleur} />
        <div className="grille-series">
          <div className="tuile-serie"><span className="serie-nombre">{s.dernier}</span><span className="me-sous">{t('mesuresDerniere')} ({unite})</span></div>
          <div className="tuile-serie"><span className="serie-nombre">{s.moy}</span><span className="me-sous">{t('mesuresMoyenne')}</span></div>
          <div className="tuile-serie"><span className="serie-nombre">{s.min}–{s.max}</span><span className="me-sous">{t('mesuresEtendue')}</span></div>
          <div className="tuile-serie"><span className="serie-nombre">{s.n}</span><span className="me-sous">{t('mesuresNombre')}</span></div>
        </div>
      </section>
    );
  };

  const formulaire = (titre: string, col: string, champs: readonly { cle: string; unite: string }[]) => (
    <section className="carte-amis">
      <h2 className="me-h2">{titre}</h2>
      <div className="ligne-champ">
        {champs.map((c) => (
          <label className="champ-bloc" key={c.cle} style={{ flex: '0 1 140px' }}>
            <span className="me-sous">{t(`mesures_${c.cle}`) || c.cle} ({c.unite})</span>
            <input
              className="champ-amis" inputMode="decimal"
              value={saisie[c.cle] || ''}
              onChange={(e) => setSaisie((s) => ({ ...s, [c.cle]: e.target.value.replace(/[^0-9.,]/g, '') }))}
              aria-label={t(`mesures_${c.cle}`) || c.cle}
            />
          </label>
        ))}
        <button className="btn btn-primary" onClick={() => enregistrer(col, champs.map((x) => x.cle))} disabled={occupe}>
          {t('mesuresEnregistrer')}
        </button>
      </div>
    </section>
  );

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('mesuresTitre')}</h1>
        <p className="me-sous">{t('mesuresSous')}</p>
      </header>

      {formulaire(t('mesuresNoterMens'), 'measurements', MENSURATIONS)}
      {formulaire(t('mesuresNoterComp'), 'body_composition', COMPOSITION)}
      {etat === 'ok' ? <p className="me-note">{t('mesuresEnregistre')}</p> : null}
      {etat === 'erreur' ? <p className="me-erreur">{t('mesuresErreur')}</p> : null}

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : (
        <>
          <h2 className="me-h2">{t('mesuresMensurations')}</h2>
          {MENSURATIONS.map((m) => bloc(m.cle, m.couleur, m.unite, mens[m.cle] || []))}
          <h2 className="me-h2">{t('mesuresComposition')}</h2>
          {COMPOSITION.map((c) => bloc(c.cle, c.couleur, c.unite, comp[c.cle] || []))}
          {/* Rien du tout est un cas frequent au debut, et il merite une phrase
              plutot qu'une page blanche qui fait croire a une panne. */}
          {[...MENSURATIONS, ...COMPOSITION].every((x) => !(mens[x.cle]?.length || comp[x.cle]?.length)) ? (
            <p className="me-sous">{t('mesuresAucune')}</p>
          ) : null}
        </>
      )}

      <p className="me-note">{t('mesuresNoteMetre')}</p>
    </div>
  );
}
