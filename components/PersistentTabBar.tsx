// Barre de navigation persistante pour les écrans du groupe (app)/ (écrans poussés).
// Rendue par app/(app)/_layout.tsx. PAS de usePathname (évite la boucle de re-render
// au niveau routeur) : 4 boutons qui ramènent aux onglets principaux.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Keyboard } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Home, Sparkles, BarChart3, User, Trophy } from 'lucide-react-native';

const GREY = '#94A3B8';

const TABS = [
  { key: 'home', label: 'Home', icon: Home, route: '/(tabs)' },
  { key: 'coach', label: 'Coach', icon: Sparkles, route: '/(tabs)/coach' },
  { key: 'defis', label: 'Défis', icon: Trophy, route: '/(tabs)/defis' },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, route: '/(tabs)/analytics' },
  { key: 'profile', label: 'Profile', icon: User, route: '/(tabs)/profile' },
];

export default function PersistentTabBar() {
  // Masque la barre quand le clavier est ouvert (sinon elle flotte au-dessus).
  const [kbOpen, setKbOpen] = useState(false);
  const { isSignedIn } = useAuth();
  useEffect(() => {
    const s = Keyboard.addListener('keyboardDidShow', () => setKbOpen(true));
    const h = Keyboard.addListener('keyboardDidHide', () => setKbOpen(false));
    return () => { s.remove(); h.remove(); };
  }, []);
  if (kbOpen) return null;
  // Pas connecté (welcome…) → pas de barre d'onglets (elle mènerait à des écrans qui exigent une session).
  if (!isSignedIn) return null;

  return (
    <View style={styles.bar} pointerEvents="box-none">
      <View style={styles.inner}>
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <TouchableOpacity key={t.key} style={styles.item} activeOpacity={0.7}
              onPress={() => { try { router.navigate(t.route as any); } catch { router.replace(t.route as any); } }}>
              <Icon size={22} color={GREY} />
              <Text style={styles.label}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 26 : 12 },
  inner: {
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
