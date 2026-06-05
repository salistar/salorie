import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, ChevronDown, Dumbbell, Clock, BarChart3, Flame } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';

type Plan = {
  emoji: string; color: string; title: string; level: string; duration: string; focus: string;
  exercises: { name: string; detail: string }[];
};

const TXT: Record<string, { title: string; sub: string; cta: string; exercises: string }> = {
  en: { title: 'Workout plans', sub: 'Ready-made programs — pick one and start training.', cta: 'Log a workout', exercises: 'Exercises' },
  fr: { title: 'Plans sportifs', sub: 'Des programmes prêts à l\'emploi — choisis et commence à t\'entraîner.', cta: 'Enregistrer une séance', exercises: 'Exercices' },
  ar: { title: 'برامج رياضية', sub: 'برامج جاهزة — اختر وابدأ التمرين.', cta: 'تسجيل تمرين', exercises: 'التمارين' },
};

const PLANS: Record<string, Plan[]> = {
  en: [
    { emoji: '💪', color: '#298f50', title: 'Full Body', level: 'Beginner', duration: '40 min', focus: 'Whole body', exercises: [
      { name: 'Squat', detail: '3 × 10' }, { name: 'Bench Press', detail: '3 × 10' }, { name: 'Dumbbell Row', detail: '3 × 12' }, { name: 'Shoulder Press', detail: '3 × 10' }, { name: 'Plank', detail: '3 × 30s' } ] },
    { emoji: '🏋️', color: '#2563eb', title: 'Push / Pull / Legs', level: 'Intermediate', duration: '55 min', focus: 'Strength split', exercises: [
      { name: 'Bench Press', detail: '4 × 8' }, { name: 'Lat Pulldown', detail: '4 × 10' }, { name: 'Deadlift', detail: '3 × 6' }, { name: 'Lunges', detail: '3 × 12' }, { name: 'Lateral Raise', detail: '3 × 15' } ] },
    { emoji: '🔥', color: '#f59e0b', title: 'HIIT Cardio', level: 'All levels', duration: '25 min', focus: 'Fat burn', exercises: [
      { name: 'Running', detail: '5 min' }, { name: 'Cycling', detail: '8 min' }, { name: 'HIIT intervals', detail: '6 × 1 min' }, { name: 'Walking (cooldown)', detail: '5 min' } ] },
    { emoji: '⚡', color: '#7c3aed', title: 'Muscle Gain', level: 'Advanced', duration: '60 min', focus: 'Hypertrophy', exercises: [
      { name: 'Deadlift', detail: '4 × 6' }, { name: 'Squat', detail: '4 × 8' }, { name: 'Bench Press', detail: '4 × 8' }, { name: 'Pull-up', detail: '4 × max' }, { name: 'Barbell Row', detail: '4 × 10' } ] },
  ],
  fr: [
    { emoji: '💪', color: '#298f50', title: 'Full Body', level: 'Débutant', duration: '40 min', focus: 'Corps entier', exercises: [
      { name: 'Squat', detail: '3 × 10' }, { name: 'Développé couché', detail: '3 × 10' }, { name: 'Rowing haltère', detail: '3 × 12' }, { name: 'Développé épaules', detail: '3 × 10' }, { name: 'Gainage', detail: '3 × 30s' } ] },
    { emoji: '🏋️', color: '#2563eb', title: 'Push / Pull / Legs', level: 'Intermédiaire', duration: '55 min', focus: 'Split force', exercises: [
      { name: 'Développé couché', detail: '4 × 8' }, { name: 'Tirage vertical', detail: '4 × 10' }, { name: 'Soulevé de terre', detail: '3 × 6' }, { name: 'Fentes', detail: '3 × 12' }, { name: 'Élévations latérales', detail: '3 × 15' } ] },
    { emoji: '🔥', color: '#f59e0b', title: 'HIIT Cardio', level: 'Tous niveaux', duration: '25 min', focus: 'Brûle-graisse', exercises: [
      { name: 'Course', detail: '5 min' }, { name: 'Vélo', detail: '8 min' }, { name: 'Intervalles HIIT', detail: '6 × 1 min' }, { name: 'Marche (retour au calme)', detail: '5 min' } ] },
    { emoji: '⚡', color: '#7c3aed', title: 'Prise de muscle', level: 'Avancé', duration: '60 min', focus: 'Hypertrophie', exercises: [
      { name: 'Soulevé de terre', detail: '4 × 6' }, { name: 'Squat', detail: '4 × 8' }, { name: 'Développé couché', detail: '4 × 8' }, { name: 'Tractions', detail: '4 × max' }, { name: 'Rowing barre', detail: '4 × 10' } ] },
  ],
  ar: [
    { emoji: '💪', color: '#298f50', title: 'الجسم كامل', level: 'مبتدئ', duration: '40 د', focus: 'الجسم بالكامل', exercises: [
      { name: 'سكوات', detail: '3 × 10' }, { name: 'بنش برس', detail: '3 × 10' }, { name: 'تجديف دمبل', detail: '3 × 12' }, { name: 'ضغط الأكتاف', detail: '3 × 10' }, { name: 'بلانك', detail: '3 × 30ث' } ] },
    { emoji: '🏋️', color: '#2563eb', title: 'دفع / سحب / أرجل', level: 'متوسط', duration: '55 د', focus: 'تقسيم القوة', exercises: [
      { name: 'بنش برس', detail: '4 × 8' }, { name: 'سحب علوي', detail: '4 × 10' }, { name: 'رفعة ميتة', detail: '3 × 6' }, { name: 'لانجز', detail: '3 × 12' }, { name: 'رفرفة جانبية', detail: '3 × 15' } ] },
    { emoji: '🔥', color: '#f59e0b', title: 'كارديو HIIT', level: 'كل المستويات', duration: '25 د', focus: 'حرق الدهون', exercises: [
      { name: 'جري', detail: '5 د' }, { name: 'دراجة', detail: '8 د' }, { name: 'فترات HIIT', detail: '6 × دقيقة' }, { name: 'مشي (تهدئة)', detail: '5 د' } ] },
    { emoji: '⚡', color: '#7c3aed', title: 'بناء العضلات', level: 'متقدم', duration: '60 د', focus: 'تضخيم', exercises: [
      { name: 'رفعة ميتة', detail: '4 × 6' }, { name: 'سكوات', detail: '4 × 8' }, { name: 'بنش برس', detail: '4 × 8' }, { name: 'عقلة', detail: '4 × أقصى' }, { name: 'تجديف بار', detail: '4 × 10' } ] },
  ],
};

export default function WorkoutPlansScreen() {
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const t = TXT[language] || TXT.en;
  const plans = PLANS[language] || PLANS.en;
  const [open, setOpen] = useState<number | null>(0);

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#000' : 'transparent';
  const row = (rev = false): any => ({ flexDirection: isRTL ? (rev ? 'row' : 'row-reverse') : (rev ? 'row-reverse' : 'row') });
  const ta: any = { textAlign: isRTL ? 'right' : 'left' };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.topRow, row()]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={22} color={text} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
          </TouchableOpacity>
        </View>

        <View style={[styles.titleRow, row()]}>
          <Dumbbell size={26} color={Colors.light.primary} />
          <Text style={[styles.title, { color: text }, ta]}>{t.title}</Text>
        </View>
        <Text style={[styles.subtitle, { color: sub }, ta]}>{t.sub}</Text>

        {plans.map((p, i) => {
          const isOpen = open === i;
          return (
            <View key={i} style={[styles.planCard, { backgroundColor: card, borderColor: isOpen ? p.color : 'transparent' }]}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setOpen(isOpen ? null : i)} style={[styles.planHead, row()]}>
                <View style={[styles.emojiWrap, { backgroundColor: p.color + '1A' }]}><Text style={styles.emoji}>{p.emoji}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.planTitle, { color: text }, ta]}>{p.title}</Text>
                  <View style={[styles.metaRow, row()]}>
                    <View style={[styles.metaItem, row()]}><BarChart3 size={13} color={sub} /><Text style={[styles.metaTxt, { color: sub }]}>{p.level}</Text></View>
                    <View style={[styles.metaItem, row()]}><Clock size={13} color={sub} /><Text style={[styles.metaTxt, { color: sub }]}>{p.duration}</Text></View>
                    <View style={[styles.metaItem, row()]}><Flame size={13} color={sub} /><Text style={[styles.metaTxt, { color: sub }]}>{p.focus}</Text></View>
                  </View>
                </View>
                <ChevronDown size={22} color={sub} style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
              </TouchableOpacity>

              {isOpen && (
                <View style={styles.exList}>
                  <Text style={[styles.exHeader, { color: sub }, ta]}>{t.exercises}</Text>
                  {p.exercises.map((ex, j) => (
                    <View key={j} style={[styles.exRow, row(), { borderTopColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
                      <View style={[styles.exDot, { backgroundColor: p.color }]} />
                      <Text style={[styles.exName, { color: text }, ta]}>{ex.name}</Text>
                      <Text style={[styles.exDetail, { color: p.color }]}>{ex.detail}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <TouchableOpacity style={styles.cta} onPress={() => router.push('/log-exercise' as any)}>
          <Dumbbell size={18} color="#fff" />
          <Text style={styles.ctaTxt}>{t.cta}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  topRow: { alignItems: 'center', marginTop: 4 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.gray[50] },
  titleRow: { alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 14, marginTop: 8, marginBottom: 18, lineHeight: 20 },
  planCard: { borderRadius: 22, marginBottom: 14, borderWidth: 2, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  planHead: { alignItems: 'center', gap: 14, padding: 16 },
  emojiWrap: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 26 },
  planTitle: { fontSize: 17, fontWeight: '800' },
  metaRow: { alignItems: 'center', gap: 14, marginTop: 5, flexWrap: 'wrap' },
  metaItem: { alignItems: 'center', gap: 4 },
  metaTxt: { fontSize: 12, fontWeight: '600' },
  exList: { paddingHorizontal: 16, paddingBottom: 14 },
  exHeader: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  exRow: { alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1 },
  exDot: { width: 7, height: 7, borderRadius: 4 },
  exName: { flex: 1, fontSize: 15, fontWeight: '600' },
  exDetail: { fontSize: 14, fontWeight: '800' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.light.primary, paddingVertical: 16, borderRadius: 16, marginTop: 10, shadowColor: Colors.light.primary, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  ctaTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
