'use client';
// Terrains — voir les creneaux libres, et reserver.
// ---------------------------------------------------------------------------
// Reserver, c'est choisir une heure en voyant celles qui sont deja prises. Sur
// telephone on lit une liste de reservations et on deduit les trous de tete ;
// ici la journee est une BANDE et les creneaux occupes sont dessus. Le trou se
// voit au lieu de se calculer.
//
// Un terrain propose n'est PAS reservable tant qu'un admin ne l'a pas valide
// (`approved`), exactement comme cote mobile : ce sont des lieux publics que
// n'importe qui peut declarer, et une adresse fausse envoie des gens nulle part.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import {
  collection, query, where, limit as fsLimit, getDocs, addDoc, doc, setDoc, runTransaction, serverTimestamp,
} from 'firebase/firestore';

const SPORTS = ['football', 'tennis', 'basketball', 'volleyball', 'badminton', 'running', 'padel', 'other'] as const;

type Terrain = {
  id: string;
  name: string;
  sport: string[];
  address: string;
  pricePerHour?: number;
};

type Reservation = { id: string; startTs: number; endTs: number; uid: string };

/** Journee affichee : 8 h → 23 h. En dehors, aucun terrain n'ouvre. */
const HEURE_DEBUT = 8;
const HEURE_FIN = 23;

const chevauche = (aD: number, aF: number, bD: number, bF: number) => aD < bF && bD < aF;

function jourLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function PageTerrains() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);
  const locale = langue === 'ar' ? 'ar-MA' : langue === 'en' ? 'en-GB' : 'fr-FR';

  const [terrains, setTerrains] = useState<Terrain[]>([]);
  const [charge, setCharge] = useState(false);
  const [filtre, setFiltre] = useState('');
  const [choisi, setChoisi] = useState<Terrain | null>(null);
  const [jour, setJour] = useState('');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);

  // Proposition d'un terrain
  const [nom, setNom] = useState('');
  const [adresse, setAdresse] = useState('');
  const [sportP, setSportP] = useState<string>('football');
  const [prix, setPrix] = useState('');
  const [propose, setPropose] = useState<'' | 'ok' | 'erreur'>('');

  useEffect(() => {
    setJour(jourLocal(new Date()));
  }, []);

  const chargerTerrains = useCallback(async () => {
    try {
      const snap = await getDocs(
        query(collection(firestore(), 'sport_fields'), where('approved', '==', true), fsLimit(100)),
      );
      let l = snap.docs.map((d) => {
        const x = d.data() as any;
        return {
          id: d.id,
          name: String(x.name || ''),
          sport: Array.isArray(x.sport) ? x.sport.map(String) : [],
          address: String(x.address || ''),
          pricePerHour: Number(x.pricePerHour) || undefined,
        } as Terrain;
      });
      if (filtre) l = l.filter((f) => f.sport.includes(filtre));
      l.sort((a, b) => a.name.localeCompare(b.name));
      setTerrains(l);
    } catch {
      setTerrains([]);
    } finally {
      setCharge(true);
    }
  }, [filtre]);

  useEffect(() => {
    chargerTerrains();
  }, [chargerTerrains]);

  const chargerReservations = useCallback(async (t2: Terrain | null) => {
    if (!t2) return setReservations([]);
    try {
      const snap = await getDocs(
        query(
          collection(firestore(), 'sport_reservations'),
          where('fieldId', '==', t2.id),
          where('status', '==', 'confirmed'),
          fsLimit(200),
        ),
      );
      setReservations(
        snap.docs.map((d) => {
          const x = d.data() as any;
          return { id: d.id, startTs: Number(x.startTs) || 0, endTs: Number(x.endTs) || 0, uid: String(x.uid || '') };
        }),
      );
    } catch {
      setReservations([]);
    }
  }, []);

  useEffect(() => {
    chargerReservations(choisi);
  }, [choisi, chargerReservations]);

  /** Les creneaux d'une heure de la journee affichee, avec leur etat. */
  const creneaux = useMemo(() => {
    if (!jour) return [];
    const [a, m, j] = jour.split('-').map(Number);
    const maintenant = Date.now();
    return Array.from({ length: HEURE_FIN - HEURE_DEBUT }, (_, i) => {
      const debut = new Date(a, m - 1, j, HEURE_DEBUT + i).getTime();
      const fin = debut + 3600000;
      const prise = reservations.find((r) => chevauche(debut, fin, r.startTs, r.endTs));
      return {
        debut,
        fin,
        heure: HEURE_DEBUT + i,
        prise: !!prise,
        // Distinguer SA propre reservation de celle d'un autre : sinon on ne
        // sait pas si le creneau gris est le sien ou celui d'un inconnu.
        mienne: !!prise && prise.uid === uid,
        passe: fin <= maintenant,
      };
    });
  }, [jour, reservations, uid]);

  const reserver = async (debut: number, fin: number) => {
    if (!uid || !choisi || occupe) return;
    setOccupe(true);
    setMessage('');
    try {
      // IDENTIFIANT DETERMINISTE : terrain + debut du creneau. Deux personnes qui
      // reservent la meme heure au meme instant ne peuvent pas creer deux
      // documents — le second trouve le premier dans sa transaction et echoue.
      //
      // Le mobile, lui, fait une lecture PUIS une ecriture avec un id aleatoire :
      // deux reservations simultanees y passent toutes les deux. On ne peut pas
      // le corriger d'ici (un id aleatoire est invisible a ce controle), donc on
      // GARDE AUSSI la verification de chevauchement ci-dessous : elle rattrape
      // les creneaux poses depuis le telephone. Le web est donc au pire aussi sur
      // que le mobile, et strictement plus sur entre navigateurs.
      const id = `${choisi.id}_${debut}`;
      const ref = doc(firestore(), 'sport_reservations', id);

      const conflit = reservations.some((r) => chevauche(debut, fin, r.startTs, r.endTs));
      if (conflit) {
        setMessage(t('terrainsPris'));
        return;
      }

      const sortie = await runTransaction(firestore(), async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists() && (snap.data() as any)?.status === 'confirmed') return 'conflit';
        tx.set(ref, {
          fieldId: choisi.id,
          uid,
          startTs: debut,
          endTs: fin,
          status: 'confirmed',
          createdAt: serverTimestamp(),
        });
        return 'ok';
      });

      setMessage(sortie === 'ok' ? t('terrainsReserve') : t('terrainsPris'));
      await chargerReservations(choisi);
    } catch {
      setMessage(t('terrainsErreur'));
    } finally {
      setOccupe(false);
    }
  };

  const annuler = async (debut: number) => {
    if (!uid || !choisi) return;
    try {
      // On ne SUPPRIME pas : on passe en « annulee ». Un creneau efface ne laisse
      // aucune trace, et on ne saurait plus qui avait reserve quoi en cas de
      // litige sur un terrain payant.
      await setDoc(
        doc(firestore(), 'sport_reservations', `${choisi.id}_${debut}`),
        { status: 'cancelled' },
        { merge: true },
      );
      await chargerReservations(choisi);
    } catch {
      setMessage(t('terrainsErreur'));
    }
  };

  const proposer = async () => {
    const n = nom.trim();
    const ad = adresse.trim();
    if (!n || !ad || !uid) return;
    try {
      await addDoc(collection(firestore(), 'sport_fields'), {
        name: n.slice(0, 120),
        sport: [sportP],
        address: ad.slice(0, 200),
        pricePerHour: Math.max(0, Number(prix) || 0),
        ownerUid: uid,
        // Rien n'est reservable avant validation : ce sont des lieux publics que
        // n'importe qui peut declarer.
        approved: false,
        createdTs: Date.now(),
      });
      setNom('');
      setAdresse('');
      setPrix('');
      setPropose('ok');
    } catch {
      setPropose('erreur');
    }
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('terrainsTitre')}</h1>
        <p className="me-sous">{t('terrainsSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ">
          <select className="champ-amis" style={{ flex: '0 1 200px' }} value={filtre}
            onChange={(e) => { setFiltre(e.target.value); setChoisi(null); }} aria-label={t('matchsSport')}>
            <option value="">{t('matchsTousSports')}</option>
            {SPORTS.map((s) => <option key={s} value={s}>{t(`matchsSport_${s}`) || s}</option>)}
          </select>
          <span className="me-sous">{terrains.length}</span>
        </div>
      </section>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : terrains.length === 0 ? (
        <p className="me-sous">{t('terrainsAucun')}</p>
      ) : (
        <ul className="grille-matchs">
          {terrains.map((f) => (
            <li key={f.id} className={`carte-match${choisi?.id === f.id ? ' carte-choisie' : ''}`}>
              <button className="exo-tete" onClick={() => setChoisi(choisi?.id === f.id ? null : f)} aria-expanded={choisi?.id === f.id}>
                <strong>{f.name}</strong>
                {f.pricePerHour ? <span className="puce-role">{f.pricePerHour} MAD/h</span> : null}
              </button>
              <span className="me-sous">{f.address}</span>
              <span className="me-sous">{f.sport.map((s) => t(`matchsSport_${s}`) || s).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}

      {choisi ? (
        <section className="carte-amis">
          <h2 className="me-h2">{choisi.name}</h2>
          <div className="ligne-champ">
            <input className="champ-amis" style={{ flex: '0 1 190px' }} type="date"
              value={jour} onChange={(e) => setJour(e.target.value)} aria-label={t('terrainsJour')} />
            <span className="me-sous">
              {jour ? new Date(jour).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
            </span>
          </div>

          <div className="creneaux">
            {creneaux.map((c) => {
              const etat = c.mienne ? 'creneau-mien' : c.prise ? 'creneau-pris' : c.passe ? 'creneau-passe' : 'creneau-libre';
              return (
                <button
                  key={c.debut}
                  className={`creneau ${etat}`}
                  disabled={(c.prise && !c.mienne) || c.passe || occupe}
                  onClick={() => (c.mienne ? annuler(c.debut) : reserver(c.debut, c.fin))}
                  title={c.mienne ? t('terrainsAnnuler') : c.prise ? t('terrainsPris') : t('terrainsLibre')}
                >
                  <span className="creneau-h">{String(c.heure).padStart(2, '0')}:00</span>
                  <span className="creneau-etat">
                    {c.mienne ? t('terrainsMien') : c.prise ? t('terrainsPris') : c.passe ? '—' : t('terrainsLibre')}
                  </span>
                </button>
              );
            })}
          </div>
          {message ? <p className="me-note">{message}</p> : null}
          <p className="me-note">{t('terrainsAstuce')}</p>
        </section>
      ) : null}

      <section className="carte-amis">
        <h2 className="me-h2">{t('terrainsProposer')}</h2>
        <div className="ligne-champ">
          <input className="champ-amis" style={{ flex: '1 1 180px' }} value={nom}
            onChange={(e) => setNom(e.target.value.slice(0, 120))}
            placeholder={t('terrainsNom')} aria-label={t('terrainsNom')} />
          <input className="champ-amis" style={{ flex: '1 1 220px' }} value={adresse}
            onChange={(e) => setAdresse(e.target.value.slice(0, 200))}
            placeholder={t('terrainsAdresse')} aria-label={t('terrainsAdresse')} />
          <select className="champ-amis" style={{ flex: '0 1 150px' }} value={sportP}
            onChange={(e) => setSportP(e.target.value)} aria-label={t('matchsSport')}>
            {SPORTS.map((s) => <option key={s} value={s}>{t(`matchsSport_${s}`) || s}</option>)}
          </select>
          <input className="champ-amis" style={{ flex: '0 1 130px' }} inputMode="numeric" value={prix}
            onChange={(e) => setPrix(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={t('terrainsPrix')} aria-label={t('terrainsPrix')} />
          <button className="btn btn-primary" onClick={proposer} disabled={!nom.trim() || !adresse.trim()}>
            {t('terrainsProposerBouton')}
          </button>
        </div>
        {propose === 'ok' ? <p className="me-note">{t('terrainsPropose')}</p> : null}
        {propose === 'erreur' ? <p className="me-erreur">{t('terrainsErreur')}</p> : null}
      </section>
    </div>
  );
}
