'use client';
// Progression — XP, niveau, défi annuel, kilomètres cumulés.
// ---------------------------------------------------------------------------
// Ces compteurs ne vivaient qu'en local sur le téléphone. Ce sont pourtant eux
// qu'on montre quand on demande à quelqu'un où il en est — et un an de
// kilomètres se montre sur un grand écran, pas sur six pouces.
//
// La page LIT presque tout : l'XP et les kilomètres viennent du GPS et des
// séances, le web n'a aucun moyen de les faire monter et ne prétend pas le
// contraire. Elle n'écrit qu'une chose : l'OBJECTIF de l'année. Se fixer un cap
// devant un grand écran a du sens ; le téléphone le relit ensuite.
import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

type Etat = {
  xp: number;
  annee: number;
  objectifKm: number;
  cumulKm: number;
  totalKm: number;
};

/** Même courbe que `lib/avatar.ts` : niveau = floor(sqrt(xp / 100)) + 1. Deux
 *  formules différentes afficheraient deux niveaux pour le même compte. */
const niveauPourXp = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
const xpPourNiveau = (n: number) => Math.pow(Math.max(1, n) - 1, 2) * 100;

export default function PageProgression() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [etat, setEtat] = useState<Etat | null>(null);
  const [charge, setCharge] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!uid) return;
    const stop = onSnapshot(
      doc(firestore(), 'users', uid, 'progression', 'etat'),
      (snap) => {
        if (snap.exists()) {
          const x = snap.data() as any;
          setEtat({
            xp: Number(x?.xp) || 0,
            annee: Number(x?.annee) || new Date().getFullYear(),
            objectifKm: Number(x?.objectifKm) || 0,
            cumulKm: Number(x?.cumulKm) || 0,
            totalKm: Number(x?.totalKm) || 0,
          });
        } else {
          setEtat(null);
        }
        setCharge(true);
      },
      () => setCharge(true),
    );
    return () => stop();
  }, [uid]);

  const poserObjectif = useCallback(async () => {
    const n = Math.round(Number(saisie));
    if (!uid || !Number.isFinite(n) || n <= 0) return;
    setMessage('');
    try {
      // `objectifTs` accompagne TOUJOURS l'objectif : c'est lui qui fait tenir
      // le réglage face au téléphone, qui se synchronise bien plus souvent.
      await setDoc(
        doc(firestore(), 'users', uid, 'progression', 'etat'),
        { objectifKm: n, objectifTs: Date.now() },
        { merge: true },
      );
      setSaisie('');
      setMessage(t('progObjectifPose'));
    } catch {
      setMessage(t('progErreur'));
    }
  }, [uid, saisie, t]);

  const niveau = etat ? niveauPourXp(etat.xp) : 1;
  const xpNiveau = xpPourNiveau(niveau);
  const xpSuivant = xpPourNiveau(niveau + 1);
  // Un niveau tout juste atteint donnerait une plage nulle si les deux seuils
  // se confondaient : on force un dénominateur d'au moins 1.
  const versSuivant = etat
    ? Math.min(100, Math.round(((etat.xp - xpNiveau) / Math.max(1, xpSuivant - xpNiveau)) * 100))
    : 0;

  const pctAnnee = etat && etat.objectifKm > 0
    ? Math.min(100, Math.round((etat.cumulKm / etat.objectifKm) * 100))
    : 0;

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('progTitre')}</h1>
        <p className="me-sous">{t('progSous')}</p>
      </header>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : !etat ? (
        // Rien de synchronisé encore : on DIT quoi faire, plutôt que d'afficher
        // des zéros qui feraient croire à une remise à zéro.
        <section className="carte-amis">
          <p className="me-sous">{t('progPasEncore')}</p>
        </section>
      ) : (
        <>
          <section className="carte-amis">
            <h2 className="me-h2">{t('progNiveau')} {niveau}</h2>
            <div className="prog-piste">
              <div className="prog-remplissage" style={{ width: `${versSuivant}%` }} />
            </div>
            <div className="ligne-champ" style={{ justifyContent: 'space-between' }}>
              <span className="me-sous">{etat.xp} XP</span>
              <span className="me-sous">{t('progVersNiveau')} {niveau + 1} : {Math.max(0, xpSuivant - etat.xp)} XP</span>
            </div>
          </section>

          <section className="carte-amis">
            <h2 className="me-h2">{t('progDefi')} {etat.annee}</h2>
            <div className="prog-piste">
              <div className="prog-remplissage prog-annee" style={{ width: `${pctAnnee}%` }} />
            </div>
            <div className="grille-series">
              <div className="tuile-serie">
                <span className="serie-nombre">{Math.round(etat.cumulKm)}</span>
                <span className="me-sous">{t('progCumule')} (km)</span>
              </div>
              <div className="tuile-serie">
                <span className="serie-nombre">{etat.objectifKm}</span>
                <span className="me-sous">{t('progObjectif')} (km)</span>
              </div>
              <div className="tuile-serie">
                <span className="serie-nombre">{Math.max(0, Math.round(etat.objectifKm - etat.cumulKm))}</span>
                <span className="me-sous">{t('progRestant')}</span>
              </div>
              <div className="tuile-serie">
                <span className="serie-nombre">{Math.round(etat.totalKm)}</span>
                <span className="me-sous">{t('progTotal')}</span>
              </div>
            </div>

            <div className="ligne-champ" style={{ marginTop: 10 }}>
              <input
                className="champ-amis" style={{ flex: '0 1 160px' }} inputMode="numeric"
                value={saisie}
                onChange={(e) => setSaisie(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && poserObjectif()}
                placeholder={t('progNouvelObjectif')}
                aria-label={t('progNouvelObjectif')}
              />
              <button className="btn btn-primary" onClick={poserObjectif} disabled={!saisie}>
                {t('progPoser')}
              </button>
              {message ? <span className="me-note">{message}</span> : null}
            </div>
            <p className="me-note">{t('progNoteObjectif')}</p>
          </section>
        </>
      )}

      <p className="me-note">{t('progNoteLecture')}</p>
    </div>
  );
}
