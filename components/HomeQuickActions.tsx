// Section "Lance-toi" en haut du Home : LES 5 actions clés à 1 tap (pattern leaders :
// le logging atteignable depuis la home), trilingue + theme-aware. Composant autonome.
import React, { useMemo } from 'react';
import { useTokens, type Tokens } from '../constants/tokens';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Bell, UtensilsCrossed, Dumbbell, Trophy, Newspaper, Sparkles } from 'lucide-react-native';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';


const TXT: any = {
  en: { title: 'Quick start', notif: 'Notifications', log: 'Log a meal', diary: 'Diary', workout: 'Workout', races: 'Virtual races', journal: 'Journal', coach: 'AI Coach', a11yOpen: 'Open' },
  fr: { title: 'Lance-toi', notif: 'Notifications', log: 'Logger un repas', diary: 'Journal repas', workout: 'Séance', races: 'Courses virtuelles', journal: 'Journal', coach: 'Coach IA', a11yOpen: 'Ouvrir' },
  ar: { title: 'انطلق', notif: 'الإشعارات', log: 'سجّل وجبة', diary: 'يوميات الطعام', workout: 'تمرين', races: 'سباقات افتراضية', journal: 'اليوميات', coach: 'مدرب AI', a11yOpen: 'فتح' },
};

export default function HomeQuickActions({ onLog }: { onLog?: () => void }) {
  const { resolved } = useTheme();
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  const { language } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  // Accent thémé : GREEN est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  // L'accent vient du theme, plus d'un couple clair/sombre fige.
  const accent = k.accent;
  const tok = useTokens();
  const card = tok.surface;
  const text = tok.text;
  const chipBg = k.accentSoft;

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
        <Bell size={16} color={accent} />
        <Text style={[styles.title, { color: text }]}>{t.title}</Text>
        <TouchableOpacity onPress={() => router.push('/notifications' as any)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.notif}>
          <Text style={[styles.link, { color: accent }]}>{t.notif}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {ACTIONS.map((a, i) => {
          const Icon = a.icon;
          return (
            <TouchableOpacity key={i} style={[styles.chip, { backgroundColor: chipBg }]} activeOpacity={0.85} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={`${t.a11yOpen} ${a.label}`}>
              <Icon size={18} color={accent} />
              <Text style={[styles.chipTxt, { color: text }]}>{a.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeStyles = (k: Tokens) => StyleSheet.create({
  // Rembourrages LOGIQUES (start/end) et non physiques (left/right) : sous la
  // racine `direction: rtl`, un `paddingLeft` reste à gauche et se retrouve donc
  // du mauvais côté en arabe. Constaté le 16 août 2026 sur R83L20HWJTE : le titre
  // collait au bord droit de la carte. Le couple start/end suit le sens de lecture
  // et laisse le carrousel déborder du bon côté dans les deux langues.
  card: { borderRadius: 18, paddingVertical: 14, paddingStart: 16, marginHorizontal: 16, marginVertical: 8,
    shadowColor: k.shadow, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  // `gap` : le titre porte `flex: 1` et son texte se cale sur le bord de fin de sa
  // boîte — en arabe il venait buter contre le lien, sans un espace entre les deux.
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingEnd: 16, gap: 8 },
  title: { fontSize: 15, fontWeight: '700', marginStart: 8, flex: 1 },
  link: { fontSize: 12, fontWeight: '700' },
  row: { gap: 10, paddingEnd: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  chipTxt: { fontSize: 13, fontWeight: '600' },
});
