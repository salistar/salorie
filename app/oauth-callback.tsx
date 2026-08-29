import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAuth, useSignIn, useSignUp } from '@clerk/clerk-expo';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../lib/ThemeContext';
import { useTokens, Tokens } from '../constants/tokens';

// Complete any pending auth session at module load
WebBrowser.maybeCompleteAuthSession();

// App Links (fix OAuth définitif) : quand l'OS ouvre l'app DIRECTEMENT via le redirect
// HTTPS vérifié (au lieu de revenir dans openAuthSessionAsync), c'est ICI que la session
// doit être finalisée à partir du `rotating_token_nonce` de l'URL entrante.
function nonceFromUrl(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).searchParams.get('rotating_token_nonce'); }
  catch { const m = url.match(/[?&]rotating_token_nonce=([^&]+)/); return m ? decodeURIComponent(m[1]) : null; }
}

/**
 * OAuth callback landing — shown briefly after Google/Clerk OAuth redirect
 * back to the app. Calls maybeCompleteAuthSession to finalize the browser
 * session. Falls back to manual redirect if Clerk doesn't pick up the
 * session within 10s (to avoid getting stuck on a spinner forever).
 */
export default function OAuthCallback() {
  // Écran de transition : sur fond sombre, gray[600] tombait à ~2,4:1 de contraste.
  const { resolved } = useTheme();
  const k = useTokens();
  const isDark = resolved === 'dark';
  const { isSignedIn, isLoaded } = useAuth();
  const { signIn, setActive } = useSignIn();
  const { signUp } = useSignUp();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [showRetry, setShowRetry] = useState(false);

  // Source de nonce la PLUS fiable quand l'App Link ouvre l'app : les params de route
  // Expo Router (l'URL entrante https://app.salorie.com/oauth-callback?rotating_token_nonce=…).
  useEffect(() => {
    const n = params?.rotating_token_nonce;
    if (typeof n === 'string' && n) completeFromUrl(`x://x?rotating_token_nonce=${n}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.rotating_token_nonce]);

  // Finalise la session depuis le `rotating_token_nonce` de l'URL entrante (chemin App Link
  // deep-link — c'est ICI que la connexion Google se conclut, cf lib/googleSSO.ts).
  // Gère aussi le TRANSFERT vers un sign-up si le compte Google est inconnu de Clerk.
  async function completeFromUrl(url: string | null) {
    const nonce = nonceFromUrl(url);
    if (!nonce || !signIn || !setActive) return;
    try {
      await signIn.reload({ rotatingTokenNonce: nonce } as any);
      // Compte Google inconnu côté Clerk → transfert vers un sign-up (identique au SDK).
      if ((signIn as any).firstFactorVerification?.status === 'transferable' && signUp) {
        await signUp.create({ transfer: true } as any);
        const su = (signUp as any).createdSessionId;
        if (su) { await setActive({ session: su }); return; }
      }
      const sid = (signIn as any).createdSessionId;
      if (sid) { await setActive({ session: sid }); return; }
    } catch (e) { console.warn('[oauth-callback] completeFromUrl KO', e); }
    // Finalisation échouée (nonce invalide / session absente) → retour AUTO au sign-in
    // (fini le spinner bloqué). L'écran sign-in rebondit vers /(tabs) si déjà connecté.
    setTimeout(() => router.replace('/(auth)/sign-in' as any), 900);
  }

  useEffect(() => {
    console.log('\x1b[33m[oauth-callback] MOUNT\x1b[0m', { time: new Date().toISOString() });
    Linking.getInitialURL().then((url) => {
      console.log('\x1b[33m[oauth-callback] Linking.getInitialURL\x1b[0m', { url });
      completeFromUrl(url);
    }).catch(() => {});

    const sub = Linking.addEventListener('url', (event) => {
      console.log('\x1b[36m[oauth-callback] Linking event\x1b[0m', { url: event.url });
      completeFromUrl(event.url);
    });

    WebBrowser.maybeCompleteAuthSession();

    // Filet : si après 8s la session n'est pas conclue, RETOUR AUTOMATIQUE au sign-in
    // (au lieu de laisser le spinner + bouton). Si l'utilisateur est connecté entre-temps,
    // l'autre effet redirige vers /(tabs) et ce timeout est nettoyé.
    const timeout = setTimeout(() => {
      console.warn('[oauth-callback] Timeout 8s — retour auto au sign-in');
      setShowRetry(true);
      router.replace('/(auth)/sign-in' as any);
    }, 8_000);

    return () => {
      sub.remove();
      clearTimeout(timeout);
    };
  }, []);

  // Quand Clerk confirme la connexion, _layout.tsx redirige automatiquement vers /(tabs)
  // ou /(onboarding). Si on est encore ici alors qu'on est signedIn, on force.
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      console.log('\x1b[34m[oauth-callback] Clerk isSignedIn=true → router.replace(/(tabs))\x1b[0m');
      router.replace('/(tabs)' as any);
    }
  }, [isLoaded, isSignedIn]);

  return (
    <View style={{
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'transparent',
      gap: 16,
      padding: 24,
    }}>
      <ActivityIndicator size="large" color={k.accent} />
      <Text style={{ color: k.textMuted, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
        Signing you in...
      </Text>
      {showRetry && (
        <View style={{ alignItems: 'center', gap: 12, marginTop: 24 }}>
          <Text style={{ color: k.textMuted, fontSize: 13, textAlign: 'center' }}>
            Connexion plus longue que prevu. Retour au sign-in ?
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/(auth)/sign-in' as any)}
            style={{
              backgroundColor: k.accent,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: k.onAccent, fontWeight: '700' }}>Retour</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
