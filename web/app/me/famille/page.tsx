'use client';
// Ma famille — la gerer au clavier plutot qu'au pouce.
// ---------------------------------------------------------------------------
// Saisir plusieurs adresses e-mail au pouce est le genre de tache qu'on repousse.
// Repoussee, la famille ne se cree jamais — et c'est une fonction de retention :
// quelqu'un qui suit ses parents revient tous les jours.
//
// La creation et l'adhesion passent par le meme document `families` que le
// mobile. Une famille creee ici apparait sur le telephone sans rien a
// synchroniser.
import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

type Role = 'adulte' | 'enfant' | 'senior';
type Membre = { uid: string; email: string; name: string; role: Role };
type Famille = { id: string; ownerUid: string; name: string; code: string; members: Membre[] };

const norm = (e: string) => String(e || '').trim().toLowerCase();

export default function PageFamille() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [famille, setFamille] = useState<Famille | null>(null);
  const [charge, setCharge] = useState(false);
  const [nom, setNom] = useState('');
  const [codeSaisi, setCodeSaisi] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const charger = useCallback(async () => {
    if (!uid) return;
    try {
      const u = await getDoc(doc(firestore(), 'users', uid));
      const fid = String(u.data()?.familyId || '');
      if (!fid) {
        setFamille(null);
        return;
      }
      const f = await getDoc(doc(firestore(), 'families', fid));
      setFamille(f.exists() ? ({ id: f.id, ...(f.data() as any) } as Famille) : null);
    } catch {
      setFamille(null);
    } finally {
      setCharge(true);
    }
  }, [uid]);

  useEffect(() => {
    charger();
  }, [charger]);

  const creer = async () => {
    const n = nom.trim();
    if (!n || !uid || occupe) return;
    setOccupe(true);
    setMessage(null);
    try {
      // Un code court, lisible a voix haute : c'est ainsi qu'il circule dans une
      // famille — au telephone, pas par copier-coller.
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      const ref = doc(collection(firestore(), 'families'));
      const moi: Membre = {
        uid,
        email: uid,
        name: [profil?.firstName, profil?.lastName].filter(Boolean).join(' ') || uid.split('@')[0],
        role: 'adulte',
      };
      await setDoc(ref, { ownerUid: uid, name: n, code, members: [moi], createdAt: Date.now() });
      // Le lien depuis l'utilisateur : c'est lui qui permet de retrouver sa
      // famille sans balayer toute la collection.
      await setDoc(doc(firestore(), 'users', uid), { familyId: ref.id }, { merge: true });
      setNom('');
      await charger();
    } catch {
      setMessage({ ok: false, texte: t('familleErreur') });
    } finally {
      setOccupe(false);
    }
  };

  const rejoindre = async () => {
    const c = codeSaisi.trim().toUpperCase();
    if (!c || !uid || occupe) return;
    setOccupe(true);
    setMessage(null);
    try {
      const q = query(collection(firestore(), 'families'), where('code', '==', c));
      const snap = await getDocs(q);
      if (snap.empty) {
        setMessage({ ok: false, texte: t('familleCodeInconnu') });
        return;
      }
      const f = snap.docs[0];
      const moi: Membre = {
        uid,
        email: uid,
        name: [profil?.firstName, profil?.lastName].filter(Boolean).join(' ') || uid.split('@')[0],
        role: 'adulte',
      };
      // `arrayUnion` : deux personnes qui rejoignent en meme temps ne s'effacent
      // pas l'une l'autre, contrairement a une reecriture du tableau.
      await updateDoc(f.ref, { members: arrayUnion(moi) });
      await setDoc(doc(firestore(), 'users', uid), { familyId: f.id }, { merge: true });
      setCodeSaisi('');
      await charger();
    } catch {
      setMessage({ ok: false, texte: t('familleErreur') });
    } finally {
      setOccupe(false);
    }
  };

  const quitter = async () => {
    if (!famille || !uid) return;
    if (!window.confirm(t('familleQuitterQ'))) return;
    const moi = famille.members.find((m) => norm(m.uid) === uid);
    try {
      if (moi) await updateDoc(doc(firestore(), 'families', famille.id), { members: arrayRemove(moi) });
      await setDoc(doc(firestore(), 'users', uid), { familyId: '' }, { merge: true });
      setFamille(null);
    } catch {
      await charger();
    }
  };

  const roleLabel = (r: Role) => t(`familleRole_${r}`) || r;

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('familleTitre')}</h1>
        <p className="me-sous">{t('familleSous')}</p>
      </header>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : famille ? (
        <>
          <section className="carte-amis">
            <h2 className="me-h2">{famille.name}</h2>
            <p className="me-sous">
              {t('familleCode')} <strong className="code-famille">{famille.code}</strong>
            </p>
            <p className="me-sous">{t('familleCodeAstuce')}</p>
          </section>

          <section className="carte-amis">
            <h2 className="me-h2">{t('familleMembres')} ({famille.members?.length || 0})</h2>
            <ul className="liste-amis">
              {(famille.members || []).map((m) => (
                <li key={m.uid} className="ligne-ami">
                  <div className="ami-identite">
                    <strong>{m.name || m.email.split('@')[0]}</strong>
                    <span className="me-sous">{m.email}</span>
                  </div>
                  <span className="puce-role">{roleLabel(m.role)}</span>
                </li>
              ))}
            </ul>
            <div className="ligne-champ" style={{ marginTop: 14 }}>
              <button className="btn btn-ghost" onClick={quitter}>{t('familleQuitter')}</button>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="carte-amis">
            <h2 className="me-h2">{t('familleCreer')}</h2>
            <div className="ligne-champ">
              <input
                className="champ-amis"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && creer()}
                placeholder={t('familleNomChamp')}
                aria-label={t('familleNomChamp')}
              />
              <button className="btn btn-primary" onClick={creer} disabled={!nom.trim() || occupe}>
                {t('familleCreerBouton')}
              </button>
            </div>
          </section>

          <section className="carte-amis">
            <h2 className="me-h2">{t('familleRejoindre')}</h2>
            <div className="ligne-champ">
              <input
                className="champ-amis"
                value={codeSaisi}
                onChange={(e) => setCodeSaisi(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && rejoindre()}
                placeholder={t('familleCodeChamp')}
                aria-label={t('familleCodeChamp')}
              />
              <button className="btn btn-primary" onClick={rejoindre} disabled={!codeSaisi.trim() || occupe}>
                {t('familleRejoindreBouton')}
              </button>
            </div>
          </section>
        </>
      )}

      {message ? <p className={message.ok ? 'me-note' : 'me-erreur'}>{message.texte}</p> : null}
    </div>
  );
}
