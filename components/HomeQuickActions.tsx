// Section "Lance-toi" en haut du Home : LES 5 actions clés à 1 tap (pattern leaders :
// le logging atteignable depuis la home), trilingue + theme-aware. Composant autonome.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Bell, UtensilsCrossed, Dumbbell, Trophy, Newspaper, Sparkles } from 'lucide-react-native';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Quick start', notif: 'Notifications', log: 'Log a meal', diary: 'Diary', workout: 'Workout', races: 'Virtual races', journal: 'Journal', coach: 'AI Coach' },
  fr: { title: 'Lance-toi', notif: 'Notifications', log: 'Logger un repas', diary: 'Journal repas', workout: 'Séance', races: 'Courses virtuelles', journal: 'Journal', coach: 'Coach IA' },
  ar: { title: 'انطلق', notif: 'الإشعارات', log: 'سجّل وجبة', diary: 'يوميات الطعام', workout: 'تمرين', races: 'سباقات افتراضية', journal: 'اليوميات', coach: 'مدرب AI' },
};

export default function HomeQuickActions({ onLog }: { onLog?: () => void }) {
  const { resolved } = useTheme();
  const { language } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const chipBg = isDark ? '#243b2f' : '#EAF4EE';

  const ACTIONS = [
    { icon: UtensilsCrossed, label: t.log, onPress: () => (onLog ? onLog() : router.push('/scan-camera' as any)) },
    { icon: Newspaper, label: t.diary, onPress: () => router.push('/diary' as any) },
    { icon: Dumbbell, label: t.workout, onPress: () => router.push('/log-exercise' as any) },
    { icon: Trophy, label: t.races, onPress: () => router.push('/races' as any) },
    { icon: Newspaper, label: t.journal, onPress: () => router.push('/journal' as any) },
    { icon: Sparkles, label: t.coach, onPress: () => router.push('/ai-coach' as any) },
  ];

  return (
    <View style={[styles.card, { backgroundColor: card }]}>
      <View style={styles.header}>
        <Bell size={16} color={GREEN} />
        <Text style={[styles.title, { color: text }]}>{t.title}</Text>
        <TouchableOpacity onPress={() => router.push('/notifications' as any)} hitSlop={8}>
          <Text style={styles.link}>{t.notif}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {ACTIONS.map((a, i) => {
          const Icon = a.icon;
          return (
            <TouchableOpacity key={i} style={[styles.chip, { backgroundColor: chipBg }]} activeOpacity={0.85} onPress={a.onPress}>
              <Icon size={18} color={GREEN} />
              <Text style={[styles.chipTxt, { color: text }]}>{a.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, paddingVertical: 14, paddingLeft: 16, marginHorizontal: 16, marginVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingRight: 16 },
  title: { fontSize: 15, fontWeight: '700', marginLeft: 8, flex: 1 },
  link: { fontSize: 12, color: GREEN, fontWeight: '700' },
  row: { gap: 10, paddingRight: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  chipTxt: { fontSize: 13, fontWeight: '600' },
});
