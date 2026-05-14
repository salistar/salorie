import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';

// Complete any pending auth session at module load
WebBrowser.maybeCompleteAuthSession();

/**
 * OAuth callback landing — shown briefly after Google/Clerk OAuth redirect
 * back to the app. Calls maybeCompleteAuthSession to finalize the browser
 * session. Falls back to manual redirect if Clerk doesn't pick up the
 * session within 10s (to avoid getting stuck on a spinner forever).
 */
export default function OAuthCallback() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    console.log('\x1b[33m[oauth-callback] MOUNT\x1b[0m', { time: new Date().toISOString() });
    Linking.getInitialURL().then((url) => {
      console.log('\x1b[33m[oauth-callback] Linking.getInitialURL\x1b[0m', { url });
    }).catch(() => {});

    const sub = Linking.addEventListener('url', (event) => {
      console.log('\x1b[36m[oauth-callback] Linking event\x1b[0m', { url: event.url });
    });

    WebBrowser.maybeCompleteAuthSession();

    // Si apres 10s on est toujours coince sur cet ecran, on propose le retour manuel
    const timeout = setTimeout(() => {
      console.warn('[oauth-callback] Timeout 10s — Clerk n\'a pas conclu la session');
      setShowRetry(true);
    }, 10_000);

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
      <ActivityIndicator size="large" color={Colors.light.primary} />
      <Text style={{ color: Colors.light.gray[600], fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
        Signing you in...
      </Text>
      {showRetry && (
        <View style={{ alignItems: 'center', gap: 12, marginTop: 24 }}>
          <Text style={{ color: Colors.light.gray[500], fontSize: 13, textAlign: 'center' }}>
            Connexion plus longue que prevu. Retour au sign-in ?
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/(auth)/sign-in' as any)}
            style={{
              backgroundColor: Colors.light.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retour</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
