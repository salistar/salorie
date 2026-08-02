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
