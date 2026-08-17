'use client';
// Forme du jour — sommeil, FC au repos, charge récente.
// ---------------------------------------------------------------------------
// Le calcul est importé de `lib/readiness.ts`, le fichier du mobile : il n'a
// aucun import et se partage donc tel quel, comme `nutriScore`. Deux scores de
// forme différents pour la même nuit feraient douter des deux.
//
// Différence assumée avec le mobile : là-bas, l'écran n'écrase qu'un seul
// instantané en local, sans historique. Ici on écrit dans Firestore avec la
// date du jour, ce qui rend une SUITE possible — voir sa forme sur deux
// semaines est précisément ce qu'un grand écran apporte, et ce qu'un stockage
// écrasé à chaque saisie interdisait.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, setDoc, limit } from 'firebase/firestore';
import { useMe } from '../MeProvider';
import { useProfil, jourLocal } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { computeReadiness } from '../../../../lib/readiness';

type Jour = { id: string; sommeil?: number; fc?: number; minutes?: number; score?: number };

export default function PageForme() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [sommeil, setSommeil] = useState('7.5');
  const [fc, setFc] = useState('');
  const [minutes, setMinutes] = useState('');
  const [historique, setHistorique] = useState<Jour[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(firestore(), 'users', uid, 'readiness'),
      orderBy('__name__', 'desc'),
      limit(14),
    );
    const stop = onSnapshot(
      q,
      (snap) => setHistorique(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as Jour[]),
      () => setHistorique([]),
    );
    return () => stop();
  }, [uid]);

  const n = (s: string) => {
    const v = parseFloat(s.replace(',', '.'));
    return Number.isFinite(v) && v >= 0 ? v : undefined;
  };

  const res = useMemo(
    () => computeReadiness({ sleepHours: n(sommeil), restingHr: n(fc), activeMinutes: n(minutes) }),
    [sommeil, fc, minutes],
  );

  const enregistrer = useCallback(async () => {
    if (!uid) return;
    setMessage('');
    try {
      // L'identifiant du document EST la date : une seule mesure par jour, et
      // une deuxieme saisie corrige la premiere au lieu d'empiler deux lignes
      // contradictoires pour la meme nuit.
      await setDoc(doc(firestore(), 'users', uid, 'readiness', jourLocal()), {
        sommeil: n(sommeil) ?? null,
        fc: n(fc) ?? null,
        minutes: n(minutes) ?? null,
        score: res.score,
        updatedAt: Date.now(),
      });
      setMessage(t('formeEnregistre'));
    } catch {
      setMessage(t('formeErreur'));
    }
  }, [uid, sommeil, fc, minutes, res.score, t]);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('formeTitre')}</h1>
        <p className="me-sous">{t('formeSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ" style={{ flexWrap: 'wrap' }}>
          {([['formeSommeil', sommeil, setSommeil, 'h'], ['formeFc', fc, setFc, 'bpm'],
             ['formeMinutes', minutes, setMinutes, 'min']] as const).map(([cle, val, set, unite]) => (
            <label key={cle} className="champ-bloc">
              <span className="me-sous">{t(cle)} ({unite})</span>
              <input
                className="champ-amis" style={{ width: 110 }} inputMode="decimal"
                value={val} onChange={(e) => set(e.target.value.replace(/[^0-9.,]/g, ''))}
                aria-label={`${t(cle)} (${unite})`}
              />
            </label>
          ))}
        </div>
        <p className="me-note">{t('formeNoteChamps')}</p>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('formeResultat')}</h2>
        <div className="prog-piste">
          <div className="prog-remplissage prog-forme" style={{ width: `${res.score}%` }} />
        </div>
        <div className="ligne-champ" style={{ justifyContent: 'space-between' }}>
          <span className="serie-nombre">{res.score}/100</span>
          <span className="me-sous">{t(`formeVerdict_${res.label}`)}</span>
        </div>
        <div className="ligne-champ" style={{ marginTop: 8 }}>
          <button className="btn btn-primary" onClick={enregistrer} disabled={!uid}>
            {t('formeEnregistrer')}
          </button>
          {message ? <span className="me-note">{message}</span> : null}
        </div>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('formeHistorique')}</h2>
        {historique.length === 0 ? (
          <p className="me-sous">{t('formeRienEncore')}</p>
        ) : (
          <ul className="liste-nue">
            {historique.map((j) => (
              <li key={j.id} className="ligne-champ" style={{ justifyContent: 'space-between' }}>
                <span className="me-sous">{j.id}</span>
                <span><strong>{j.score ?? '—'}</strong>/100</span>
              </li>
            ))}
          </ul>
        )}
        <p className="me-note">{t('formeNoteHisto')}</p>
      </section>
    </div>
  );
}
