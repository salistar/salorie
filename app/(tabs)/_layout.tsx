import { Tabs } from 'expo-router';
import { Home, User, BarChart3, Plus, Sparkles, Trophy } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { LoggingProvider, useLogging } from '../../lib/LoggingContext';
import { useTheme } from '../../lib/ThemeContext';
import { useTokens } from '../../constants/tokens';
import { useTranslation } from '../../lib/i18n';
import * as Haptics from 'expo-haptics';
import { useBasBarre, useBasBouton } from '../../lib/espaceBas';

function TabsContent() {
  const { showActionMenu } = useLogging();
  const { colors, resolved } = useTheme();
  const { t, language } = useTranslation() as any;
  const basBarre = useBasBarre();
  const basBouton = useBasBouton();
  const defisLabel = language === 'fr' ? 'Défis' : language === 'ar' ? 'تحديات' : 'Challenges';
  const isDark = resolved === 'dark';
  const k = useTokens();
  // La barre suit la palette : `surface` est la couleur d'une carte posee sur
  // le fond, ce qu'est exactement cette barre flottante. Le couple en dur
  // #161C23 / blanc ne bougeait pas d'un theme a l'autre.
  const tabBg = k.surface;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: k.accent,
          tabBarInactiveTintColor: k.textMuted,
          // La barre flotte en `position: absolute`, donc React Navigation ne lui
          // applique PAS son décalage de zone sûre : le `bottom: 24` en dur de la
          // feuille de style était tout ce qui la séparait du bas de l'écran.
          // Mesuré le 16 août 2026 sur R83L20HWJTE (uiautomator) : les libellés
          // occupent y 1473→1514 alors que la barre de navigation du système
          // commence à y 1492. Leur moitié basse passait donc DERRIÈRE elle. En
          // latin ça ne se voyait pas — les glyphes sont courts et tiennent en
          // haut de la boîte ; en arabe, plus haut, les mots étaient tranchés net.
          // `max` et non une somme : sur un téléphone à navigation gestuelle le
          // décalage est presque nul, et les 24 px d'origine restent le bon écart.
          tabBarStyle: [styles.tabBar, { backgroundColor: tabBg, bottom: basBarre }],
          tabBarShowLabel: true,
          tabBarLabelPosition: 'below-icon',
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '700',
            marginBottom: 6,
          },
          tabBarIconStyle: { marginTop: 6 },
          sceneStyle: { backgroundColor: 'transparent' },
        } as any}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarLabel: t('tabs.home'),
            tabBarAccessibilityLabel: t('tabs.home'),
            tabBarIcon: ({ color }) => <Home size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="coach"
          options={{
            tabBarLabel: t('tabs.coach'),
            tabBarAccessibilityLabel: t('tabs.coach'),
            tabBarIcon: ({ color }) => <Sparkles size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="defis"
          options={{
            tabBarLabel: defisLabel,
            tabBarAccessibilityLabel: defisLabel,
            tabBarIcon: ({ color }) => <Trophy size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="analytics"
          options={{
            tabBarLabel: t('tabs.analytics'),
            tabBarAccessibilityLabel: t('tabs.analytics'),
            tabBarIcon: ({ color }) => <BarChart3 size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            tabBarLabel: t('tabs.profile'),
            tabBarAccessibilityLabel: t('tabs.profile'),
            tabBarIcon: ({ color }) => <User size={22} color={color} />,
          }}
        />
      </Tabs>

      {/* Floating quick-add button (D6: labelled for accessibility) */}
      <TouchableOpacity
        // Le bouton portait l'accent EN DUR dans sa feuille de style : il
        // restait vert sur les six themes, au centre de l'ecran.
        style={[styles.floatingButton, { bottom: basBouton, backgroundColor: k.accent, shadowColor: k.accent }]}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Quick add"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          showActionMenu();
        }}
      >
        <Plus size={32} color={k.onAccent} strokeWidth={3} />
      </TouchableOpacity>
    </>
  );
}

export default function TabsLayout() {
  return <TabsContent />;
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    elevation: 4,
    borderRadius: 32,
    height: 78,
    borderTopWidth: 0,
    paddingBottom: 8,
    paddingTop: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  floatingButton: {
    position: 'absolute',
    bottom: 118,
    left: '50%',
    marginLeft: -32,
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
});
