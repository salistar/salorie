import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTokens, Tokens } from '../constants/tokens';

/**
 * Custom 404 — instead of showing "Unmatched Route", just redirect to root.
 * _layout.tsx will then send the user to the correct screen based on auth state.
 */
export default function NotFound() {
  const k = useTokens();
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/' as any);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      // transparent : le layout racine peint déjà le fond. Un blanc en dur
      // provoquait un flash clair de 100 ms en mode sombre avant la redirection.
      backgroundColor: 'transparent',
    }}>
      <ActivityIndicator size="large" color={k.accent} />
    </View>
  );
}
