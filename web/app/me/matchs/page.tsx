'use client';
// Matchs entre amis — organiser, et rejoindre.
// ---------------------------------------------------------------------------
// ORGANISER un match, c'est remplir un formulaire : un titre, un lieu, une date,
// une heure, un nombre de joueurs. Sur telephone, la date et l'heure passent par
// deux selecteurs a molette qu'on ouvre et referme ; ici ce sont deux champs, et
// on voit tout le formulaire en meme temps.
//
// JOUER, en revanche, reste au telephone — c'est lui qu'on a dans la poche sur
// le terrain. Cette page organise, elle ne suit pas le match.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import {
  collection, query, where, limit as fsLimit, getDocs, addDoc, doc, runTransaction,
} from 'firebase/firestore';

const SPORTS = ['football', 'tennis', 'basketball', 'volleyball', 'badminton', 'running', 'padel', 'other'] as const;

type Match = {
  id: string;
  sport: string;
  title: string;
  placeName: string;
  dateTs: number;
  durationMin: number;
  capacity: number;
  participants: string[];
  hostUid: string;
  status: string;
};

/** Valeur par defaut du champ date-heure : demain a 18 h, l'horaire le plus
 *  courant pour un match apres le travail. Un champ vide fait taper plus. */
function demainSoir(): string {
  const d = new Date(Date.now() + 86400000);
  d.setHours(18, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function PageMatchs() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);
  const locale = langue === 'ar' ? 'ar-MA' : langue === 'en' ? 'en-GB' : 'fr-FR';

  const [matchs, setMatchs] = useState<Match[]>([]);
  const [charge, setCharge] = useState(false);
  const [filtre, setFiltre] = useState('');

  const [titre, setTitre] = useState('');
  const [sport, setSport] = useState<string>('football');
  const [lieu, setLieu] = useState('');
  const [quand, setQuand] = useState('');
  const [duree, setDuree] = useState('90');
  const [places, setPlaces] = useState('10');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState('');

  // Le defaut est pose apres le montage : cette page est pre-rendue au build, et
  // « demain » y serait le lendemain de la compilation.
  useEffect(() => {
    setQuand(demainSoir());
  }, []);

  const charger = useCallback(async () => {
    try {
      // Pas d'`orderBy` avec le `where` : ca exigerait un index composite
      // Firestore. Le tri se fait en memoire, comme cote mobile.
      const ref = collection(firestore(), 'sport_matches');
      const q = filtre ? query(ref, where('sport', '==', filtre), fsLimit(100)) : query(ref, fsLimit(100));
      const snap = await getDocs(q);
      const maintenant = Date.now();
      const l = snap.docs
        .map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            sport: String(x.sport || 'other'),
            title: String(x.title || ''),
            placeName: String(x.placeName || ''),
            dateTs: Number(x.dateTs) || 0,
            durationMin: Number(x.durationMin) || 90,
            capacity: Number(x.capacity) || 0,
            participants: Array.isArray(x.participants) ? x.participants : [],
            hostUid: String(x.hostUid || ''),
            status: String(x.status || 'open'),
          } as Match;
        })
        // Un match annule, termine ou deja passe n'a rien a faire dans une liste
        // ou on vient chercher quelque chose a rejoindre.
        .filter((m) => m.status !== 'cancelled' && m.status !== 'done')
        .filter((m) => m.dateTs + m.durationMin * 60000 >= maintenant)
        .sort((a, b) => a.dateTs - b.dateTs);
      setMatchs(l);
    } catch {
      setMatchs([]);
    } finally {
      setCharge(true);
    }
  }, [filtre]);

  useEffect(() => {
    charger();
  }, [charger]);

  const creer = async () => {
    const li = lieu.trim();
    if (!li || !quand || !uid || occupe) return;
    const ts = new Date(quand).getTime();
    if (!Number.isFinite(ts)) return;
    setOccupe(true);
    setMessage('');
    try {
      await addDoc(collection(firestore(), 'sport_matches'), {
        sport,
        title: titre.trim().slice(0, 120) || li.slice(0, 120),
        placeName: li.slice(0, 120),
        dateTs: ts,
        durationMin: Math.max(15, Math.min(480, Number(duree) || 90)),
        capacity: Math.max(1, Math.min(1000, Number(places) || 2)),
        // L'organisateur est AUTOMATIQUEMENT le premier inscrit, comme cote
        // mobile. Sans ca, un match apparait a zero participant alors que
        // quelqu'un l'a bien prevu — et personne ne rejoint un match vide.
        participants: [uid],
        hostUid: uid,
        status: 'open',
        createdTs: Date.now(),
      });
      setTitre('');
      setLieu('');
      setMessage(t('matchsCree'));
      await charger();
    } catch {
      setMessage(t('matchsErreur'));
    } finally {
      setOccupe(false);
    }
  };

  const rejoindre = async (m: Match) => {
    if (!uid) return;
    setMessage('');
    try {
      // TRANSACTION, pas un `arrayUnion` : deux personnes qui cliquent en meme
      // temps sur la derniere place entreraient toutes les deux. La capacite est
      // relue DANS la transaction, exactement comme `joinMatch` cote mobile.
      const ref = doc(firestore(), 'sport_matches', m.id);
      const sortie = await runTransaction(firestore(), async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return 'introuvable';
        const d = snap.data() as any;
        const statut = String(d.status || 'open');
        if (statut === 'cancelled' || statut === 'done') return 'ferme';
        const p: string[] = Array.isArray(d.participants) ? d.participants : [];
        if (p.includes(uid)) return 'ok'; // deja inscrit — idempotent
        const cap = Number(d.capacity) || 0;
        if (cap > 0 && p.length >= cap) return 'complet';
        const suite = [...p, uid];
        tx.update(ref, { participants: suite, status: cap > 0 && suite.length >= cap ? 'full' : statut });
        return 'ok';
      });
      setMessage(sortie === 'ok' ? t('matchsRejoint') : t(`matchsErr_${sortie}`) || t('matchsErreur'));
      await charger();
    } catch {
      setMessage(t('matchsErreur'));
    }
  };

  const quitter = async (m: Match) => {
    if (!uid) return;
    try {
      const ref = doc(firestore(), 'sport_matches', m.id);
      await runTransaction(firestore(), async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const d = snap.data() as any;
        const p: string[] = Array.isArray(d.participants) ? d.participants : [];
        const suite = p.filter((x) => x !== uid);
        // Un match qui redescend sous sa capacite REPASSE en « ouvert » : sinon
        // la place liberee reste invisible et le match meurt a moitie rempli.
        tx.update(ref, { participants: suite, status: d.status === 'full' ? 'open' : d.status });
      });
      await charger();
    } catch {
      setMessage(t('matchsErreur'));
    }
  };

  const quandLisible = (ts: number) =>
    new Date(ts).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const miens = useMemo(() => matchs.filter((m) => m.participants.includes(uid)), [matchs, uid]);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('matchsTitre')}</h1>
        <p className="me-sous">{t('matchsSous')}</p>
      </header>

      <section className="carte-amis">
        <h2 className="me-h2">{t('matchsOrganiser')}</h2>
        <div className="ligne-champ">
          <input className="champ-amis" style={{ flex: '1 1 200px' }} value={titre}
            onChange={(e) => setTitre(e.target.value.slice(0, 120))}
            placeholder={t('matchsTitreChamp')} aria-label={t('matchsTitreChamp')} />
          <select className="champ-amis" style={{ flex: '0 1 160px' }} value={sport}
            onChange={(e) => setSport(e.target.value)} aria-label={t('matchsSport')}>
            {SPORTS.map((s) => <option key={s} value={s}>{t(`matchsSport_${s}`) || s}</option>)}
          </select>
          <input className="champ-amis" style={{ flex: '1 1 180px' }} value={lieu}
            onChange={(e) => setLieu(e.target.value.slice(0, 120))}
            placeholder={t('matchsLieu')} aria-label={t('matchsLieu')} />
        </div>
        <div className="ligne-champ" style={{ marginTop: 10 }}>
          <label className="champ-bloc" style={{ flex: '1 1 220px' }}>
            <span className="me-sous">{t('matchsQuand')}</span>
            <input className="champ-amis" type="datetime-local" value={quand}
              onChange={(e) => setQuand(e.target.value)} aria-label={t('matchsQuand')} />
          </label>
          <label className="champ-bloc" style={{ flex: '0 1 130px' }}>
            <span className="me-sous">{t('matchsDuree')}</span>
            <input className="champ-amis" inputMode="numeric" value={duree}
              onChange={(e) => setDuree(e.target.value.replace(/[^0-9]/g, ''))} aria-label={t('matchsDuree')} />
          </label>
          <label className="champ-bloc" style={{ flex: '0 1 130px' }}>
            <span className="me-sous">{t('matchsPlaces')}</span>
            <input className="champ-amis" inputMode="numeric" value={places}
              onChange={(e) => setPlaces(e.target.value.replace(/[^0-9]/g, ''))} aria-label={t('matchsPlaces')} />
          </label>
          <button className="btn btn-primary" onClick={creer} disabled={!lieu.trim() || !quand || occupe}>
            {t('matchsCreer')}
          </button>
        </div>
        {message ? <p className="me-note">{message}</p> : null}
      </section>

      <section className="carte-amis">
        <div className="ligne-champ">
          <select className="champ-amis" style={{ flex: '0 1 200px' }} value={filtre}
            onChange={(e) => setFiltre(e.target.value)} aria-label={t('matchsSport')}>
            <option value="">{t('matchsTousSports')}</option>
            {SPORTS.map((s) => <option key={s} value={s}>{t(`matchsSport_${s}`) || s}</option>)}
          </select>
          <span className="me-sous">{matchs.length} · {t('matchsInscrit')} {miens.length}</span>
        </div>
      </section>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : matchs.length === 0 ? (
        <p className="me-sous">{t('matchsAucun')}</p>
      ) : (
        <ul className="grille-matchs">
          {matchs.map((m) => {
            const inscrit = m.participants.includes(uid);
            const complet = m.capacity > 0 && m.participants.length >= m.capacity;
            return (
              <li key={m.id} className="carte-match">
                <div className="match-tete">
                  <strong>{m.title}</strong>
                  <span className="puce-role">{t(`matchsSport_${m.sport}`) || m.sport}</span>
                </div>
                <span className="me-sous">{quandLisible(m.dateTs)} · {m.durationMin} min</span>
                <span className="me-sous">{m.placeName}</span>
                <div className="match-places">
                  <span className={complet && !inscrit ? 'match-complet' : ''}>
                    {m.participants.length}{m.capacity ? ` / ${m.capacity}` : ''} {t('matchsJoueurs')}
                  </span>
                  {m.hostUid === uid ? <span className="puce-role">{t('matchsHote')}</span> : null}
                </div>
                <div className="ligne-champ" style={{ marginTop: 8 }}>
                  {inscrit ? (
                    <button className="btn btn-ghost" onClick={() => quitter(m)}>{t('matchsQuitter')}</button>
                  ) : (
                    <button className="btn btn-primary" onClick={() => rejoindre(m)} disabled={complet}>
                      {complet ? t('matchsComplet') : t('matchsRejoindre')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="me-note">{t('matchsNote')}</p>
    </div>
  );
}
