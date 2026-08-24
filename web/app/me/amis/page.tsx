'use client';
// Mes amis, cote web.
// ---------------------------------------------------------------------------
// La liste d'amis n'existait QUE sur le telephone. Quelqu'un qui vit sur le web ne
// pouvait donc ni voir ses amis, ni en inviter, ni en retirer — alors que c'est
// exactement le genre de chose qu'on fait a l'aise sur un grand ecran, avec un
// clavier pour saisir une adresse e-mail.
//
// ## L'amitie se DEMANDE
//
// Jusqu'au 24/08/2026, saisir une adresse suffisait a devenir l'ami de son
// proprietaire : on s'inscrivait dans sa liste, sans lui demander. Or l'amitie
// ouvre le mur et les appels du duo. Desormais trois etats :
//
//   invitation envoyee  (`friend_pending` chez moi, `friend_requests` chez elle)
//   demande recue       (`friend_requests` chez moi)
//   amis                (`friends` des DEUX cotes — le serveur exige les deux)
//
// ## Un ami qui vous a retire reste affiche
//
// Le document prive d'autrui n'est pas lisible : cette page ne peut pas verifier
// la reciprocite, seul le serveur le fait. Quelqu'un qui vous retire disparait
// donc de SA liste, pas de la votre — l'appel repondra « pas ami ». C'est le
// comportement voulu : on ne notifie pas un retrait.
import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { doc, getDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

type Personne = { email: string; nom: string };

const norm = (e: string) => String(e || '').trim().toLowerCase();
const uniques = (v: unknown) => [...new Set(((v as string[]) || []).map(norm).filter(Boolean))];

export default function PageAmis() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [amis, setAmis] = useState<Personne[]>([]);
  const [recues, setRecues] = useState<Personne[]>([]);
  const [envoyees, setEnvoyees] = useState<Personne[]>([]);
  const [charge, setCharge] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  // Le nom vient du profil PUBLIC : le document prive d'autrui n'est pas
  // lisible, et c'est voulu.
  const nommer = useCallback(async (emails: string[]): Promise<Personne[]> => {
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
    return liste.sort((a, b) => a.nom.localeCompare(b.nom));
  }, []);

  const charger = useCallback(async () => {
    if (!uid) return;
    try {
      const d = (await getDoc(doc(firestore(), 'users', uid))).data() || {};
      const listeAmis = uniques(d.friends);
      // En attente = invite, pas encore accepte. Quand la personne accepte, elle
      // s'inscrit dans mes `friends` ; l'invitation cesse alors d'etre en attente
      // sans que personne ait a nettoyer quoi que ce soit.
      const attente = uniques(d.friend_pending).filter((e) => !listeAmis.includes(e));
      const demandes = uniques(d.friend_requests).filter((e) => !listeAmis.includes(e));
      const [a, r, en] = await Promise.all([nommer(listeAmis), nommer(demandes), nommer(attente)]);
      setAmis(a);
      setRecues(r);
      setEnvoyees(en);
    } catch {
      setAmis([]);
      setRecues([]);
      setEnvoyees([]);
    } finally {
      setCharge(true);
    }
  }, [uid, nommer]);

  useEffect(() => {
    charger();
  }, [charger]);

  const inviter = async () => {
    const cible = norm(saisie);
    if (!cible || occupe) return;
    if (cible === uid) {
      setMessage({ ok: false, texte: t('amisErrSelf') });
      return;
    }
    if (amis.some((a) => a.email === cible)) {
      setMessage({ ok: false, texte: t('amisErrDeja') });
      return;
    }
    if (envoyees.some((a) => a.email === cible)) {
      setMessage({ ok: false, texte: t('amisErrEnvoyee') });
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
      // MON consentement d'abord, dans MON document. C'est lui que la regle
      // Firestore lira quand la personne acceptera : elle ne pourra s'inscrire
      // dans mes amis que parce que cette ligne existe.
      await setDoc(doc(firestore(), 'users', uid), { friend_pending: arrayUnion(cible) }, { merge: true });
      // La sonnette chez elle. N'accorde RIEN par elle-meme.
      await setDoc(doc(firestore(), 'users', cible), { friend_requests: arrayUnion(uid) }, { merge: true });
      setSaisie('');
      setMessage({ ok: true, texte: `${t('amisDemande')} — ${(pp.data()?.name as string) || cible}` });
      await charger();
    } catch {
      setMessage({ ok: false, texte: t('amisErrError') });
    } finally {
      setOccupe(false);
    }
  };

  const accepter = async (p: Personne) => {
    if (occupe) return;
    setOccupe(true);
    setMessage(null);
    try {
      // CHEZ ELLE D'ABORD. Si cette ecriture echoue — invitation annulee entre
      // temps — la demande reste dans ma liste et je peux reessayer. L'ordre
      // inverse effacerait la demande sans creer le lien.
      await setDoc(doc(firestore(), 'users', p.email), { friends: arrayUnion(uid) }, { merge: true });
      await setDoc(
        doc(firestore(), 'users', uid),
        { friends: arrayUnion(p.email), friend_requests: arrayRemove(p.email) },
        { merge: true },
      );
      await charger();
    } catch {
      setMessage({ ok: false, texte: t('amisErrError') });
    } finally {
      setOccupe(false);
    }
  };

  const refuser = async (p: Personne) => {
    setRecues((prev) => prev.filter((x) => x.email !== p.email));
    try {
      await setDoc(doc(firestore(), 'users', uid), { friend_requests: arrayRemove(p.email) }, { merge: true });
    } catch {
      await charger();
    }
  };

  const annuler = async (p: Personne) => {
    setEnvoyees((prev) => prev.filter((x) => x.email !== p.email));
    try {
      // Les deux cotes : sans mon `friend_pending`, la personne ne peut plus
      // s'inscrire dans mes amis ; sans sa `friend_requests`, elle ne voit plus
      // une invitation qui ne menerait nulle part.
      await setDoc(doc(firestore(), 'users', uid), { friend_pending: arrayRemove(p.email) }, { merge: true });
      await setDoc(doc(firestore(), 'users', p.email), { friend_requests: arrayRemove(uid) }, { merge: true });
    } catch {
      await charger();
    }
  };

  const retirer = async (ami: Personne) => {
    if (!window.confirm(`${ami.nom}\n\n${t('amisRetirerQ')}`)) return;
    // On retire de l'affichage AVANT la reponse : attendre l'aller-retour
    // donnerait l'impression que le clic n'a rien fait.
    setAmis((prev) => prev.filter((a) => a.email !== ami.email));
    try {
      // MON document, et lui seul. L'ancienne version ecrivait aussi chez
      // l'autre — une ecriture que les regles ont TOUJOURS refusee (on ne retire
      // rien chez autrui), donc un echec silencieux a chaque retrait. Le serveur
      // exige maintenant la reciprocite : vider ma liste suffit a rompre le lien
      // des deux cotes.
      await setDoc(
        doc(firestore(), 'users', uid),
        { friends: arrayRemove(ami.email), friend_pending: arrayRemove(ami.email) },
        { merge: true },
      );
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
            onKeyDown={(e) => e.key === 'Enter' && inviter()}
            placeholder={t('amisChamp')}
            aria-label={t('amisChamp')}
          />
          <button className="btn btn-primary" onClick={inviter} disabled={!saisie.trim() || occupe}>
            {t('amisValider')}
          </button>
        </div>
        {message ? (
          <p className={message.ok ? 'me-note' : 'me-erreur'}>{message.texte}</p>
        ) : null}
        <p className="me-sous" style={{ marginTop: 8 }}>{t('amisDemandeSous')}</p>
      </section>

      {/* Les demandes RECUES passent avant : c'est ce qui attend une decision. */}
      {charge && recues.length > 0 ? (
        <section className="carte-amis">
          <h2 className="me-h2">{t('amisRecues')}</h2>
          <ul className="liste-amis">
            {recues.map((p) => (
              <li key={p.email} className="ligne-ami">
                <div className="ami-identite">
                  <strong>{p.nom}</strong>
                  <span className="me-sous">{p.email}</span>
                </div>
                <div className="ami-actions">
                  <button className="btn btn-primary" onClick={() => accepter(p)} disabled={occupe}>
                    {t('amisAccepter')}
                  </button>
                  <button className="btn btn-ghost" onClick={() => refuser(p)}>
                    {t('amisRefuser')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

      {charge && envoyees.length > 0 ? (
        <section className="carte-amis">
          <h2 className="me-h2">{t('amisEnvoyees')}</h2>
          <ul className="liste-amis">
            {envoyees.map((p) => (
              <li key={p.email} className="ligne-ami">
                <div className="ami-identite">
                  <strong>{p.nom}</strong>
                  <span className="me-sous">{t('amisAttente')}</span>
                </div>
                <button className="btn btn-ghost" onClick={() => annuler(p)}>
                  {t('amisAnnuler')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
