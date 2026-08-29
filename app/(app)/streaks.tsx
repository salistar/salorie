// Streaks multi-dimensions — séries de jours consécutifs par catégorie.
import React, { useEffect, useState, useMemo } from 'react';
import { useTokens, type Tokens , CATEGORIES } from '../../constants/tokens';
import {
  Image,
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Flame, Utensils, Droplets, Activity } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import LancerDefi from '../../components/LancerDefi';
import { db, emailToDocId } from '../../lib/firebase';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { SkeletonCard, Skeleton } from '../../components/ui';
import { useScreenGate } from '../../components/FeatureGate';
import { streakOf } from '../../lib/streaks';
import { ymd } from '../../lib/format';

// fmt (ymd) + streakOf sont partagés depuis lib/format + lib/streaks (dédup — #38).
const fmt = ymd;

const TXT: any = {
  en: { title: 'Your streaks', sub: 'Consecutive days you stayed consistent, by category.', days: 'days', day: 'day', meals: 'Meals logged', hydration: 'Hydration', activity: 'Activity', defiQuoi: (n: number) => `hold a ${n}-day streak`, tip: 'Tip: log every day to keep your flames 🔥 burning.', protected: 'Protected', freezeExplain: '🛡️ Smart streak: 1 freeze a week covers a missed day, so a single slip won\'t reset you.' },
  fr: { title: 'Tes séries', sub: 'Jours consécutifs où tu as été régulier, par catégorie.', days: 'jours', day: 'jour', meals: 'Repas loggés', hydration: 'Hydratation', activity: 'Activité', defiQuoi: (n: number) => `tenir une série de ${n} jours`, tip: 'Astuce : logge chaque jour pour garder tes flammes 🔥 allumées.', protected: 'Protégée', freezeExplain: '🛡️ Série intelligente : 1 gel par semaine couvre un jour manqué — un simple oubli ne remet pas ta série à zéro.' },
  ar: { title: 'سلاسلك', sub: 'أيام متتالية حافظت فيها على الانتظام، حسب الفئة.', days: 'أيام', day: 'يوم', meals: 'وجبات مسجلة', hydration: 'الترطيب', activity: 'النشاط', defiQuoi: (n: number) => `الحفاظ على سلسلة ${n} أيام`, tip: 'نصيحة: سجّل كل يوم لتُبقي شعلتك 🔥 مشتعلة.', protected: 'محمية', freezeExplain: '🛡️ سلسلة ذكية: تجميدة واحدة أسبوعيًا تغطّي يومًا فائتًا — نسيان بسيط لن يصفّر سلسلتك.' },
};

export default function StreaksScreen() {
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  const __gate = useScreenGate('streaks');
  const { user } = useUser();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  // Le PRENOM seul, jamais l'e-mail : ce texte part dans la conversation de
  // quelqu'un d'autre. Sans prenom renseigne, on reste anonyme plutot que de
  // laisser fuir l'identifiant du compte.
  const prenom = String(user?.firstName || '').trim() || (language === 'ar' ? 'صديقك' : language === 'fr' ? 'Un ami' : 'A friend');
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  // Accent thémé : k.accent est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  // L'accent vient du theme : le couple clair/sombre fige
  // n'ouvrait que deux des six palettes.
  const accent = k.accent;
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
      <Flame size={22} color={value > 0 ? k.warning : k.textFaint} />
    </View>
  );

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <Image source={require('../../assets/images/abstraits/hero-progression.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={styles.head}><Flame size={24} color={k.warning} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
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
            <Card icon={Droplets} label={t.hydration} value={st.water.streak} freezes={st.water.freezes} color={k.info} />
            <Card icon={Activity} label={t.activity} value={st.activity.streak} freezes={st.activity.freezes} color={CATEGORIES.musculation} />
            <View style={[styles.freezeBox, { backgroundColor: k.surface, borderColor: k.border }]}>
              <Text style={[styles.freezeTxt, { color: k.textMuted }, align]}>{t.freezeExplain}</Text>
            </View>
            <Text style={[styles.tip, { color: sub }]}>{t.tip}</Text>
            {/* La serie est le declencheur d orgueil le plus fort de l app : c est
                ici qu on a envie de dire « tiens le meme rythme que moi ». On defie
                sur la plus longue des trois, celle dont on est le plus fier. */}
            <LancerDefi
              auteur={prenom}
              quoi={t.defiQuoi(Math.max(st.meal.streak, st.water.streak, st.activity.streak))}
              chemin="defi/serie"
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeStyles = (k: Tokens) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: k.surfaceSunken },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: k.text, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: k.textMuted, lineHeight: 20, marginBottom: 22 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: k.surface, borderRadius: 18, padding: 18, marginBottom: 12, shadowColor: k.shadow, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  iconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  cardValue: { fontSize: 24, fontWeight: '900', color: k.text },
  cardUnit: { fontSize: 14, fontWeight: '600', color: k.textFaint },
  cardLabel: { fontSize: 13, color: k.textMuted, marginTop: 2 },
  shield: { backgroundColor: 'rgba(16,185,129,0.14)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginTop: 2 },
  shieldTxt: { fontSize: 11, fontWeight: '800', color: k.success },
  freezeBox: { borderRadius: 14, borderWidth: 1, padding: 13, marginTop: 8 },
  freezeTxt: { fontSize: 12.5, fontWeight: '600', lineHeight: 18 },
  tip: { fontSize: 13, color: k.textFaint, marginTop: 14, textAlign: 'center', lineHeight: 18 },
});
