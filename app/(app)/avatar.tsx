// Avatar RPG évolutif — niveau, titre, barre d'XP vers le niveau suivant,
// et paliers/équipement débloqués. XP 100% locale (lib/avatar.ts).
import React, { useEffect, useState } from 'react';
import { useEspaceBasSimple } from '../../lib/espaceBas';
import { useTokens } from '../../constants/tokens';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { Sparkles, Lock, Check } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { getAvatar, TIERS, xpForLevel, AvatarState } from '../../lib/avatar';

const GREEN = '#2E8B57';

// Libellés d'écran (nouvelles chaînes => objet LOCAL trilingue, pas de clés i18n.tsx).
const TXT: any = {
  en: {
    title: 'My avatar', sub: 'Earn XP from your activity and level up your hero.',
    level: 'Level', xp: 'XP', to_next: 'XP to next level', maxed: 'Max tier reached — keep grinding!',
    unlocks: 'Tiers & gear', unlocked: 'Unlocked', locked: 'Reach level',
    tip: 'Tip: log meals, water and workouts to gain XP automatically.',
  },
  fr: {
    title: 'Mon avatar', sub: "Gagne de l'XP grâce à ton activité et fais évoluer ton héros.",
    level: 'Niveau', xp: 'XP', to_next: 'XP avant le niveau suivant', maxed: 'Palier max atteint — continue !',
    unlocks: 'Paliers & équipement', unlocked: 'Débloqué', locked: 'Niveau requis',
    tip: 'Astuce : logge repas, eau et séances pour gagner de l\'XP automatiquement.',
  },
  ar: {
    title: 'بطلي', sub: 'اكسب نقاط الخبرة من نشاطك وارتقِ ببطلك.',
    level: 'المستوى', xp: 'نقاط', to_next: 'نقاط للمستوى التالي', maxed: 'وصلت لأعلى رتبة — واصل!',
    unlocks: 'الرتب والمعدات', unlocked: 'مفتوح', locked: 'تتطلب المستوى',
    tip: 'نصيحة: سجّل وجباتك ومياهك وتمارينك لتكسب النقاط تلقائيًا.',
  },
};

// Titres de palier (trilingue) — alignés sur TIERS[].titleKey de lib/avatar.ts.
const TITLES: any = {
  en: { rookie: 'Rookie', walker: 'Walker', runner: 'Runner', athlete: 'Athlete', warrior: 'Warrior', champion: 'Champion', legend: 'Legend' },
  fr: { rookie: 'Débutant', walker: 'Marcheur', runner: 'Coureur', athlete: 'Athlète', warrior: 'Guerrier', champion: 'Champion', legend: 'Légende' },
  ar: { rookie: 'مبتدئ', walker: 'ماشٍ', runner: 'عدّاء', athlete: 'رياضي', warrior: 'محارب', champion: 'بطل', legend: 'أسطورة' },
};

// Équipement débloqué (trilingue + emoji) — alignés sur TIERS[].gearKey.
const GEAR: any = {
  en: { sneakers: 'Sneakers', water_bottle: 'Water bottle', headband: 'Headband', smartwatch: 'Smartwatch', medal_bronze: 'Bronze medal', medal_silver: 'Silver medal', crown: 'Crown' },
  fr: { sneakers: 'Baskets', water_bottle: 'Gourde', headband: 'Bandeau', smartwatch: 'Montre connectée', medal_bronze: 'Médaille de bronze', medal_silver: 'Médaille d\'argent', crown: 'Couronne' },
  ar: { sneakers: 'حذاء رياضي', water_bottle: 'قارورة ماء', headband: 'عصابة رأس', smartwatch: 'ساعة ذكية', medal_bronze: 'ميدالية برونزية', medal_silver: 'ميدالية فضية', crown: 'تاج' },
};
const GEAR_EMOJI: Record<string, string> = {
  sneakers: '👟', water_bottle: '🥤', headband: '🎽', smartwatch: '⌚', medal_bronze: '🥉', medal_silver: '🥈', crown: '👑',
};

export default function AvatarScreen() {
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const titleMap = TITLES[language] || TITLES.en;
  const gearMap = GEAR[language] || GEAR.en;
  const { resolved } = useTheme();
  const espaceBas = useEspaceBasSimple();
  const isDark = resolved === 'dark';
  // Accent thémé : GREEN est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  const accent = isDark ? '#4ade80' : GREEN;

  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const track = tok.border;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };
  const rowDir: any = { flexDirection: isRTL ? 'row-reverse' : 'row' };

  const [loading, setLoading] = useState(true);
  const [av, setAv] = useState<AvatarState | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setAv(await getAvatar());
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} title={t.title} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: espaceBas }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.head, rowDir]}>
          <Sparkles size={24} color={accent} />
          <Text style={[styles.title, { color: text }]}>{t.title}</Text>
        </View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        {loading || !av ? (
          <ActivityIndicator color={accent} style={{ marginTop: 48 }} />
        ) : (
          <>
            {/* Cercle de niveau coloré */}
            <View style={[styles.heroCard, { backgroundColor: card }]}>
              <View style={[styles.ring, { borderColor: av.color, backgroundColor: av.color + (isDark ? '22' : '14') }]}>
                <Text style={[styles.ringLevelLabel, { color: sub }]}>{t.level}</Text>
                <Text style={[styles.ringLevel, { color: av.color }]}>{av.level}</Text>
              </View>
              <View style={[styles.gearBadge, { backgroundColor: av.color }]}>
                <Text style={styles.gearBadgeEmoji}>{GEAR_EMOJI[av.gear] || '⭐'}</Text>
              </View>
              <Text style={[styles.heroTitle, { color: text }]}>{titleMap[av.title] || av.title}</Text>
              <Text style={[styles.heroXp, { color: sub }]}>{av.xp} {t.xp}</Text>

              {/* Barre d'XP vers le niveau suivant */}
              <View style={[styles.barTrack, { backgroundColor: track }]}>
                <View style={[styles.barFill, { width: `${Math.round(av.progress * 100)}%`, backgroundColor: av.color }]} />
              </View>
              <Text style={[styles.barCaption, { color: sub }]}>
                {av.xpToNext > 0
                  ? `${av.xpToNext} ${t.to_next}`
                  : t.maxed}
              </Text>
            </View>

            {/* Paliers / équipement débloqués */}
            <Text style={[styles.sectionTitle, { color: text }, align]}>{t.unlocks}</Text>
            {TIERS.map((tier) => {
              const reached = av.level >= tier.minLevel;
              return (
                <View key={tier.titleKey} style={[styles.tierRow, rowDir, { backgroundColor: card, opacity: reached ? 1 : 0.6 }]}>
                  <View style={[styles.tierIcon, { backgroundColor: tier.color + (isDark ? '26' : '15') }]}>
                    <Text style={styles.tierEmoji}>{GEAR_EMOJI[tier.gearKey] || '⭐'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tierTitle, { color: text }, align]}>{titleMap[tier.titleKey] || tier.titleKey}</Text>
                    <Text style={[styles.tierGear, { color: sub }, align]}>{gearMap[tier.gearKey] || tier.gearKey}</Text>
                  </View>
                  {reached ? (
                    <View style={[styles.statusPill, { backgroundColor: accent + '1A' }]}>
                      <Check size={13} color={accent} />
                      <Text style={[styles.statusText, { color: accent }]}>{t.unlocked}</Text>
                    </View>
                  ) : (
                    <View style={[styles.statusPill, { backgroundColor: track }]}>
                      <Lock size={13} color={sub} />
                      <Text style={[styles.statusText, { color: sub }]}>{t.locked} {tier.minLevel} ({xpForLevel(tier.minLevel)} {t.xp})</Text>
                    </View>
                  )}
                </View>
              );
            })}

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

  heroCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  ring: {
    width: 130, height: 130, borderRadius: 65, borderWidth: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  ringLevelLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  ringLevel: { fontSize: 52, fontWeight: '900', lineHeight: 56, letterSpacing: -1 },
  gearBadge: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    marginTop: -22, borderWidth: 3, borderColor: '#fff',
  },
  gearBadgeEmoji: { fontSize: 20 },
  heroTitle: { fontSize: 22, fontWeight: '900', marginTop: 10, letterSpacing: -0.5 },
  heroXp: { fontSize: 14, fontWeight: '700', marginTop: 2, marginBottom: 18 },

  barTrack: { width: '100%', height: 12, borderRadius: 6, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  barCaption: { fontSize: 13, fontWeight: '600', marginTop: 10, textAlign: 'center' },

  sectionTitle: { fontSize: 16, fontWeight: '900', marginBottom: 12, letterSpacing: -0.3 },
  tierRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff',
    borderRadius: 16, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  tierIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  tierEmoji: { fontSize: 22 },
  tierTitle: { fontSize: 15, fontWeight: '800' },
  tierGear: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '800' },

  tip: { fontSize: 13, color: '#94A3B8', marginTop: 16, textAlign: 'center', lineHeight: 18 },
});
