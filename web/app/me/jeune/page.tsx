'use client';
// Jeûne intermittent — minuteur et protocoles.
// ---------------------------------------------------------------------------
// L'heure de début vit dans Firestore, pas dans le navigateur : un jeûne
// commencé sur le téléphone doit se voir ici, et inversement. C'est tout
// l'intérêt — le mobile garde ce début EN LOCAL, donc un jeûne lancé le matin
// était invisible depuis un ordinateur l'après-midi.
//
// Ce que cette page ne fait PAS : le défi de jeûne en direct entre amis, qui
// passe par un socket dédié côté mobile, et le mode Ramadan, qui dépend des
// horaires de prière géolocalisés. Les deux méritent mieux qu'une demi-mesure.
import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, locale, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { PROTOCOLES, etatJeune, formaterReste } from '../../../lib/jeune';

export default function PageJeune() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [debut, setDebut] = useState<number | null>(null);
  const [protocole, setProtocole] = useState('16:8');
  const [charge, setCharge] = useState(false);
  // Une horloge locale qui bat chaque seconde. Sans elle, le compte à rebours
  // resterait figé sur la valeur du premier rendu.
  const [maintenant, setMaintenant] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!uid) return;
    const stop = onSnapshot(
      doc(firestore(), 'users', uid, 'jeune', 'encours'),
      (snap) => {
        const d = snap.exists() ? (snap.data() as any) : null;
        const ms = Number(d?.debutMs);
        setDebut(Number.isFinite(ms) && ms > 0 ? ms : null);
        if (d?.protocole && PROTOCOLES.some((p) => p.id === d.protocole)) setProtocole(d.protocole);
        setCharge(true);
      },
      () => setCharge(true),
    );
    return () => stop();
  }, [uid]);

  const heures = PROTOCOLES.find((p) => p.id === protocole)?.heuresJeune ?? 16;
  const etat = debut != null ? etatJeune(debut, heures, maintenant) : null;

  const demarrer = useCallback(async () => {
    if (!uid) return;
    await setDoc(doc(firestore(), 'users', uid, 'jeune', 'encours'), {
      debutMs: Date.now(), protocole, updatedAt: Date.now(),
    });
  }, [uid, protocole]);

  const arreter = useCallback(async () => {
    if (!uid) return;
    // `debutMs: null` plutot que supprimer le document : le protocole choisi
    // survit, et on n'a pas a le re-selectionner au jeune suivant.
    await setDoc(
      doc(firestore(), 'users', uid, 'jeune', 'encours'),
      { debutMs: null, protocole, updatedAt: Date.now() },
      { merge: true },
    );
  }, [uid, protocole]);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('jeuneTitre')}</h1>
        <p className="me-sous">{t('jeuneSous')}</p>
      </header>

      <section className="carte-amis">
        <h2 className="me-h2">{t('jeuneProtocole')}</h2>
        <div className="ligne-champ" style={{ flexWrap: 'wrap' }}>
          {PROTOCOLES.map((p) => (
            <button
              key={p.id}
              className={`btn ${protocole === p.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setProtocole(p.id)}
              disabled={etat != null && !etat.fini}
              title={etat != null && !etat.fini ? t('jeuneChangerImpossible') : undefined}
            >
              {p.id}
            </button>
          ))}
        </div>
        <p className="me-note">
          {t('jeuneFenetre')} {24 - heures} h
          {etat != null && !etat.fini ? ` · ${t('jeuneChangerImpossible')}` : ''}
        </p>
      </section>

      <section className="carte-amis">
        {!charge ? (
          <p className="me-sous">{t('communChargement')}</p>
        ) : etat == null ? (
          <>
            <p className="me-sous">{t('jeunePasCommence')}</p>
            <button className="btn btn-primary" onClick={demarrer} disabled={!uid}>
              {t('jeuneDemarrer')}
            </button>
          </>
        ) : (
          <>
            <h2 className="me-h2">{etat.fini ? t('jeuneFini') : t('jeuneEnCours')}</h2>
            <div className="prog-piste">
              <div className="prog-remplissage prog-jeune" style={{ width: `${etat.pourcent}%` }} />
            </div>
            <p className="jeune-compteur">{etat.fini ? t('jeunePeutManger') : formaterReste(etat.resteMs)}</p>
            <p className="me-sous">
              {t('jeuneFinPrevue')}{' '}
              {new Date(etat.finMs).toLocaleString(locale(langue), {
                weekday: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </p>
            <div className="ligne-champ" style={{ marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={arreter}>{t('jeuneArreter')}</button>
            </div>
          </>
        )}
      </section>

      <section className="carte-amis">
        <p className="me-note">{t('jeuneNoteAbsents')}</p>
      </section>
    </div>
  );
}
