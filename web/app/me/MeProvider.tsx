'use client';
// Portail de l'espace personnel /me.
// ---------------------------------------------------------------------------
// Trois etages, dans cet ordre :
//   1. ClerkProvider   — la MEME instance Clerk que l'app mobile ;
//   2. SignedOut/In    — l'ecran de connexion, ou la suite ;
//   3. PontFirebase    — echange du jeton, puis session Firestore ouverte.
//
// Tout est client : le serveur Next ne voit jamais ni le jeton, ni les donnees de
// sante. C'est le meme trajet que sur telephone, et c'est ce qui evite d'avoir a
// dupliquer la moindre regle de securite cote web.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignIn,
  useAuth,
  useUser,
} from '@clerk/clerk-react';
import { frFR, arSA } from '@clerk/localizations';
import { PUBLIC_CONFIG, espaceMePret, variablesManquantes, emailToDocId } from '../../lib/publicConfig';
import { connecterFirebase } from '../../lib/firebaseBridge';

type EtatMe = {
  /** Session Firebase ouverte : les lectures Firestore sont autorisees. */
  pret: boolean;
  /** Echec du pont — on l'affiche au lieu de laisser une page vide. */
  erreur: string | null;
  /** Identifiant du document Firestore = email en minuscules = uid Firebase. */
  uid: string;
  email: string;
  prenom: string;
};

const Contexte = createContext<EtatMe>({ pret: false, erreur: null, uid: '', email: '', prenom: '' });

/** Etat de la session personnelle. A n'appeler que sous <MeProvider>. */
export const useMe = () => useContext(Contexte);

function Chargement({ texte }: { texte: string }) {
  return (
    <div className="me-centre">
      <div className="me-spinner" aria-hidden />
      <p className="me-centre-txt">{texte}</p>
    </div>
  );
}

/** Etage 3 : ouvre la session Firebase a partir du jeton Clerk, puis sert les pages. */
function PontFirebase({ children }: { children: ReactNode }) {
  const { getToken, signOut } = useAuth();
  const { user, isLoaded } = useUser();
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const uid = emailToDocId(email);

  useEffect(() => {
    if (!isLoaded || !email) return;
    let vivant = true;
    (async () => {
      const ok = await connecterFirebase(() => getToken());
      if (!vivant) return;
      setPret(ok);
      if (!ok) setErreur("La session securisee n'a pas pu s'ouvrir. Reessaie dans un instant.");
    })();
    return () => {
      vivant = false;
    };
  }, [isLoaded, email, getToken]);

  if (!isLoaded) return <Chargement texte="Chargement de ton compte…" />;

  if (erreur) {
    return (
      <div className="me-centre">
        <p className="me-erreur">{erreur}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Reessayer
        </button>
        <button className="btn btn-ghost" onClick={() => signOut()}>
          Se deconnecter
        </button>
      </div>
    );
  }

  if (!pret) return <Chargement texte="Ouverture de ta session securisee…" />;

  return (
    <Contexte.Provider
      value={{ pret, erreur, uid, email, prenom: user?.firstName || '' }}
    >
      {children}
    </Contexte.Provider>
  );
}

/** Ecran de connexion : les memes fournisseurs que sur telephone (Google inclus). */
function Connexion() {
  return (
    <div className="me-auth">
      <div className="me-auth-mot">
        <div className="me-auth-marque">Salorie</div>
        <h1>Ton compte, sur grand écran.</h1>
        <p>
          Le même compte que sur téléphone. Ton journal, tes analyses et tes courses te
          suivent d’un appareil à l’autre, en direct.
        </p>
      </div>
      <div className="me-auth-form">
        {/* routing="hash" : la navigation interne de Clerk reste dans l'URL, sans
            dependre du routeur Next — l'espace /me est entierement client. */}
        <SignIn routing="hash" afterSignInUrl="/me" afterSignUpUrl="/me" />
      </div>
    </div>
  );
}

/**
 * Langue de l'écran de connexion.
 *
 * Avant la connexion, `users/{uid}.language` n'est pas lisible — on ne sait pas
 * encore qui arrive. La langue du navigateur est la seule information disponible,
 * et c'est aussi la plus probable : quelqu'un dont le système est en arabe ne
 * s'attend pas à un formulaire en anglais.
 */
function localisationClerk() {
  if (typeof navigator === 'undefined') return frFR;
  const l = String(navigator.language || '').slice(0, 2).toLowerCase();
  // `undefined` = anglais, la langue NATIVE du composant. Importer `enUS` pour
  // l'obtenir aurait ajouté une quarantaine de kilo-octets au chargement d'une
  // page de connexion, pour redire à Clerk ce qu'il sait déjà.
  if (l === 'en') return undefined;
  return l === 'ar' ? arSA : frFR;
}

export default function MeProvider({ children }: { children: ReactNode }) {
  // Mauvaise configuration de build : on le DIT, au lieu d'un ecran blanc que
  // personne ne sait diagnostiquer six mois plus tard.
  if (!espaceMePret()) {
    return (
      <div className="me-centre">
        <p className="me-erreur">Espace personnel non configure sur ce deploiement.</p>
        <p className="me-centre-txt">
          Variables absentes du build : {variablesManquantes().join(', ')}
        </p>
      </div>
    );
  }

  return (
    <ClerkProvider
      publishableKey={PUBLIC_CONFIG.clerkPublishableKey}
      afterSignOutUrl="/me"
      localization={localisationClerk()}
      // Le formulaire portait sa propre apparence, claire, au milieu d'une page
      // qui suit le thème du système : sur un écran en sombre, la carte blanche
      // tranchait comme un corps étranger. On lui passe la couleur de marque et on
      // le laisse s'accorder au reste.
      appearance={{ variables: { colorPrimary: '#2e8b57', borderRadius: '12px' } }}
    >
      <SignedOut>
        <Connexion />
      </SignedOut>
      <SignedIn>
        <PontFirebase>{children}</PontFirebase>
      </SignedIn>
    </ClerkProvider>
  );
}
