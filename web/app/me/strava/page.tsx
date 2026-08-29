'use client';
// Strava — relier son compte et importer ses sorties dans le journal.
// ---------------------------------------------------------------------------
// POURQUOI CETTE PAGE EXISTE
// Les sportifs enregistrent leurs sorties sur Strava, pas dans Salorie. Sans
// import, chaque course devait etre ressaisie a la main pour que la depense
// apparaisse dans le bilan du jour — et personne ne le fait deux fois. C'etait
// la raison la plus citee de ne pas tenir le journal les jours d'entrainement,
// c'est-a-dire precisement les jours ou il compte.
//
// CE QUE LA PAGE NE FAIT PAS : elle ne remplace pas Health Connect. Les deux
// sources ecrivent le MEME type de ligne (`type: 'activity'`), et quelqu'un qui
// utilise les deux verra ses seances deux fois. Le dedoublonnage entre sources
// differentes n'est pas resolu ici, et le dire vaut mieux que le laisser
// decouvrir.
import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { appelApi, useApi } from '../../../lib/apiSalorie';
import { ajouterLog } from '../../../lib/ecrireLog';
import { firestore } from '../../../lib/firebaseClient';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';

type Etat = { configure: boolean; connecte: boolean; athlete?: string; dernierImport?: number };
type Seance = { name: string; calories: number; durationMin: number; startISO: string; stravaId: number; distanceKm: number };

export default function PageStrava() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const { donnees: etat, charge, recharger } = useApi<Etat>('/strava/etat');
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);

  // Le retour de Strava se fait dans un AUTRE onglet : quand l'utilisateur
  // revient sur celui-ci, l'etat affiche est perime. On le relit au retour de
  // focus plutot que de lui demander de rafraichir la page lui-meme.
  useEffect(() => {
    const auRetour = () => { if (!document.hidden) recharger(); };
    document.addEventListener('visibilitychange', auRetour);
    return () => document.removeEventListener('visibilitychange', auRetour);
  }, [recharger]);

  const relier = async () => {
    setOccupe(true); setMessage('');
    try {
      const { url } = await appelApi<{ url: string }>('/strava/lien');
      setMessage(t('stravaOnglet'));
      window.open(url, '_blank', 'noopener');
    } catch {
      setMessage(t('stravaIndispo'));
    } finally { setOccupe(false); }
  };

  const delier = async () => {
    setOccupe(true); setMessage('');
    try { await appelApi('/strava/lien', { methode: 'DELETE' }); await recharger(); }
    catch { setMessage(t('stravaEchec')); }
    finally { setOccupe(false); }
  };

  /**
   * L'import.
   *
   * ⚠ LE DEDOUBLONNAGE VIT DANS FIRESTORE, PAS DANS LE NAVIGATEUR.
   * Une premiere version gardait les identifiants deja importes dans le
   * localStorage. Consequence : le meme import lance depuis le telephone puis
   * depuis le web ecrivait chaque seance deux fois, et le bilan de la journee
   * comptait la sortie en double. La liste vit donc avec le compte.
   */
  const importer = async () => {
    setOccupe(true); setMessage('');
    try {
      const { seances } = await appelApi<{ seances: Seance[] }>('/strava/importer', { methode: 'POST' });

      const ref = doc(firestore(), 'users', uid, 'integrations', 'strava');
      const snap = await getDoc(ref);
      const vus: number[] = (snap.exists() ? (snap.data() as any).seancesVues : []) || [];

      const nouvelles = seances.filter((s) => !vus.includes(s.stravaId));
      for (const s of nouvelles) {
        await ajouterLog(uid, {
          type: 'activity',
          // La distance dans le nom : « Course a pied — 8,4 km » se relit un mois
          // plus tard, « Course a pied » ne se relit pas.
          name: s.distanceKm > 0 ? `${s.name} — ${s.distanceKm} km` : s.name,
          calories: s.calories,
          date: s.startISO.slice(0, 10),
        });
      }

      // On ne garde que les deux cents derniers : la liste sert a ne pas
      // reimporter, pas a archiver. Sans borne, le document grossit sans fin et
      // finit par depasser la limite d'un document Firestore.
      await setDoc(ref, {
        seancesVues: [...vus, ...nouvelles.map((s) => s.stravaId)].slice(-200),
        majLe: Date.now(),
      }, { merge: true });

      const dejaLa = seances.length - nouvelles.length;
      setMessage(
        nouvelles.length === 0
          ? t('stravaAucune')
          : t('stravaImporte').replace('{n}', String(nouvelles.length)) +
            (dejaLa > 0 ? ' ' + t('stravaDejaLa').replace('{n}', String(dejaLa)) : ''),
      );
      await recharger();
    } catch {
      setMessage(t('stravaEchec'));
    } finally { setOccupe(false); }
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('stravaTitre')}</h1>
        <p className="me-sous">{t('stravaSous')}</p>
      </header>

      <section className="carte-amis">
        {!charge ? (
          <p className="me-sous">{t('communChargement')}</p>
        ) : !etat?.configure ? (
          <p className="me-sous">{t('stravaIndispo')}</p>
        ) : !etat.connecte ? (
          <button className="btn btn-primary" onClick={relier} disabled={occupe}>
            {t('stravaRelier')}
          </button>
        ) : (
          <>
            <p className="me-sous">
              <strong>{t('stravaRelie')}</strong>{etat.athlete ? ` — ${etat.athlete}` : ''}
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <button className="btn btn-primary" onClick={importer} disabled={occupe}>
                {t('stravaImporter')}
              </button>
              <button className="btn btn-ghost" onClick={delier} disabled={occupe}>
                {t('stravaDelier')}
              </button>
            </div>
          </>
        )}
        {message ? <p className="me-sous" style={{ marginTop: 12 }}>{message}</p> : null}
      </section>

      {/* Dit AVANT l'import, pas apres : quelqu'un qui decouvre des seances a
          0 kcal dans son journal conclut a un bug et cesse de se fier a l'outil. */}
      <p className="me-sous" style={{ marginTop: 16, fontSize: 13 }}>{t('stravaSansCalories')}</p>
    </div>
  );
}
