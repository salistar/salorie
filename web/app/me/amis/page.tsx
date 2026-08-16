'use client';
// Mes amis, cote web.
// ---------------------------------------------------------------------------
// La liste d'amis n'existait QUE sur le telephone. Quelqu'un qui vit sur le web ne
// pouvait donc ni voir ses amis, ni en ajouter, ni en retirer — alors que c'est
// exactement le genre de chose qu'on fait a l'aise sur un grand ecran, avec un
// clavier pour saisir une adresse e-mail.
//
// Les appels voix et video restent sur le TELEPHONE : ils ont besoin du micro, de
// la camera et du GPS de la marche a deux. Le web sert a GERER la liste, pas a
// passer l'appel.
import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { doc, getDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

type Ami = { email: string; nom: string };

const norm = (e: string) => String(e || '').trim().toLowerCase();

export default function PageAmis() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [amis, setAmis] = useState<Ami[]>([]);
  const [charge, setCharge] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const charger = useCallback(async () => {
    if (!uid) return;
    try {
      const snap = await getDoc(doc(firestore(), 'users', uid));
      const emails = [...new Set(((snap.data()?.friends as string[]) || []).map(norm).filter(Boolean))];
      // Le nom vient du profil PUBLIC : le document prive d'autrui n'est pas
      // lisible, et c'est voulu.
      const liste = await Promise.all(
        emails.map(async (email) => {
          try {
            const p = await getDoc(doc(firestore(), 'public_profiles', email));
            return { email, nom: (p.data()?.name as string) || email.split('@')[0] };
          } catch {
            return { email, nom: email.split('@')[0] };
          }
        }),
      );
      setAmis(liste.sort((a, b) => a.nom.localeCompare(b.nom)));
    } catch {
      setAmis([]);
    } finally {
      setCharge(true);
    }
  }, [uid]);

  useEffect(() => {
    charger();
  }, [charger]);

  const ajouter = async () => {
    const cible = norm(saisie);
    if (!cible || occupe) return;
    if (cible === uid) {
      setMessage({ ok: false, texte: t('amisErrSelf') });
      return;
    }
    setOccupe(true);
    setMessage(null);
    try {
      // On verifie l'existence par le profil PUBLIC. Sans cette regle, on pourrait
      // entrer n'importe quelle adresse et decouvrir, par le message d'erreur, si
      // elle a un compte Salorie.
      const pp = await getDoc(doc(firestore(), 'public_profiles', cible));
      if (!pp.exists()) {
        setMessage({ ok: false, texte: t('amisErrNotfound') });
        return;
      }
      // Reciproque : les deux listes, sinon l'un croit au lien et l'autre non.
      await setDoc(doc(firestore(), 'users', uid), { friends: arrayUnion(cible) }, { merge: true });
      await setDoc(doc(firestore(), 'users', cible), { friends: arrayUnion(uid) }, { merge: true });
      setSaisie('');
      setMessage({ ok: true, texte: `${t('amisAjoute')} : ${(pp.data()?.name as string) || cible}` });
      await charger();
    } catch {
      setMessage({ ok: false, texte: t('amisErrError') });
    } finally {
      setOccupe(false);
    }
  };

  const retirer = async (ami: Ami) => {
    if (!window.confirm(`${ami.nom}\n\n${t('amisRetirerQ')}`)) return;
    // On retire de l'affichage AVANT la reponse : attendre l'aller-retour
    // donnerait l'impression que le clic n'a rien fait.
    setAmis((prev) => prev.filter((a) => a.email !== ami.email));
    try {
      await setDoc(doc(firestore(), 'users', uid), { friends: arrayRemove(ami.email) }, { merge: true });
      await setDoc(doc(firestore(), 'users', ami.email), { friends: arrayRemove(uid) }, { merge: true });
    } catch {
      await charger();
    }
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('amisTitre')}</h1>
        <p className="me-sous">{t('amisSous')}</p>
      </header>

      <section className="carte-amis">
        <h2 className="me-h2">{t('amisAjouter')}</h2>
        <div className="ligne-champ">
          <input
            className="champ-amis"
            type="email"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ajouter()}
            placeholder={t('amisChamp')}
            aria-label={t('amisChamp')}
          />
          <button className="btn btn-primary" onClick={ajouter} disabled={!saisie.trim() || occupe}>
            {t('amisValider')}
          </button>
        </div>
        {message ? (
          <p className={message.ok ? 'me-note' : 'me-erreur'}>{message.texte}</p>
        ) : null}
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('amisListe')}</h2>
        {!charge ? (
          <p className="me-sous">{t('communChargement')}</p>
        ) : amis.length === 0 ? (
          <p className="me-sous">{t('amisVide')}</p>
        ) : (
          <ul className="liste-amis">
            {amis.map((a) => (
              <li key={a.email} className="ligne-ami">
                <div className="ami-identite">
                  <strong>{a.nom}</strong>
                  <span className="me-sous">{a.email}</span>
                </div>
                <button className="btn btn-ghost" onClick={() => retirer(a)}>
                  {t('amisRetirer')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* Dire OU se passe l'appel evite de chercher un bouton qui n'existe pas
            ici : le micro, la camera et le GPS sont sur le telephone. */}
        <p className="me-sous" style={{ marginTop: 14 }}>{t('amisSurTelephone')}</p>
      </section>
    </div>
  );
}
