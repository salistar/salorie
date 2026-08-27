'use client';

// « Continuer avec Google » pour le back-office.
// ---------------------------------------------------------------------------
// Le back-office a sa PROPRE session (cookie `salorie_admin`, signe par
// AUTH_SECRET) : Clerk ne la remplace pas, il sert seulement a prouver l'identite.
// Le chemin complet :
//
//   Clerk (Google)  ->  jeton personnalise Firebase  ->  /api/auth/google
//                                                        qui verifie et pose le cookie
//
// Pourquoi passer par Firebase plutot que verifier Clerk cote serveur : le web
// n'embarque que `@clerk/clerk-react` (client). Ajouter `@clerk/nextjs` pour
// verifier un jeton serveur alourdirait un bundle deja mesure a 1 728 Ko sur
// /me. Le pont Clerk -> Firebase existait deja pour l'espace membre, et
// `firebase-admin` verifie la signature nativement cote serveur.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClerkProvider, SignedIn, SignedOut, useSignIn, useAuth,
} from '@clerk/clerk-react';
import { PUBLIC_CONFIG } from '../../lib/publicConfig';
import { connecterFirebase, jetonApi } from '../../lib/firebaseBridge';

function BoutonGoogle({ onErreur }: { onErreur: (m: string) => void }) {
  const { isLoaded, signIn } = useSignIn();
  const [enCours, setEnCours] = useState(false);

  async function lancer() {
    if (!isLoaded || !signIn) return;
    setEnCours(true);
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        // On revient sur /login : c'est le bloc <SignedIn> ci-dessous qui prend
        // le relais, echange l'identite contre le cookie admin, puis redirige.
        redirectUrl: '/login',
        redirectUrlComplete: '/login',
      });
    } catch (e: any) {
      setEnCours(false);
      onErreur(e?.errors?.[0]?.message || 'Connexion Google impossible');
    }
  }

  return (
    <button
      type="button"
      onClick={lancer}
      disabled={!isLoaded || enCours}
      className="btn btn-lg"
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, background: '#fff', color: '#1f2937', border: '1px solid #d1d5db',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 6.9-10 6.9-17.3z" />
        <path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.8-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.4 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
      </svg>
      {enCours ? 'Redirection…' : 'Continuer avec Google'}
    </button>
  );
}

/** Une fois Clerk connecte : on echange l'identite contre le cookie admin. */
function Echange({ onErreur }: { onErreur: (m: string) => void }) {
  const { getToken, signOut } = useAuth();
  const router = useRouter();
  const [etat, setEtat] = useState('Vérification du compte…');

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const pont = await connecterFirebase(() => getToken());
        if (!pont) throw new Error('Le pont Firebase a échoué');
        const jeton = await jetonApi();
        if (!jeton) throw new Error('Jeton d\'identité indisponible');

        const r = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jeton }),
        });
        const data = await r.json().catch(() => ({}));
        if (!vivant) return;

        if (!r.ok) {
          // ⚠ On DECONNECTE Clerk en cas de refus. Sans cela, la personne reste
          // authentifiee cote Clerk sur /login : le composant retenterait
          // l'echange en boucle a chaque affichage, et le bouton Google ne
          // reapparaitrait jamais pour essayer un autre compte.
          onErreur(data?.error || 'Connexion refusée');
          await signOut().catch(() => {});
          return;
        }
        router.replace('/admin');
      } catch (e: any) {
        if (!vivant) return;
        onErreur(e?.message || 'Connexion impossible');
        await signOut().catch(() => {});
      }
    })();
    return () => { vivant = false; };
  }, [getToken, router, signOut, onErreur]);

  return <p style={{ textAlign: 'center', opacity: 0.75, margin: '10px 0' }}>{etat}</p>;
}

/**
 * Ferme la session Clerk apres une deconnexion du back-office.
 *
 * ⚠ SANS CE COMPOSANT, CHANGER DE COMPTE EST IMPOSSIBLE. Effacer le cookie
 * admin ne touche pas a Clerk : en revenant sur /login, `<SignedIn>` etait
 * encore vrai, l'echange se rejouait tout seul, et on se retrouvait reconnecte
 * au MEME compte sans jamais voir le bouton. Constate le 27/08/2026.
 */
function Fermeture() {
  const { signOut } = useAuth();
  const [etat, setEtat] = useState('Fermeture de la session…');
  useEffect(() => {
    (async () => {
      try {
        await signOut();
        // Le parametre est retire de l'URL : sans cela, un rechargement
        // relancerait une deconnexion alors qu'on vient de se reconnecter.
        window.history.replaceState({}, '', '/login');
      } catch {
        setEtat('La session n\'a pas pu être fermée — rechargez la page.');
      }
    })();
  }, [signOut]);
  return <p style={{ textAlign: 'center', opacity: 0.75, margin: '10px 0' }}>{etat}</p>;
}

export default function ConnexionGoogle() {
  const [err, setErr] = useState('');
  // Lu depuis `window` et NON via `useSearchParams()` : ce hook impose une
  // frontiere <Suspense> en App Router, sans quoi le build echoue.
  //
  // ⚠ INITIALISEUR PARESSEUX, PAS UN useEffect. Avec un effet, `deconnexion`
  // vaudrait `false` au premier rendu : `<Echange>` partirait AVANT que l'effet
  // ne le corrige, et reconnecterait au compte qu'on vient de quitter. Le
  // parametre doit etre connu des le rendu initial.
  const [deconnexion] = useState(
    () => typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('deconnexion') === '1',
  );

  // Sans cle publiable, Clerk leve au montage et emporterait TOUTE la page de
  // connexion — y compris le formulaire e-mail qui, lui, fonctionne. On
  // n'affiche simplement rien.
  if (!PUBLIC_CONFIG.clerkPublishableKey) return null;

  return (
    <ClerkProvider publishableKey={PUBLIC_CONFIG.clerkPublishableKey} afterSignOutUrl="/login">
      <div style={{ marginBottom: 18 }}>
        <SignedOut>
          <BoutonGoogle onErreur={setErr} />
        </SignedOut>
        <SignedIn>
          {/* On sort de Clerk AVANT de proposer quoi que ce soit : c'est la
              seule facon d'offrir le choix d'un autre compte Google. */}
          {deconnexion ? <Fermeture /> : <Echange onErreur={setErr} />}
        </SignedIn>

        {!!err && (
          <p style={{ color: '#e11d48', fontSize: 13, fontWeight: 600, marginTop: 10, textAlign: 'center' }}>
            {err}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 4px', opacity: 0.55 }}>
          <span style={{ flex: 1, height: 1, background: 'currentColor' }} />
          <span style={{ fontSize: 12 }}>ou</span>
          <span style={{ flex: 1, height: 1, background: 'currentColor' }} />
        </div>
      </div>
    </ClerkProvider>
  );
}
