// Barre de navigation persistante affichée sur TOUS les écrans hors-tabs (les ~40
// écrans poussés). Les écrans du groupe (tabs) gardent leur barre native — on se
// cache là (+ onboarding/auth). Rendu une seule fois au niveau racine (_layout).
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Home, Sparkles, BarChart3, User } from 'lucide-react-native';

const GREEN = '#2E8B57';
const GREY = '#94A3B8';

const TABS = [
  { key: 'home', label: 'Home', icon: Home, route: '/(tabs)' },
  { key: 'coach', label: 'Coach', icon: Sparkles, route: '/(tabs)/coach' },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, route: '/(tabs)/analytics' },
  { key: 'profile', label: 'Profile', icon: User, route: '/(tabs)/profile' },
];

// Routes où la barre NE doit PAS s'afficher (les tabs ont déjà la barre native).
const HIDE_ON = ['/', '/coach', '/analytics', '/profile'];

export default function PersistentTabBar() {
  const path = usePathname() || '/';
  const hidden =
    HIDE_ON.includes(path) ||
    path.includes('onboarding') ||
    path.includes('oauth') ||
    path.includes('not-found');
  if (hidden) return null;

  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const Icon = t.icon;
        return (
          <TouchableOpacity key={t.key} style={styles.item} activeOpacity={0.7}
            onPress={() => { try { router.navigate(t.route as any); } catch { router.push(t.route as any); } }}>
            <Icon size={22} color={GREY} />
            <Text style={styles.label}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12, right: 12, bottom: Platform.OS === 'ios' ? 28 : 14,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10, color: GREY, fontWeight: '600' },
});
