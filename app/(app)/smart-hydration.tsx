// Hydratation intelligente — objectif d'eau calculé selon le poids + l'activité.
import React, { useEffect, useState } from 'react';
import { useTokens } from '../../constants/tokens';
import { Image, View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Droplets, Activity, Sun } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import PhotoStrip from '../../components/PhotoStrip';
import { getUserFromFirestore } from '../../lib/firebase';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { useScreenGate } from '../../components/FeatureGate';
import { useFeature } from '../../lib/FlagsContext';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Smart hydration', sub: 'Water goal tailored to your weight and activity.', hero: 'Recommended goal', glasses: 'glasses', act_label: 'Activity level', sedentary: 'Sedentary', moderate: 'Moderate', intense: 'Intense', hot: 'Hot weather / heavy sweating', calc: 'Calculation', act: 'activity', heat: 'heat' },
  fr: { title: 'Hydratation intelligente', sub: "Objectif d'eau adapté à ton poids et ton activité.", hero: 'Objectif recommandé', glasses: 'verres', act_label: "Niveau d'activité", sedentary: 'Sédentaire', moderate: 'Modéré', intense: 'Intense', hot: 'Temps chaud / forte transpiration', calc: 'Calcul', act: 'activité', heat: 'chaleur' },
  ar: { title: 'ترطيب ذكي', sub: 'هدف ماء مناسب لوزنك ونشاطك.', hero: 'الهدف الموصى به', glasses: 'أكواب', act_label: 'مستوى النشاط', sedentary: 'خامل', moderate: 'معتدل', intense: 'مكثّف', hot: 'طقس حار / تعرّق شديد', calc: 'الحساب', act: 'نشاط', heat: 'حرارة' },
};

export default function SmartHydrationScreen() {
  const __gate = useScreenGate('smart-hydration');
  // Seuils paramétrables sans redéploiement (admin web → flag « smart-hydration » → params JSON).
  // Défauts = valeurs actuelles → aucun changement de comportement tant que rien n'est réglé.
  const { config: hydrCfg } = useFeature('smart-hydration');
  const mlPerKg = Number(hydrCfg?.mlPerKg) > 0 ? Number(hydrCfg.mlPerKg) : 35;
  const mlPerGlass = Number(hydrCfg?.mlPerGlass) > 0 ? Number(hydrCfg.mlPerGlass) : 250;
  const { user } = useUser();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  // Accent thémé : GREEN est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  const accent = isDark ? '#4ade80' : GREEN;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const [weight, setWeight] = useState(70);
  const [activity, setActivity] = useState(1); // 0=sédentaire,1=modéré,2=intense
  const [hot, setHot] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const email = user?.primaryEmailAddress?.emailAddress;
        if (email) { const p: any = await getUserFromFirestore(email, user?.id); setWeight(Number(p?.weight) || 70); }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const base = Math.round(weight * mlPerKg); // défaut ~35 ml/kg (paramétrable via flag)
  const actBonus = activity === 2 ? 700 : activity === 1 ? 350 : 0;
  const hotBonus = hot ? 500 : 0;
  const goal = base + actBonus + hotBonus;
  const glasses = Math.round(goal / mlPerGlass);

  const ActLvl = ({ i, label }: any) => (
    <TouchableOpacity style={[styles.opt, { backgroundColor: card }, activity === i && styles.optActive]} onPress={() => setActivity(i)}>
      <Text style={[styles.optTxt, { color: sub }, activity === i && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <Image source={require('../../assets/images/illustrations/weightlifting.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={styles.head}><Droplets size={24} color="#0EA5E9" /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <PhotoStrip category="health" />
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        {loading ? <ActivityIndicator color={accent} style={{ marginTop: 40 }} /> : (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>{t.hero}</Text>
              <Text style={styles.heroValue}>{(goal / 1000).toFixed(1)}<Text style={styles.heroUnit}> L</Text></Text>
              <Text style={styles.heroNote}>≈ {glasses} {t.glasses} · {goal} ml</Text>
            </View>

            <Text style={[styles.label, { color: sub }, align]}><Activity size={13} color={sub} /> {t.act_label}</Text>
            <View style={styles.optRow}><ActLvl i={0} label={t.sedentary} /><ActLvl i={1} label={t.moderate} /><ActLvl i={2} label={t.intense} /></View>

            <TouchableOpacity style={[styles.hotRow, { backgroundColor: card }, hot && styles.hotActive]} onPress={() => setHot((h) => !h)}>
              <Sun size={20} color={hot ? '#fff' : '#F59E0B'} />
              <Text style={[styles.hotTxt, { color: text }, hot && { color: '#fff' }]}>{t.hot}</Text>
              <Text style={[styles.hotTxt, { color: text }, hot && { color: '#fff' }]}>{hot ? '✓' : ''}</Text>
            </TouchableOpacity>

            <Text style={[styles.calc, { color: sub }, align]}>{t.calc} : {weight} kg × 35 ml = {base} ml{actBonus ? ` + ${actBonus} (${t.act})` : ''}{hotBonus ? ` + ${hotBonus} (${t.heat})` : ''}.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 23, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  hero: { backgroundColor: '#0EA5E9', borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 20 },
  heroLabel: { color: '#E0F2FE', fontSize: 13, fontWeight: '600' },
  heroValue: { color: '#fff', fontSize: 48, fontWeight: '900', letterSpacing: -2, marginTop: 4 },
  heroUnit: { fontSize: 20, fontWeight: '700' },
  heroNote: { color: '#E0F2FE', fontSize: 14, fontWeight: '600', marginTop: 2 },
  label: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  optRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  opt: { flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  optActive: { backgroundColor: GREEN },
  optTxt: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  hotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16 },
  hotActive: { backgroundColor: '#F59E0B' },
  hotTxt: { fontSize: 14, fontWeight: '600', color: '#0F172A', flex: 1 },
  calc: { fontSize: 13, color: '#94A3B8', lineHeight: 19 },
});
