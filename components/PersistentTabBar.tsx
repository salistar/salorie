// Barre de navigation persistante pour les écrans du groupe (app)/ (écrans poussés).
// Rendue par app/(app)/_layout.tsx. PAS de usePathname (évite la boucle de re-render
// au niveau routeur) : 4 boutons qui ramènent aux onglets principaux.
import React, { useEffect, useState } from 'react';
import { useTokens } from '../constants/tokens';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Keyboard } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Home, Sparkles, BarChart3, User, Trophy } from 'lucide-react-native';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * La barre est-elle rendue ?
 *
 * Cette question a DEUX clients : la barre elle-meme, et `app/(app)/_layout.tsx`
 * qui lui reserve sa place. Les deux repondaient separement — et avaient diverge :
 * la barre se retirait quand personne n'etait connecte (`welcome`), mais la place
 * restait reservee. Resultat, ~129 dp de vide au bas de l'ecran d'accueil, assez
 * pour couper le troisieme argument de vente. Vu a l'ecran le 20 aout 2026.
 *
 * Le clavier ne compte PAS ici : la barre s'efface pendant la saisie, mais liberer
 * sa place au meme instant ferait sauter toute la mise en page sous les doigts.
 */
export function useBarreVisible(): boolean {
  const { isSignedIn } = useAuth();
  return Boolean(isSignedIn);
}

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
  const { resolved } = useTheme();
  const { t, language } = useTranslation() as any;
  const insets = useSafeAreaInsets();
  const isDark = resolved === 'dark';
  const tok = useTokens();
  const barBg = tok.surface;
  const defisLabel = language === 'fr' ? 'Défis' : language === 'ar' ? 'تحديات' : 'Challenges';
  useEffect(() => {
    const s = Keyboard.addListener('keyboardDidShow', () => setKbOpen(true));
    const h = Keyboard.addListener('keyboardDidHide', () => setKbOpen(false));
    return () => { s.remove(); h.remove(); };
  }, []);
  if (kbOpen) return null;
  // Pas connecté (welcome…) → pas de barre d'onglets (elle mènerait à des écrans
  // qui exigent une session). Même condition que `useBarreVisible`, qui pilote
  // la place réservée par le layout — les deux ne peuvent plus diverger.
  if (!isSignedIn) return null;

  // Les traductions viennent des clés `tabs.*`, celles-là même qu'emploie la barre
  // d'onglets principale. Elles étaient recopiées ici, et les deux copies avaient
  // divergé : le même onglet s'appelait « Analyses » sur un écran poussé et
  // « Statistiques » sur l'écran d'accueil — « التحليلات » contre « الإحصائيات »
  // en arabe. Vu à l'écran le 16 août 2026. Deux noms pour une seule destination.
  // `defis` n'a pas de clé : il garde son libellé calculé plus haut.
  const labelFor = (key: string, fallback: string) => {
    if (key === 'defis') return defisLabel;
    const cle = 'tabs.' + key;
    const trad = t(cle);
    // `t` rend LA CLÉ quand la traduction manque, jamais une valeur vide : sans ce
    // test, un onglet ajouté sans clé afficherait « tabs.machin » à l'écran.
    return trad === cle ? fallback : trad;
  };

  // Le décalage de zone sûre vient du système, pas d'une constante : sur un
  // téléphone à trois boutons, `paddingBottom: 12` laissait cette barre
  // entièrement derrière la navigation d'Android. Même faute que la barre
  // d'onglets, mesurée le 16 août 2026 sur R83L20HWJTE à l'uiautomator.
  const basSur = Math.max(Platform.OS === 'ios' ? 26 : 12, insets.bottom + 10);

  return (
    <View style={[styles.bar, { paddingBottom: basSur }]} pointerEvents="box-none">
      <View style={[styles.inner, { backgroundColor: barBg }]}>
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <TouchableOpacity key={t.key} style={styles.item} activeOpacity={0.7}
              onPress={() => { try { router.navigate(t.route as any); } catch { router.replace(t.route as any); } }}>
              <Icon size={22} color={GREY} />
              <Text style={styles.label} numberOfLines={1}>{labelFor(t.key, t.label)}</Text>
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
