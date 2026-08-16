// Flux Google SSO Clerk — FIX du bug récurrent « connexion Google bloquée en release ».
//
// CONTRAINTES ÉTABLIES (2026-07-05, testé LIVE) :
//  1. Clerk n'autorise QUE le redirect à SCHÉMA custom (`salorie://oauth-callback`) pour le SSO
//     natif. L'HTTPS App Link donne « Redirect url mismatch » → on NE peut PAS l'utiliser ici.
//  2. Samsung Internet ne restitue PAS le redirect schéma depuis ses CUSTOM TABS → boucle.
//     Le seul chemin FIABLE (confirmé) = Custom Tab CHROME (Chrome rend le redirect schéma OK).
//
// BUG HISTORIQUE de la détection Chrome : on ne regardait que `browserPackages`, or le champ des
// navigateurs supportant le SERVICE Custom Tabs est `servicePackages` → Chrome n'était pas
// détecté → repli Samsung → régression. On checke maintenant TOUS les champs.
//
// On ne patche PAS node_modules (écrasé au reinstall) — la logique vit ici.
import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import * as Network from 'expo-network';

export type GoogleSSOParams = { redirectUrl?: string; unsafeMetadata?: Record<string, unknown> };

// Redirect = SCHÉMA custom (le seul autorisé par Clerk pour le SSO natif).
export const OAUTH_REDIRECT = 'salorie://oauth-callback';

export function useGoogleSSO() {
  const { signIn, setActive, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, isLoaded: isSignUpLoaded } = useSignUp();

  async function startGoogleSSO(params: GoogleSSOParams = {}) {
    if (!isSignInLoaded || !isSignUpLoaded || !signIn || !signUp) {
      return { createdSessionId: null, pending: false, signIn, signUp, setActive } as any;
    }
    const redirectUrl = params.redirectUrl ?? OAUTH_REDIRECT;

    await signIn.create({ strategy: 'oauth_google', redirectUrl });
    const { externalVerificationRedirectURL } = signIn.firstFactorVerification;
    if (!externalVerificationRedirectURL) {
      // SANS RESEAU, on arrive EXACTEMENT ici : `signIn.create` n'aboutit pas et
      // laisse la verification vide. Le message d'origine — repris du SDK Clerk —
      // parlait alors de « redirect URL » manquante, ce qui envoie chercher un
      // probleme de configuration la ou il n'y a qu'une 4G coupee. Constate le
      // 16/08/2026 : plusieurs heures perdues sur cette fausse piste, avant de
      // decouvrir que le telephone n'avait plus d'acces internet.
      let horsLigne = false;
      try {
        const etat = await Network.getNetworkStateAsync();
        horsLigne = !etat.isConnected || etat.isInternetReachable === false;
      } catch {
        // L'API elle-meme indisponible : on ne conclut rien, message d'origine.
      }
      if (horsLigne) {
        // Marque pour que les ecrans ne remontent PAS ca dans Sentry : une panne
        // de reseau chez l'utilisateur n'est pas un defaut de l'application (et
        // l'evenement ne partirait de toute facon pas).
        const e: any = new Error('Pas de connexion internet. Verifie ton reseau, puis reessaie.');
        e.horsLigne = true;
        throw e;
      }
      throw new Error('Missing external verification redirect URL for SSO flow');
    }

    // Forcer Chrome pour l'onglet OAuth (fix Samsung). On checke TOUS les champs — le bug
    // précédent ne regardait que `browserPackages` ; `servicePackages` = navigateurs Custom-Tabs.
    let browserPackage: string | undefined;
    try {
      const tabs: any = await WebBrowser.getCustomTabsSupportingBrowsersAsync();
      const all: string[] = [
        ...(tabs?.servicePackages || []),
        ...(tabs?.browserPackages || []),
        tabs?.defaultBrowserPackage,
        tabs?.preferredBrowserPackage,
      ].filter(Boolean);
      if (all.indexOf('com.android.chrome') !== -1) browserPackage = 'com.android.chrome';
    } catch {}

    const authSessionResult = await WebBrowser.openAuthSessionAsync(
      externalVerificationRedirectURL.toString(),
      redirectUrl,
      browserPackage ? { browserPackage } : undefined,
    );

    if (authSessionResult.type !== 'success' || !(authSessionResult as any).url) {
      return { createdSessionId: null, setActive, signIn, signUp, authSessionResult } as any;
    }

    const sp = new URL((authSessionResult as any).url).searchParams;
    const rotatingTokenNonce = sp.get('rotating_token_nonce') ?? '';
    await signIn.reload({ rotatingTokenNonce });

    // Compte Google inconnu côté Clerk → transfert vers un sign-up (identique au SDK).
    if (signIn.firstFactorVerification.status === 'transferable') {
      await signUp.create({ transfer: true, unsafeMetadata: params.unsafeMetadata });
    }

    return {
      createdSessionId: signUp.createdSessionId ?? signIn.createdSessionId,
      setActive,
      signIn,
      signUp,
      authSessionResult,
    } as any;
  }

  return { startGoogleSSO };
}
