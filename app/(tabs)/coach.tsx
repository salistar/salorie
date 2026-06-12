import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, TouchableOpacity, Modal, Pressable, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import { Flame, TrendingDown, TrendingUp, Minus, Lightbulb, Sparkles, ChefHat, ChevronRight, Apple, Trophy, HeartPulse, Lock, CheckCircle2, X, Dumbbell, MapPin, ScanText, Timer, Wallet, Refrigerator, Replace, Ruler, Moon, Smile, Droplets, BookmarkPlus, Award, ShoppingCart, Link2, UtensilsCrossed, Receipt, FileText, Swords, Droplet, Activity, PersonStanding, Mic, Search, UtensilsCrossed as EatIcon, BarChart3, History } from 'lucide-react-native';

// Sections par INTENTION utilisateur (4 au lieu de 8) + recherche + récents :
// l'utilisateur ne voit que 6 tuiles par section (divulgation progressive).
const SEC_TXT: any = {
  en: { eat: 'Eat', move: 'Move', track: 'Track me', ai: 'AI Coach & more', search: 'Search a tool…', recents: 'Recents', seeAll: 'See all', less: 'Show less' },
  fr: { eat: 'Manger', move: 'Bouger', track: 'Me suivre', ai: 'Coach IA & plus', search: 'Chercher un outil…', recents: 'Récents', seeAll: 'Voir tout', less: 'Réduire' },
  ar: { eat: 'الأكل', move: 'الحركة', track: 'متابعتي', ai: 'مدرب AI والمزيد', search: 'ابحث عن أداة…', recents: 'الأخيرة', seeAll: 'عرض الكل', less: 'تقليص' },
};
import { useFeatureFlags, isEnabled } from '../../lib/featureFlags';

const PLANS_CTA: Record<string, { t: string; s: string }> = {
  en: { t: 'Workout plans', s: 'Ready-made training programs' },
  fr: { t: 'Plans sportifs', s: "Des programmes d'entraînement prêts à l'emploi" },
  ar: { t: 'برامج رياضية', s: 'برامج تدريب جاهزة' },
};
const RUN_CTA: Record<string, { t: string; s: string }> = {
  en: { t: 'Solo run (GPS)', s: 'Track distance, pace & calories on the map' },
  fr: { t: 'Course solo (GPS)', s: 'Distance, allure & calories sur la carte' },
  ar: { t: 'جري فردي (GPS)', s: 'المسافة والإيقاع والسعرات على الخريطة' },
};
const RACES_CTA: Record<string, { t: string; s: string }> = {
  en: { t: 'Races & challenges', s: 'Live group races + virtual distance challenges' },
  fr: { t: 'Courses & défis', s: 'Courses groupe en direct + défis distance virtuels' },
  ar: { t: 'سباقات وتحديات', s: 'سباقات جماعية مباشرة + تحديات مسافة افتراضية' },
};

// Small inline strings (avoid editing the large i18n dictionary) for the
// achievements tap-affordance + detail modal.
const ACH_STR: Record<string, { hint: string; unlocked: string; locked: string; lockedMsg: string }> = {
  en: { hint: 'Tap a trophy to see how to unlock it', unlocked: 'Unlocked', locked: 'Locked', lockedMsg: 'Keep going to unlock this trophy!' },
  fr: { hint: 'Touche un trophée pour voir comment le débloquer', unlocked: 'Débloqué', locked: 'Verrouillé', lockedMsg: 'Continue comme ça pour débloquer ce trophée !' },
  ar: { hint: 'اضغط على وسام لمعرفة كيفية فتحه', unlocked: 'مفتوح', locked: 'مقفل', lockedMsg: 'واصل لفتح هذا الوسام!' },
};
import ScreenTopBar from '../../components/ScreenTopBar';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { loadEngagement, EngagementData } from '../../lib/engagement';
import { publishStats } from '../../lib/social';

export default function CoachScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { t, language } = useTranslation();
  const isDark = resolved === 'dark';
  const [data, setData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selAch, setSelAch] = useState<any>(null);
  const flags = useFeatureFlags(); // Feature Flags (Étape 3) — masque les features désactivées par l'admin
  // UX anti-perte : recherche d'outils + 4 derniers outils utilisés + sections repliées.
  const st = SEC_TXT[language] || SEC_TXT.en;
  const [toolSearch, setToolSearch] = useState('');
  const [expandedSecs, setExpandedSecs] = useState<Record<string, boolean>>({});
  const [recents, setRecents] = useState<string[]>([]);
  useEffect(() => { AsyncStorage.getItem('coach_recents').then((v) => { try { if (v) setRecents(JSON.parse(v)); } catch {} }).catch(() => {}); }, []);
  const openTool = (route: string) => {
    router.push(route as any);
    setRecents((prev) => {
      const next = [route, ...prev.filter((r) => r !== route)].slice(0, 4);
      AsyncStorage.setItem('coach_recents', JSON.stringify(next)).catch(() => {});
      return next;
    });
  };
  const astr = ACH_STR[language] || ACH_STR.en;

  const load = useCallback(async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email) { setLoading(false); return; }
    try {
      const d = await loadEngagement(email, language);
      setData(d);
      // Publish public stats so friends' leaderboards stay fresh.
      const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.fullName || email.split('@')[0];
      publishStats(email, { name, imageUrl: user?.imageUrl || undefined, streak: d.streak, daysTracked: d.daysTracked }).catch(() => {});
    } catch (e) {
      console.warn('[Coach] load failed', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, language]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#000' : 'transparent';

  // !data couvre aussi le cas DÉCONNECTÉ (pas d'email → data jamais chargée) :
  // sans ce garde, `data!` crashait l'onglet Coach pour un user signé out.
  if (loading || !data) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <ScreenTopBar />
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.light.primary} /></View>
      </SafeAreaView>
    );
  }

  const d = data;
  const hasPlan = d.recommendedTarget != null;
  const trend = d.weightTrendKgPerWeek;
  const TrendIcon = trend == null || Math.abs(trend) < 0.05 ? Minus : trend < 0 ? TrendingDown : TrendingUp;
  const trendColor = trend == null ? sub : trend < 0 ? '#34D399' : '#fbbf24';
  const unlocked = d.achievements.filter(a => a.unlocked).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.light.primary} />}
      >
        <ScreenTopBar />

        <View style={styles.titleRow}>
          <Sparkles size={26} color={Colors.light.primary} />
          <Text style={[styles.title, { color: text }]}>{t('coach.title')}</Text>
        </View>

        {/* ── Adaptive target hero ── */}
        <LinearGradient colors={[Colors.light.primary, Colors.light.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Text style={styles.heroLabel}>{t('coach.adaptive_label')}</Text>
          {hasPlan ? (
            <>
              <Text style={styles.heroValue}>{d.recommendedTarget}<Text style={styles.heroUnit}> kcal</Text></Text>
              <View style={styles.heroRow}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel}>{t('coach.real_burn')}</Text>
                  <Text style={styles.heroStatValue}>{d.adaptiveTDEE} kcal</Text>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel}>{t('coach.weight_trend')}</Text>
                  <View style={styles.trendRow}>
                    <TrendIcon size={16} color="#fff" />
                    <Text style={styles.heroStatValue}>{trend != null ? `${trend > 0 ? '+' : ''}${trend} kg/wk` : '—'}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.confChip}>
                <Text style={styles.confText}>{t('coach.confidence')}: {t(`coach.conf_${d.confidence}` as any)}</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.heroBuilding}>{t('coach.building_title')}</Text>
              <Text style={styles.heroBuildingSub}>{t('coach.building_sub')}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, (d.daysTracked / 7) * 100)}%` }]} />
              </View>
              <Text style={styles.heroBuildingSub}>{Math.min(d.daysTracked, 7)}/7 {t('coach.days_tracked')}</Text>
            </>
          )}
        </LinearGradient>

        {/* ── Outils — 4 sections par INTENTION + recherche + récents + repli (anti-perte) ── */}
        {(() => {
          const sections = [
            { key: 'eat', Icon: UtensilsCrossed, items: [
              { Icon: BookmarkPlus, label: 'Journal alimentaire', route: '/diary' },
              { Icon: Apple, label: 'Reconnaître un aliment', route: '/food-recognition' },
              { Icon: Mic, label: 'Logging vocal', route: '/voice-log' },
              { Icon: ScanText, label: 'Scan code-barres', route: '/scan-barcode' },
              { Icon: ScanText, label: 'Scanner étiquette', route: '/label-scan' },
              { Icon: ChefHat, label: 'Composer un repas', route: '/meal-builder' },
              { Icon: ChefHat, label: t('coach.meal_title'), route: '/meal-plan' },
              { Icon: Sparkles, label: 'Plan repas IA', route: '/ai-meal-plan' },
              { Icon: BookmarkPlus, label: 'Repas types', route: '/meal-templates' },
              { Icon: Apple, label: t('coach.nutrients_title'), route: '/nutrients' },
              { Icon: Refrigerator, label: 'Frigo → recettes', route: '/fridge-recipes' },
              { Icon: Replace, label: 'Substitutions', route: '/substitutions' },
              { Icon: Link2, label: 'Importer recette', route: '/import-recipe' },
              { Icon: ShoppingCart, label: 'Liste de courses', route: '/shopping-list' },
              { Icon: Award, label: 'Nutri-Score', route: '/nutri-score' },
              { Icon: UtensilsCrossed, label: 'Mode resto', route: '/restaurant-mode' },
              { Icon: Receipt, label: 'Ticket de caisse', route: '/receipt-ocr' },
              { Icon: Timer, label: 'Jeûne intermittent', route: '/fasting' },
            ]},
            { key: 'move', Icon: Dumbbell, items: [
              { Icon: Dumbbell, label: 'Enregistrer une séance', route: '/log-exercise' },
              { Icon: MapPin, label: (RUN_CTA[language] || RUN_CTA.en).t, route: '/run' },
              { Icon: Trophy, label: (RACES_CTA[language] || RACES_CTA.en).t, route: '/races' },
              { Icon: FileText, label: 'Agenda sport', route: '/sport-agenda' },
              { Icon: Dumbbell, label: (PLANS_CTA[language] || PLANS_CTA.en).t, route: '/workout-plans' },
              { Icon: Dumbbell, label: 'Compteur de reps', route: '/rep-counter' },
              { Icon: ScanText, label: "Scanner d'équipement", route: '/equipment-scan' },
              { Icon: Swords, label: 'Battle 1v1', route: '/battle' },
            ]},
            { key: 'track', Icon: BarChart3, items: [
              { Icon: Ruler, label: 'Mesures corporelles', route: '/body-measurements' },
              { Icon: Moon, label: 'Sommeil', route: '/sleep-tracker' },
              { Icon: Smile, label: 'Humeur & énergie', route: '/mood-tracker' },
              { Icon: Droplets, label: 'Hydratation intelligente', route: '/smart-hydration' },
              { Icon: TrendingUp, label: 'Photos de progression', route: '/progress-photos' },
              { Icon: Flame, label: 'Mes séries', route: '/streaks' },
              { Icon: PersonStanding, label: 'Composition corporelle', route: '/body-composition' },
              { Icon: Droplet, label: 'Glycémie', route: '/glucose-tracker' },
              { Icon: Activity, label: 'Microbiote', route: '/microbiome' },
              { Icon: HeartPulse, label: t('coach.health_title'), route: '/health' },
              { Icon: FileText, label: 'Export médecin', route: '/doctor-export' },
            ]},
            { key: 'ai', Icon: Sparkles, items: [
              { Icon: Sparkles, label: 'Coach IA', route: '/ai-coach' },
              { Icon: Activity, label: 'TDEE adaptatif', route: '/adaptive-tdee' },
              { Icon: TrendingDown, label: 'Jumeau métabolique', route: '/metabolic-twin' },
              { Icon: Wallet, label: 'Budget calories', route: '/calorie-budget' },
              { Icon: FileText, label: 'Journal & actus', route: '/journal' },
              { Icon: Trophy, label: t('coach.social_title'), route: '/social' },
            ]},
          ];
          const allItems = sections.flatMap((g) => g.items);
          const q = toolSearch.trim().toLowerCase();
          return (
            <>
              {/* Recherche d'outil */}
              <View style={[styles.searchBox, { backgroundColor: card }]}>
                <Search size={17} color={sub} />
                <TextInput style={[styles.searchInput, { color: text }]} placeholder={st.search} placeholderTextColor={sub} value={toolSearch} onChangeText={setToolSearch} />
                {!!toolSearch && <TouchableOpacity onPress={() => setToolSearch('')}><X size={16} color={sub} /></TouchableOpacity>}
              </View>

              {/* Récents — l'app s'adapte à l'usage */}
              {!q && recents.length > 0 && (
                <>
                  <View style={styles.secHeadRow}><History size={15} color={Colors.light.primary} /><Text style={[styles.gridSection, { color: sub, marginTop: 0, marginBottom: 0 }]}>{st.recents}</Text></View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
                    {recents.map((r) => { const it = allItems.find((i) => i.route === r); if (!it) return null; const I = it.Icon; return (
                      <TouchableOpacity key={r} style={[styles.recentChip, { backgroundColor: card }]} onPress={() => openTool(r)}>
                        <I size={15} color={Colors.light.primary} /><Text style={[styles.recentTxt, { color: text }]} numberOfLines={1}>{it.label}</Text>
                      </TouchableOpacity>
                    ); })}
                  </ScrollView>
                </>
              )}

              {sections.map((group) => {
                const items = group.items
                  .filter((it) => isEnabled(flags, it.route.replace(/^\//, '')))
                  .filter((it) => !q || it.label.toLowerCase().includes(q));
                if (!items.length) return null;
                const isOpen = !!expandedSecs[group.key] || !!q;
                const visible = isOpen ? items : items.slice(0, 6);
                const GIcon = group.Icon;
                return (
                  <View key={group.key}>
                    <View style={styles.secHeadRow}><GIcon size={15} color={Colors.light.primary} /><Text style={[styles.gridSection, { color: sub, marginTop: 0, marginBottom: 0 }]}>{st[group.key]}</Text></View>
                    <View style={styles.featGrid}>
                      {visible.map((it) => { const Icon = it.Icon; return (
                        <TouchableOpacity key={it.route} activeOpacity={0.85} onPress={() => openTool(it.route)} style={[styles.featCard, { backgroundColor: card }]}>
                          <View style={styles.mealCtaIcon}><Icon size={22} color={Colors.light.primary} /></View>
                          <Text style={[styles.featLabel, { color: text }]} numberOfLines={2}>{it.label}</Text>
                        </TouchableOpacity>
                      ); })}
                    </View>
                    {items.length > 6 && !q && (
                      <TouchableOpacity style={styles.seeAllBtn} onPress={() => setExpandedSecs((p) => ({ ...p, [group.key]: !p[group.key] }))}>
                        <Text style={styles.seeAllTxt}>{isOpen ? st.less : `${st.seeAll} (${items.length})`}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </>
          );
        })()}

        {/* ── Streak ── */}
        <View style={[styles.streakCard, { backgroundColor: card }]}>
          <View style={styles.streakIcon}><Flame size={28} color="#f59e0b" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.streakValue, { color: text }]}>{d.streak} {t('coach.streak_suffix')}</Text>
            <Text style={[styles.streakSub, { color: sub }]}>
              {d.streak === 0 ? t('coach.streak_0') : d.streak < 3 ? t('coach.streak_low') : t('coach.streak_high')}
            </Text>
          </View>
        </View>

        {/* ── Achievements ── */}
        <View style={styles.sectionRow}>
          <Text style={[styles.section, { color: text }]}>{t('coach.achievements')}</Text>
          <Text style={[styles.sectionCount, { color: sub }]}>{unlocked}/{d.achievements.length}</Text>
        </View>
        <Text style={[styles.achHint, { color: sub }]}>{astr.hint}</Text>
        <View style={styles.badgeGrid}>
          {d.achievements.map(a => (
            <TouchableOpacity
              key={a.id}
              activeOpacity={0.8}
              onPress={() => setSelAch(a)}
              style={[styles.badge, { backgroundColor: card }, !a.unlocked && styles.badgeLocked]}
            >
              {/* status corner: check when unlocked, lock when not */}
              <View style={styles.badgeCorner}>
                {a.unlocked ? <CheckCircle2 size={16} color={Colors.light.primary} /> : <Lock size={14} color={sub} />}
              </View>
              <Text style={[styles.badgeIcon, !a.unlocked && styles.badgeIconLocked]}>{a.icon}</Text>
              <Text style={[styles.badgeTitle, { color: a.unlocked ? text : sub }]} numberOfLines={1}>{a.title}</Text>
              <Text style={[styles.badgeDesc, { color: sub }]} numberOfLines={2}>{a.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Achievement detail modal ── */}
        <Modal visible={!!selAch} transparent animationType="fade" onRequestClose={() => setSelAch(null)}>
          <Pressable style={styles.modalOverlay} onPress={() => setSelAch(null)}>
            <Pressable style={[styles.modalCard, { backgroundColor: card }]} onPress={() => {}}>
              <TouchableOpacity style={styles.modalClose} onPress={() => setSelAch(null)}><X size={20} color={sub} /></TouchableOpacity>
              <Text style={styles.modalIcon}>{selAch?.icon}</Text>
              <Text style={[styles.modalTitle, { color: text }]}>{selAch?.title}</Text>
              <Text style={[styles.modalDesc, { color: sub }]}>{selAch?.desc}</Text>
              <View style={[styles.statusPill, { backgroundColor: selAch?.unlocked ? 'rgba(41,143,80,0.15)' : 'rgba(120,140,130,0.15)' }]}>
                {selAch?.unlocked ? <CheckCircle2 size={16} color={Colors.light.primary} /> : <Lock size={14} color={sub} />}
                <Text style={[styles.statusText, { color: selAch?.unlocked ? Colors.light.primaryDark : sub }]}>
                  {selAch?.unlocked ? astr.unlocked : astr.locked}
                </Text>
              </View>
              {!selAch?.unlocked && <Text style={[styles.modalHint, { color: sub }]}>{astr.lockedMsg}</Text>}
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── Daily lesson ── */}
        <View style={styles.sectionRow}>
          <Text style={[styles.section, { color: text }]}>{t('coach.lesson_title')}</Text>
        </View>
        <View style={[styles.lessonCard, { backgroundColor: card }]}>
          <View style={styles.lessonIcon}><Lightbulb size={22} color={Colors.light.primary} /></View>
          <Text style={[styles.lessonTitle, { color: text }]}>{d.lesson.title}</Text>
          <Text style={[styles.lessonBody, { color: sub }]}>{d.lesson.body}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 130 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 18 },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },

  hero: { borderRadius: 26, padding: 24, marginBottom: 18 },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  heroValue: { color: '#fff', fontSize: 52, fontWeight: '900', marginTop: 4, letterSpacing: -2 },
  heroUnit: { fontSize: 22, fontWeight: '800' },
  heroRow: { flexDirection: 'row', marginTop: 14, gap: 16 },
  heroStat: { flex: 1 },
  heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  heroStatLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  heroStatValue: { color: '#fff', fontSize: 17, fontWeight: '800', marginTop: 2 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  confChip: { alignSelf: 'flex-start', marginTop: 14, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  confText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroBuilding: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 6 },
  heroBuildingSub: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 8, lineHeight: 20 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 14, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#fff' },

  mealCta: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  mealCtaIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.light.primaryLight, alignItems: 'center', justifyContent: 'center' },
  mealCtaTitle: { fontSize: 17, fontWeight: '800' },
  mealCtaSub: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  // Grille compacte (Coach allégé) — 2 colonnes, sections
  gridSection: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8, opacity: 0.7 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, marginTop: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 10 },
  secHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18, marginBottom: 10 },
  recentChip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9, maxWidth: 190 },
  recentTxt: { fontSize: 12.5, fontWeight: '700', flexShrink: 1 },
  seeAllBtn: { alignItems: 'center', paddingVertical: 4, marginBottom: 6 },
  seeAllTxt: { color: Colors.light.primary, fontWeight: '800', fontSize: 13 },
  featGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  featCard: { width: '48%', alignItems: 'center', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 8, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  featLabel: { fontSize: 13, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 18, marginBottom: 22, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  streakIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FEF3E0', alignItems: 'center', justifyContent: 'center' },
  streakValue: { fontSize: 20, fontWeight: '900' },
  streakSub: { fontSize: 13, marginTop: 3, lineHeight: 18 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  section: { fontSize: 20, fontWeight: '800' },
  sectionCount: { fontSize: 14, fontWeight: '700' },
  achHint: { fontSize: 12.5, fontWeight: '600', marginTop: -4, marginBottom: 12 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  badge: { width: '47%', borderRadius: 18, padding: 14, position: 'relative', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  badgeLocked: { opacity: 0.6 },
  badgeCorner: { position: 'absolute', top: 10, right: 10 },
  badgeIcon: { fontSize: 28 },
  badgeIconLocked: { opacity: 0.4 },
  badgeTitle: { fontSize: 15, fontWeight: '800', marginTop: 8 },
  badgeDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 24, padding: 28, alignItems: 'center' },
  modalClose: { position: 'absolute', top: 14, right: 14, padding: 6 },
  modalIcon: { fontSize: 56, marginTop: 6 },
  modalTitle: { fontSize: 22, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  modalDesc: { fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, marginTop: 18 },
  statusText: { fontSize: 14, fontWeight: '800' },
  modalHint: { fontSize: 13, marginTop: 14, textAlign: 'center', lineHeight: 18 },

  lessonCard: { borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  lessonIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.light.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  lessonTitle: { fontSize: 18, fontWeight: '800' },
  lessonBody: { fontSize: 14, marginTop: 6, lineHeight: 21 },
});
