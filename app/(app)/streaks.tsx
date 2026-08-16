// Streaks multi-dimensions — séries de jours consécutifs par catégorie.
import React, { useEffect, useState } from 'react';
import { useEspaceBasSimple } from '../../lib/espaceBas';
import { useTokens } from '../../constants/tokens';
import { Image, View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Flame, Utensils, Droplets, Activity } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { db, emailToDocId } from '../../lib/firebase';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { SkeletonCard, Skeleton } from '../../components/ui';
import { useScreenGate } from '../../components/FeatureGate';
import { streakOf } from '../../lib/streaks';
import { ymd } from '../../lib/format';

const GREEN = '#2E8B57';
// fmt (ymd) + streakOf sont partagés depuis lib/format + lib/streaks (dédup — #38).
const fmt = ymd;

const TXT: any = {
  en: { title: 'Your streaks', sub: 'Consecutive days you stayed consistent, by category.', days: 'days', day: 'day', meals: 'Meals logged', hydration: 'Hydration', activity: 'Activity', tip: 'Tip: log every day to keep your flames 🔥 burning.', protected: 'Protected', freezeExplain: '🛡️ Smart streak: 1 freeze a week covers a missed day, so a single slip won\'t reset you.' },
  fr: { title: 'Tes séries', sub: 'Jours consécutifs où tu as été régulier, par catégorie.', days: 'jours', day: 'jour', meals: 'Repas loggés', hydration: 'Hydratation', activity: 'Activité', tip: 'Astuce : logge chaque jour pour garder tes flammes 🔥 allumées.', protected: 'Protégée', freezeExplain: '🛡️ Série intelligente : 1 gel par semaine couvre un jour manqué — un simple oubli ne remet pas ta série à zéro.' },
  ar: { title: 'سلاسلك', sub: 'أيام متتالية حافظت فيها على الانتظام، حسب الفئة.', days: 'أيام', day: 'يوم', meals: 'وجبات مسجلة', hydration: 'الترطيب', activity: 'النشاط', tip: 'نصيحة: سجّل كل يوم لتُبقي شعلتك 🔥 مشتعلة.', protected: 'محمية', freezeExplain: '🛡️ سلسلة ذكية: تجميدة واحدة أسبوعيًا تغطّي يومًا فائتًا — نسيان بسيط لن يصفّر سلسلتك.' },
};

export default function StreaksScreen() {
  const __gate = useScreenGate('streaks');
  const { user } = useUser();
  const espaceBas = useEspaceBasSimple();
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

  type Cat = { streak: number; freezes: number };
  const [loading, setLoading] = useState(true);
  const [st, setSt] = useState<{ meal: Cat; water: Cat; activity: Cat }>({ meal: { streak: 0, freezes: 0 }, water: { streak: 0, freezes: 0 }, activity: { streak: 0, freezes: 0 } });

  useEffect(() => {
    (async () => {
      try {
        const email = user?.primaryEmailAddress?.emailAddress;
        const docId = email ? emailToDocId(email) : null;
        if (!docId) return;
        const since = fmt(new Date(Date.now() - 70 * 86400000));
        const snap = await getDocs(query(collection(db, 'users', docId, 'logs'), where('date', '>=', since)));
        const byType: Record<string, Set<string>> = { meal: new Set(), water: new Set(), activity: new Set() };
        snap.forEach((d) => { const x: any = d.data(); if (byType[x.type] && x.date) byType[x.type].add(x.date); });
        setSt({ meal: streakOf(byType.meal), water: streakOf(byType.water), activity: streakOf(byType.activity) });
        // (streakOf renvoie desormais { streak, freezes } — gel intelligent)
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const Card = ({ icon: Icon, label, value, color, freezes }: any) => (
    <View style={[styles.card, { backgroundColor: card }]}>
      <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}><Icon size={26} color={color} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardValue, { color: text }]}>{value} <Text style={[styles.cardUnit, { color: sub }]}>{value > 1 ? t.days : t.day}</Text></Text>
        <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, isRTL && { flexDirection: 'row-reverse' }]}>
          <Text style={[styles.cardLabel, { color: sub }]}>{label}</Text>
          {freezes > 0 ? (
            <View style={styles.shield}><Text style={styles.shieldTxt}>🛡️ {t.protected}{freezes > 1 ? ` ×${freezes}` : ''}</Text></View>
          ) : null}
        </View>
      </View>
      <Flame size={22} color={value > 0 ? '#F59E0B' : '#CBD5E1'} />
    </View>
  );

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: espaceBas }]}>
        <Image source={require('../../assets/images/illustrations/measure.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={styles.head}><Flame size={24} color="#F59E0B" /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>
        {loading ? (
          <View style={{ marginTop: 8 }}>
            <SkeletonCard height={96} />
            <SkeletonCard height={96} />
            <SkeletonCard height={96} />
            <Skeleton width="70%" height={14} style={{ marginTop: 14, alignSelf: 'center' }} />
          </View>
        ) : (
          <>
            <Card icon={Utensils} label={t.meals} value={st.meal.streak} freezes={st.meal.freezes} color={accent} />
            <Card icon={Droplets} label={t.hydration} value={st.water.streak} freezes={st.water.freezes} color="#0EA5E9" />
            <Card icon={Activity} label={t.activity} value={st.activity.streak} freezes={st.activity.freezes} color="#8B5CF6" />
            <View style={[styles.freezeBox, { backgroundColor: isDark ? '#0b3b2e' : '#ECFDF5', borderColor: isDark ? '#155e4a' : '#A7F3D0' }]}>
              <Text style={[styles.freezeTxt, { color: isDark ? '#6ee7b7' : '#047857' }, align]}>{t.freezeExplain}</Text>
            </View>
            <Text style={[styles.tip, { color: sub }]}>{t.tip}</Text>
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
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 22 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 18, padding: 18, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  iconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  cardValue: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  cardUnit: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  cardLabel: { fontSize: 13, color: '#64748B', marginTop: 2 },
  shield: { backgroundColor: 'rgba(16,185,129,0.14)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginTop: 2 },
  shieldTxt: { fontSize: 11, fontWeight: '800', color: '#10B981' },
  freezeBox: { borderRadius: 14, borderWidth: 1, padding: 13, marginTop: 8 },
  freezeTxt: { fontSize: 12.5, fontWeight: '600', lineHeight: 18 },
  tip: { fontSize: 13, color: '#94A3B8', marginTop: 14, textAlign: 'center', lineHeight: 18 },
});
