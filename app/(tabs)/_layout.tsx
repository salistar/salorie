import { Tabs } from 'expo-router';
import { Home, User, BarChart3, Plus, Sparkles, Trophy } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { LoggingProvider, useLogging } from '../../lib/LoggingContext';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

function TabsContent() {
  const { showActionMenu } = useLogging();
  const { colors, resolved } = useTheme();
  const { t, language } = useTranslation() as any;
  const defisLabel = language === 'fr' ? 'Défis' : language === 'ar' ? 'تحديات' : 'Challenges';
  const isDark = resolved === 'dark';
  const tabBg = isDark ? '#161C23' : Colors.light.white; // theme-aware (plus de barre blanche en dark)

  return (
    <>
      <Tabs
        sceneContainerStyle={{ backgroundColor: 'transparent' }}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.gray[400],
          tabBarStyle: [styles.tabBar, { backgroundColor: tabBg }],
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
            tabBarIcon: ({ color }) => <Home size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="coach"
          options={{
            tabBarLabel: t('tabs.coach'),
            tabBarIcon: ({ color }) => <Sparkles size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="defis"
          options={{
            tabBarLabel: defisLabel,
            tabBarIcon: ({ color }) => <Trophy size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="analytics"
          options={{
            tabBarLabel: t('tabs.analytics'),
            tabBarIcon: ({ color }) => <BarChart3 size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            tabBarLabel: t('tabs.profile'),
            tabBarIcon: ({ color }) => <User size={22} color={color} />,
          }}
        />
      </Tabs>

      {/* Floating quick-add button (D6: labelled for accessibility) */}
      <TouchableOpacity
        style={styles.floatingButton}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Quick add"
        onPress={() => showActionMenu()}
      >
        <Plus size={32} color={Colors.light.white} strokeWidth={3} />
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
    bottom: 100,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.light.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: Colors.light.primary,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
});
