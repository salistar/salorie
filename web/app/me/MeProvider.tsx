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
import { assurerProfilPublic } from '../../lib/profilPublic';
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
      // Rendre ce compte trouvable comme ami. Sans ca, quelqu'un qui n'utilise
      // que le web reste introuvable et son ami lit « aucun compte Salorie avec
      // cette adresse » - un message faux et incomprehensible.
      if (ok) void assurerProfilPublic(uid, user?.fullName || user?.firstName || '');
      if (!ok) setErreur("La session securisee n'a pas pu s'ouvrir. Reessaie dans un instant.");
    })();
    return () => {
      vivant = false;
    };
  }, [isLoaded, email, getToken, uid, user?.fullName, user?.firstName]);

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

// L'ancienne accroche DECRIVAIT le produit — « ton compte sur grand ecran », « le
// meme compte que sur telephone ». C'est vrai, et ca ne donne envie a personne.
// Celle-ci vend ce que Salorie fait de mieux et que ses concurrents ne font pas :
// reconnaitre la cuisine d'ici. Yazio et MyFitnessPal ne savent pas ce qu'est une
// rfissa ; c'est LA raison de choisir Salorie, elle doit etre la premiere chose
// qu'on lit.
const ACCROCHE: Record<string, { titre: string; sous: string; preuves: string[] }> = {
  fr: {
    titre: 'Enfin une app qui connaît ta cuisine.',
    sous: 'Photographie ton assiette. On reconnaît le plat, on compte pour toi.',
    preuves: ['653 plats marocains', 'Halal vérifié au scan', 'Mode Ramadan'],
  },
  en: {
    titre: 'At last, an app that knows your kitchen.',
    sous: 'Snap your plate. We recognise the dish and do the counting.',
    preuves: ['653 Moroccan dishes', 'Halal checked on scan', 'Ramadan mode'],
  },
  ar: {
    titre: 'أخيرًا تطبيق يعرف مطبخك.',
    sous: 'صوّر طبقك. نتعرّف على الأكلة ونحسب بدلًا عنك.',
    preuves: ['653 طبقًا مغربيًا', 'التحقق من الحلال عند المسح', 'وضع رمضان'],
  },
};

/** Ecran de connexion : les memes fournisseurs que sur telephone (Google inclus). */
function Connexion() {
  const langue =
    typeof navigator !== 'undefined'
      ? String(navigator.language || '').slice(0, 2).toLowerCase()
      : 'fr';
  const a = ACCROCHE[langue] || ACCROCHE.fr;
  const rtl = langue === 'ar';
  return (
    <div className="me-auth">
      <div className="me-auth-mot" dir={rtl ? 'rtl' : 'ltr'}>
        <div className="me-auth-marque">Salorie</div>
        <h1>{a.titre}</h1>
        <p>{a.sous}</p>
        {/* Trois preuves courtes plutot qu'un paragraphe : sur un ecran de
            connexion, personne ne lit une phrase de plus. */}
        <ul className="me-auth-preuves">
          {a.preuves.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
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
  const l =
    typeof navigator === 'undefined'
      ? 'fr'
      : String(navigator.language || '').slice(0, 2).toLowerCase();
  // `undefined` = anglais, la langue NATIVE du composant. Importer `enUS` pour
  // l'obtenir aurait ajouté une quarantaine de kilo-octets au chargement d'une
  // page de connexion, pour redire à Clerk ce qu'il sait déjà.
  const base: any = l === 'en' ? {} : l === 'ar' ? arSA : frFR;

  // Le formulaire affichait « pour continuer vers salorie », en minuscule : Clerk
  // reprend tel quel le nom de l'application, saisi ainsi dans son tableau de bord.
  // On le corrige ICI plutôt que là-bas — une chaîne visible par tous les
  // utilisateurs ne doit pas dépendre d'un champ qu'on ne relit jamais, et cette
  // surcharge vit avec le code qui l'affiche.
  const sousTitre: Record<string, string> = {
    fr: 'pour continuer vers Salorie',
    en: 'to continue to Salorie',
    ar: 'للمتابعة إلى Salorie',
  };
  const st = sousTitre[l] || sousTitre.fr;
  return {
    ...base,
    signIn: { ...(base.signIn || {}), start: { ...((base.signIn || {}).start || {}), subtitle: st } },
    signUp: { ...(base.signUp || {}), start: { ...((base.signUp || {}).start || {}), subtitle: st } },
  };
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
      appearance={{
        variables: { colorPrimary: '#2e8b57', borderRadius: '12px' },
        // Le formulaire n'affichait AUCUN logo — `logo_image_url` est vide côté
        // Clerk. La marque disparaissait donc au moment précis où l'on demande à
        // quelqu'un de confier son compte.
        layout: { logoImageUrl: '/me/logo.png', logoPlacement: 'inside' },
        elements: { logoImage: { height: '38px' } },
      }}
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
