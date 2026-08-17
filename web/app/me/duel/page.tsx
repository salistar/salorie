'use client';
// Duel de la semaine — se mesurer a un ami, avec un gage.
// ---------------------------------------------------------------------------
// Le gain web est plus MODESTE que sur les autres ecrans, et autant le dire : le
// score se lit aussi bien sur un telephone. Ce qui change vraiment, c'est le
// GAGE — une phrase qu'on ecrit, qu'on relit, qu'on peaufine — et le fait de
// choisir son adversaire dans une liste d'amis visible en entier plutot que dans
// un selecteur qui en montre trois.
//
// Le score n'est PAS invente ici : c'est le nombre de jours ou quelque chose a
// ete enregistre sur les sept derniers, exactement la regle du mobile. Deux
// definitions differentes du meme score rendraient le duel absurde.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil, useLogsDepuis } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/** Les seules cles admises dans un profil PUBLIC. Reprise a l'identique de
 *  `lib/publicProfile.ts` : ce document est lisible par d'autres comptes, et
 *  y laisser filtrer un champ de sante serait une fuite, pas un bug d'affichage. */
const CLES_PUBLIQUES = ['name', 'imageUrl', 'streak', 'daysTracked', 'recentActivity', 'weeklyScore', 'gage', 'updatedAt'];

function ilYA(jours: number): string {
  const d = new Date(Date.now() - jours * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Meme normalisation que `emailToDocId` cote mobile : trim + minuscules. */
const versDocId = (email: string) => email.trim().toLowerCase();

export default function PageDuel() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [depuis, setDepuis] = useState('');
  useEffect(() => {
    setDepuis(ilYA(7));
  }, []);

  const { lignes, charge } = useLogsDepuis(uid, depuis);

  const [amis, setAmis] = useState<string[]>([]);
  const [adversaire, setAdversaire] = useState('');
  const [sien, setSien] = useState<{ score: number; gage: string } | null>(null);
  const [gage, setGage] = useState('');
  const [enregistre, setEnregistre] = useState(false);
  // Le gage n'est pre-rempli QU'UNE FOIS. Sans ce garde, quelqu'un qui vide le
  // champ pour le reecrire verrait l'ancien texte revenir a la publication
  // suivante du score — un champ qui se re-remplit tout seul.
  const [gageAmorce, setGageAmorce] = useState(false);

  // Score : jours DISTINCTS avec au moins une ligne, sur sept jours. La regle du
  // mobile, au mot pres — c'est ce qui rend les deux scores comparables.
  const monScore = useMemo(() => {
    const jours = new Set((lignes || []).filter((l) => l.date).map((l) => String(l.date)));
    return jours.size;
  }, [lignes]);

  const chargerAmis = useCallback(async () => {
    if (!uid) return;
    try {
      const snap = await getDoc(doc(firestore(), 'users', uid));
      const l = (snap.data() as any)?.friends;
      setAmis(Array.isArray(l) ? l.map(String) : []);
    } catch {
      setAmis([]);
    }
  }, [uid]);

  useEffect(() => {
    chargerAmis();
  }, [chargerAmis]);

  // Publication de SON score, et relecture de son propre gage.
  const publier = useCallback(async () => {
    if (!uid || !charge) return;
    try {
      const ref = doc(firestore(), 'public_profiles', uid);
      const mien = await getDoc(ref);
      if (!gageAmorce) {
        setGage(String((mien.data() as any)?.gage || ''));
        setGageAmorce(true);
      }
      const patch: Record<string, unknown> = { weeklyScore: monScore, updatedAt: Date.now() };
      // Filtrage defensif : on n'ecrit que des cles de l'allowlist, meme quand
      // c'est nous qui construisons l'objet. Un champ ajoute par distraction
      // demain partirait sinon dans un document PUBLIC.
      const sur = Object.fromEntries(Object.entries(patch).filter(([k]) => CLES_PUBLIQUES.includes(k)));
      await setDoc(ref, sur, { merge: true });
    } catch {
      /* le duel reste lisible meme si la publication echoue */
    }
  }, [uid, monScore, charge, gageAmorce]);

  useEffect(() => {
    publier();
  }, [publier]);

  const lireAdversaire = async (email: string) => {
    setSien(null);
    if (!email) return;
    try {
      const snap = await getDoc(doc(firestore(), 'public_profiles', versDocId(email)));
      const d = (snap.data() as any) || {};
      setSien({ score: Number(d.weeklyScore) || 0, gage: String(d.gage || '') });
    } catch {
      setSien({ score: 0, gage: '' });
    }
  };

  const poserGage = async () => {
    if (!uid) return;
    try {
      await setDoc(
        doc(firestore(), 'public_profiles', uid),
        { gage: gage.trim().slice(0, 200), updatedAt: Date.now() },
        { merge: true },
      );
      setEnregistre(true);
      setTimeout(() => setEnregistre(false), 4000);
    } catch {
      setEnregistre(false);
    }
  };

  const verdict =
    !sien ? '' : monScore > sien.score ? 'gagne' : monScore < sien.score ? 'perdu' : 'egalite';

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('duelTitre')}</h1>
        <p className="me-sous">{t('duelSous')}</p>
      </header>

      <section className="carte-amis">
        <h2 className="me-h2">{t('duelAdversaire')}</h2>
        {amis.length === 0 ? (
          // On ne propose PAS de champ libre : le duel ne marche qu'entre amis,
          // et un champ ou l'on tape n'importe quelle adresse laisserait croire
          // le contraire.
          <p className="me-sous">{t('duelPasDAmis')}</p>
        ) : (
          <div className="ligne-champ">
            <select
              className="champ-amis" style={{ flex: '1 1 260px' }}
              value={adversaire}
              onChange={(e) => { setAdversaire(e.target.value); lireAdversaire(e.target.value); }}
              aria-label={t('duelAdversaire')}
            >
              <option value="">{t('duelChoisir')}</option>
              {amis.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        )}
      </section>

      <section className="carte-amis">
        <div className="grille-series">
          <div className="tuile-serie">
            <span className="serie-nombre">{monScore}<span className="serie-sur"> / 7</span></span>
            <span className="me-sous">{t('duelMonScore')}</span>
          </div>
          {sien ? (
            <div className="tuile-serie">
              <span className="serie-nombre">{sien.score}<span className="serie-sur"> / 7</span></span>
              <span className="me-sous">{adversaire}</span>
            </div>
          ) : null}
        </div>

        {verdict ? (
          <p className={`duel-verdict duel-${verdict}`}>{t(`duelVerdict_${verdict}`)}</p>
        ) : null}

        {sien?.gage ? (
          <p className="me-note">{t('duelSonGage')} « {sien.gage} »</p>
        ) : sien ? (
          <p className="me-note">{t('duelPasDeGage')}</p>
        ) : null}

        <p className="me-note">{t('duelRegle')}</p>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('duelMonGage')}</h2>
        <textarea
          className="champ-mur"
          value={gage}
          onChange={(e) => setGage(e.target.value.slice(0, 200))}
          placeholder={t('duelGagePlaceholder')}
          aria-label={t('duelMonGage')}
        />
        <div className="ligne-champ" style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={poserGage} disabled={!gage.trim()}>
            {t('duelPublierGage')}
          </button>
          {enregistre ? <span className="me-note">{t('duelGagePublie')}</span> : null}
          <span className="me-sous">{gage.length} / 200</span>
        </div>
        {/* Le gage est PUBLIC : il part dans `public_profiles`, que les amis
            lisent. Le dire evite qu'on y ecrive quelque chose de prive. */}
        <p className="me-note">{t('duelGagePublic')}</p>
      </section>
    </div>
  );
}
