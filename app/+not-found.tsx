import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';

/**
 * Custom 404 — instead of showing "Unmatched Route", just redirect to root.
 * _layout.tsx will then send the user to the correct screen based on auth state.
 */
export default function NotFound() {
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
      backgroundColor: Colors.light.white,
    }}>
      <ActivityIndicator size="large" color={Colors.light.primary} />
    </View>
  );
}
