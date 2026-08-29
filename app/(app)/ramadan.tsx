// 🌙 Mode Ramadan — écran dédié objectif-aware. Réutilise lib/ramadan.ts (logique
// pure + API Aladhan + persistance Firestore) et useNutritionData(today) pour le
// budget kcal/macros du jour, réparti Suhoor/Iftar via splitBudget.
//
// Sections :
//  (a) sélecteur de ville + toggle Mode Ramadan (persiste via setRamadanPrefs)
//  (b) compte à rebours vers le prochain Iftar (ou Suhoor selon l'heure)
//  (c) carte Suhoor / carte Iftar (budget kcal+macros réparti)
//  (d) tracker hydratation (verres bus / cible + créneaux hydrationPlan)
//  (e) défi Ramadan : streak de jours jeûnés + bouton « J'ai jeûné aujourd'hui »
//
// Trilingue en/fr/ar (libellés arabes existants), dark, RTL, flèche retour.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { suggererSuhoor, suggererIftar, nomAliment, type Aliment } from '../../lib/ramadanAssiettes';
import BASE_LOCALE from '../../assets/data/local-foods.json';
import { useTokens, type Tokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Moon, Sunrise, MapPin, Droplets, Flame, CheckCircle2 } from 'lucide-react-native';
import { SkeletonCard, Skeleton, Card, PrimaryButton, SecondaryButton, SectionHeader, Input } from '../../components/ui';
import { spacing } from '../../constants/theme';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { useNutritionData } from '../../hooks/useNutritionData';
import {
  getFastTimes, splitBudget, hydrationPlan,
  getRamadanPrefs, setRamadanPrefs,
  logFastDay, getFastStreak,
  DEFAULT_CITY, DEFAULT_COUNTRY, HYDRATION_TARGET_GLASSES,
  type FastTimes, type SplitBudget, type HydrationSlot,
} from '../../lib/ramadan';

const TXT: any = {
  en: {
    title: 'Ramadan mode',
    intro: 'Split your daily budget across Suhoor and Iftar, stay hydrated and keep your fasting streak.',
    settings: 'Settings', city: 'City', country: 'Country', enable: 'Enable Ramadan mode',
    save: 'Save', saved: 'Saved',
    nextIftar: 'Next Iftar in', nextSuhoor: 'Suhoor ends in', canEat: 'Iftar 🌙 — you can eat',
    suhoorAt: 'Suhoor', iftarAt: 'Iftar', timesUnavailable: 'Times unavailable — check the city or your connection.',
    suhoor: 'Suhoor', iftar: 'Iftar', kcal: 'kcal', protein: 'Protein', carbs: 'Carbs', fat: 'Fat', water: 'water',
    assiettes: 'Tonight’s plates', assiettesSub: 'Suggested from 653 Moroccan dishes — swap anything you like.',
    glasses: 'glasses', budgetNote: 'Based on your daily goal — protein is balanced across both meals.',
    macroSplit: 'Macro split', macroSplitSub: 'Indicative share of each macro per meal.',
    ofDay: 'of day',
    hydrationWindow: 'Hydration window', hydrationWindowSub: 'Drinking is on between Iftar and Suhoor — spread water across the evening rather than all at once.',
    guidance: 'Breaking the fast', guidanceRefeed: 'Break gently: dates + water first, then a balanced meal. Avoid eating everything at once — it eases digestion and steadies energy.',
    guidanceTdee: 'Your TDEE (daily energy) may be adjusted during fasting: activity and sleep shift, so treat the split as a flexible guide, not a strict rule.',
    guidanceDisclaimer: 'General wellness guidance, not medical advice.',
    hydration: 'Hydration', hydrationSub: 'Glasses drunk / target between Iftar and Suhoor.', glass: 'glass',
    addGlass: '+1 glass', resetGlasses: 'Reset', slots: 'Reminder slots',
    challenge: 'Ramadan challenge', streak: 'Fasted days streak', days: 'days',
    fastedToday: "I fasted today", fastedDone: 'Logged for today ✓',
  },
  fr: {
    title: 'Mode Ramadan',
    intro: 'Répartis ton budget du jour entre le Suhoor et l\'Iftar, hydrate-toi et garde ta série de jours jeûnés.',
    settings: 'Réglages', city: 'Ville', country: 'Pays', enable: 'Activer le mode Ramadan',
    save: 'Enregistrer', saved: 'Enregistré',
    nextIftar: 'Prochain Iftar dans', nextSuhoor: 'Le Suhoor se termine dans', canEat: 'Iftar 🌙 — tu peux manger',
    suhoorAt: 'Suhoor', iftarAt: 'Iftar', timesUnavailable: 'Horaires indisponibles — vérifie la ville ou ta connexion.',
    suhoor: 'Suhoor', iftar: 'Iftar', kcal: 'kcal', protein: 'Protéines', carbs: 'Glucides', fat: 'Lipides', water: 'eau',
    assiettes: 'Les assiettes du soir', assiettesSub: 'Suggérées parmi 653 plats marocains — remplace ce que tu veux.',
    glasses: 'verres', budgetNote: 'Basé sur ton objectif du jour — les protéines sont équilibrées entre les deux repas.',
    macroSplit: 'Répartition des macros', macroSplitSub: 'Part indicative de chaque macro par repas.',
    ofDay: 'du jour',
    hydrationWindow: 'Fenêtre d\'hydratation', hydrationWindowSub: 'On boit entre l\'Iftar et le Suhoor — répartis l\'eau sur la soirée plutôt que tout d\'un coup.',
    guidance: 'Rompre le jeûne', guidanceRefeed: 'Romps le jeûne en douceur : dattes + eau d\'abord, puis un repas équilibré. Évite de tout manger d\'un coup — la digestion et l\'énergie s\'en trouvent plus stables.',
    guidanceTdee: 'Ton TDEE (dépense énergétique du jour) peut être ajusté en période de jeûne : l\'activité et le sommeil changent, considère donc la répartition comme un repère souple, pas une règle stricte.',
    guidanceDisclaimer: 'Conseils de bien-être généraux, pas un avis médical.',
    hydration: 'Hydratation', hydrationSub: 'Verres bus / cible entre l\'Iftar et le Suhoor.', glass: 'verre',
    addGlass: '+1 verre', resetGlasses: 'Réinitialiser', slots: 'Créneaux de rappel',
    challenge: 'Défi Ramadan', streak: 'Série de jours jeûnés', days: 'jours',
    fastedToday: "J'ai jeûné aujourd'hui", fastedDone: "Enregistré pour aujourd'hui ✓",
  },
  ar: {
    title: 'وضع رمضان',
    intro: 'وزّع ميزانيتك اليومية بين السحور والإفطار، حافظ على ترطيبك وسلسلة أيام صيامك.',
    settings: 'الإعدادات', city: 'المدينة', country: 'البلد', enable: 'تفعيل وضع رمضان',
    save: 'حفظ', saved: 'تم الحفظ',
    nextIftar: 'الإفطار القادم خلال', nextSuhoor: 'ينتهي السحور خلال', canEat: 'الإفطار 🌙 — يمكنك الأكل',
    suhoorAt: 'السحور', iftarAt: 'الإفطار', timesUnavailable: 'المواقيت غير متوفرة — تحقق من المدينة أو اتصالك.',
    suhoor: 'السحور', iftar: 'الإفطار', kcal: 'سعرة', protein: 'بروتين', carbs: 'كربوهيدرات', fat: 'دهون', water: 'ماء',
    assiettes: 'أطباق الليلة', assiettesSub: 'مقترحة من 653 طبقًا مغربيًا — بدّل ما شئت.',
    glasses: 'أكواب', budgetNote: 'حسب هدفك اليومي — البروتين موزّع بالتساوي بين الوجبتين.',
    hydration: 'الترطيب', hydrationSub: 'الأكواب المشروبة / الهدف بين الإفطار والسحور.', glass: 'كوب',
    addGlass: '+كوب', resetGlasses: 'إعادة ضبط', slots: 'أوقات التذكير',
    challenge: 'تحدي رمضان', streak: 'سلسلة أيام الصيام', days: 'أيام',
    fastedToday: 'لقد صمت اليوم', fastedDone: 'تم التسجيل لليوم ✓',
  },
};

const SLOT_LABELS: any = {
  en: { iftar: 'Iftar', evening: 'Evening', suhoor: 'Suhoor' },
  fr: { iftar: 'Iftar', evening: 'Soirée', suhoor: 'Suhoor' },
  ar: { iftar: 'الإفطار', evening: 'المساء', suhoor: 'السحور' },
};

function ymdToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "HH:MM" → prochain instant (Date) correspondant à cette heure (aujourd'hui ou demain). */
function nextOccurrence(hm: string, base: Date): Date {
  const [h, m] = String(hm || '').split(':').map((x) => parseInt(x, 10));
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(),
    Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  if (d.getTime() <= base.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

function fmtCountdown(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function RamadanScreen() {
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const slotT = SLOT_LABELS[language] || SLOT_LABELS.en;
  const isDark = resolved === 'dark';
  const GREEN = colors.primary;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const border = tok.border;

  const today = useMemo(() => ymdToday(), []);
  const { goals } = useNutritionData(today);

  // Prefs (ville / pays / activé)
  const [city, setCity] = useState(DEFAULT_CITY);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [enabled, setEnabled] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Horaires de jeûne
  const [times, setTimes] = useState<FastTimes | null>(null);
  const [loadingTimes, setLoadingTimes] = useState(false);

  // Horloge (compte à rebours)
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef<any>(null);

  // Hydratation (compteur local, persistant sur la session de l'écran)
  const [glasses, setGlasses] = useState(0);

  // Défi : streak + log du jour
  const [streak, setStreak] = useState(0);
  const [fastedToday, setFastedToday] = useState(false);
  const [logging, setLogging] = useState(false);

  // ── Chargement initial : prefs + streak ──
  useEffect(() => {
    if (!email) return;
    let alive = true;
    (async () => {
      const prefs = await getRamadanPrefs(email);
      if (!alive) return;
      setCity(prefs.city);
      setCountry(prefs.country);
      setEnabled(prefs.enabled);
    })();
    getFastStreak(email).then((n) => { if (alive) setStreak(n); }).catch(() => {});
    return () => { alive = false; };
  }, [email]);

  // ── Horaires de jeûne pour la ville courante ──
  const loadTimes = useCallback((c: string, co: string) => {
    setLoadingTimes(true);
    getFastTimes(c, co)
      .then((ft) => setTimes(ft))
      .catch(() => setTimes(null))
      .finally(() => setLoadingTimes(false));
  }, []);

  useEffect(() => { loadTimes(city, country); }, []); // au montage (ville des prefs peut arriver après → re-fetch au save)

  // ── Horloge 1s ──
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── Persistance des prefs + rechargement des horaires ──
  const save = async () => {
    const c = city.trim() || DEFAULT_CITY;
    const co = country.trim() || DEFAULT_COUNTRY;
    setCity(c); setCountry(co);
    await setRamadanPrefs(email, { city: c, country: co, enabled });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
    loadTimes(c, co);
  };

  const onToggle = async (v: boolean) => {
    setEnabled(v);
    await setRamadanPrefs(email, { enabled: v });
  };

  // ── Budget réparti Suhoor / Iftar (objectif-aware) ──
  const split: SplitBudget = useMemo(
    () => splitBudget(goals.calories, { protein: goals.protein, carbs: goals.carbs, fat: goals.fat }),
    [goals.calories, goals.protein, goals.carbs, goals.fat],
  );

  // ── Les assiettes du soir (F3) ────────────────────────────────────────────
  // Memorisees sur la DATE et le budget : sans cela, la suggestion changerait a
  // chaque rendu de l'ecran, et une proposition qui bouge sans cesse n'inspire
  // aucune confiance. La base locale est embarquee — le Ramadan se vit souvent en
  // famille, loin du wifi.
  const jourCourant = useMemo(() => {
    const d = new Date();
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  }, []);
  const assietteSuhoor = useMemo(
    () => suggererSuhoor(BASE_LOCALE as Aliment[], split.suhoor.kcal, jourCourant),
    [split.suhoor.kcal, jourCourant],
  );
  const assietteIftar = useMemo(
    () => suggererIftar(BASE_LOCALE as Aliment[], split.iftar.kcal, jourCourant),
    [split.iftar.kcal, jourCourant],
  );

  // ── Répartition indicative des macros par repas (dérivée du split, présentation seule) ──
  // On ne recalcule PAS le budget : on lit les parts déjà réparties par splitBudget
  // et on les exprime en pourcentage Suhoor/Iftar pour un aperçu lisible.
  const macroShares = useMemo(() => {
    const pct = (s: number, i: number) => {
      const total = (Number(s) || 0) + (Number(i) || 0);
      if (total <= 0) return { suhoor: 0, iftar: 0 };
      const suhoor = Math.round((Number(s) || 0) / total * 100);
      return { suhoor, iftar: 100 - suhoor };
    };
    return {
      protein: pct(split.suhoor.protein, split.iftar.protein),
      carbs: pct(split.suhoor.carbs, split.iftar.carbs),
      fat: pct(split.suhoor.fat, split.iftar.fat),
    };
  }, [split]);

  // ── Créneaux d'hydratation (fenêtre Iftar → Suhoor) ──
  const slots: HydrationSlot[] = useMemo(
    () => (times ? hydrationPlan(times.maghrib, times.fajr, HYDRATION_TARGET_GLASSES) : []),
    [times],
  );

  // ── Phase courante + compte à rebours ──
  const countdown = useMemo(() => {
    if (!times) return null;
    const base = new Date(now);
    const iftar = nextOccurrence(times.maghrib, base);
    const suhoor = nextOccurrence(times.fajr, base);
    // La cible la plus proche détermine la phase.
    const target = iftar.getTime() <= suhoor.getTime() ? iftar : suhoor;
    const isIftar = target === iftar;
    return { ms: target.getTime() - now, label: isIftar ? t.nextIftar : t.nextSuhoor, isIftar };
  }, [times, now, t]);

  const fmtClock = (hm: string) => {
    const [h, m] = String(hm || '').split(':');
    return `${h}:${m}`;
  };

  // ── Défi : logguer le jour ──
  const logToday = async () => {
    if (!email || fastedToday || logging) return;
    setLogging(true);
    const res = await logFastDay(email);
    if (res) {
      setFastedToday(true);
      const n = await getFastStreak(email);
      setStreak(n);
    }
    setLogging(false);
  };

  const Macro = ({ label, value }: { label: string; value: number }) => (
    <View style={styles.macroCell}>
      <Text style={[styles.macroVal, { color: text }]}>{Math.round(value)}g</Text>
      <Text style={[styles.macroLbl, { color: sub }]}>{label}</Text>
    </View>
  );

  // Barre indicative Suhoor/Iftar pour une macro (présentation dérivée du split).
  const MacroSplitBar = ({ label, share }: { label: string; share: { suhoor: number; iftar: number } }) => (
    <View style={styles.splitItem}>
      <View style={[styles.splitTop, { flexDirection: rowDir(isRTL) }]}>
        <Text style={[styles.splitLbl, { color: text, textAlign: txtAlign(isRTL) }]}>{label}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.splitPct, { color: sub }]}>{share.suhoor}% · {share.iftar}%</Text>
      </View>
      <View style={[styles.splitTrack, { backgroundColor: k.surfaceSunken, flexDirection: rowDir(isRTL) }]}>
        <View style={{ width: `${share.suhoor}%`, backgroundColor: k.warning, height: '100%' }} />
        <View style={{ width: `${share.iftar}%`, backgroundColor: GREEN, height: '100%' }} />
      </View>
    </View>
  );

  const MealCard = ({ icon: Icon, name, meal }: { icon: any; name: string; meal: SplitBudget['suhoor'] }) => (
    <Card variant="raised" style={styles.mealCard}>
      <View style={[styles.mealHead, { flexDirection: rowDir(isRTL) }]}>
        <Icon size={18} color={GREEN} />
        <Text style={[styles.mealName, { color: text, textAlign: txtAlign(isRTL) }]}>{name}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.mealKcal, { color: GREEN }]}>{Math.round(meal.kcal)} {t.kcal}</Text>
      </View>
      <View style={[styles.macroRow, { flexDirection: rowDir(isRTL) }]}>
        <Macro label={t.protein} value={meal.protein} />
        <Macro label={t.carbs} value={meal.carbs} />
        <Macro label={t.fat} value={meal.fat} />
        <View style={styles.macroCell}>
          <Text style={[styles.macroVal, { color: text }]}>{meal.water}</Text>
          <Text style={[styles.macroLbl, { color: sub }]}>💧 {t.water}</Text>
        </View>
      </View>
    </Card>
  );

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack title={t.title} showBrand={false} showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.head, { flexDirection: rowDir(isRTL) }]}>
          <Moon size={26} color={GREEN} />
          <Text style={[styles.title, { color: text, textAlign: txtAlign(isRTL) }]}>{t.title}</Text>
        </View>
        <Text style={[styles.intro, { color: sub, textAlign: txtAlign(isRTL) }]}>{t.intro}</Text>

        {/* (a) Réglages : ville + pays + toggle */}
        <Card variant="raised" style={styles.cardBox}>
          <Text style={[styles.secTitle, { color: text, textAlign: txtAlign(isRTL) }]}>{t.settings}</Text>
          <Input
            label={t.city}
            icon={<MapPin size={18} color={sub} />}
            placeholder={t.city} value={city} onChangeText={setCity} autoCapitalize="words"
          />
          <Input
            label={t.country}
            placeholder={t.country} value={country} onChangeText={setCountry} autoCapitalize="words"
          />
          <View style={[styles.toggleRow, { flexDirection: rowDir(isRTL) }]}>
            <Text style={[styles.toggleLbl, { color: text, textAlign: txtAlign(isRTL) }]}>{t.enable}</Text>
            <Switch value={enabled} onValueChange={onToggle} trackColor={{ true: GREEN, false: '#cbd5e1' }} thumbColor="#fff" />
          </View>
          <PrimaryButton title={savedFlash ? t.saved : t.save} onPress={save} style={{ marginTop: spacing.md }} />
        </Card>

        {/* (b) Compte à rebours */}
        <Card variant="raised" style={[styles.cardBox, { alignItems: 'center' }]}>
          {loadingTimes && !times ? (
            <View style={{ width: '100%', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
              <Skeleton width="70%" height={16} />
              <Skeleton width="45%" height={13} style={{ marginTop: 6 }} />
              <Skeleton width="55%" height={46} round={12} style={{ marginTop: 4 }} />
              <Skeleton width="35%" height={12} />
            </View>
          ) : !times ? (
            <Text style={[styles.sub, { color: sub, textAlign: 'center' }]}>{t.timesUnavailable}</Text>
          ) : (
            <>
              <View style={[styles.timesRow, { flexDirection: rowDir(isRTL) }]}>
                <Sunrise size={15} color={sub} /><Text style={[styles.timesTxt, { color: sub }]}>{t.suhoorAt} {fmtClock(times.fajr)}</Text>
                <Moon size={15} color={GREEN} /><Text style={[styles.timesTxt, { color: sub }]}>{t.iftarAt} {fmtClock(times.maghrib)}</Text>
              </View>
              <Text style={[styles.cdLabel, { color: sub }]}>{countdown?.label}</Text>
              <Text style={[styles.cdTimer, { color: countdown?.isIftar ? GREEN : text }]}>{fmtCountdown(countdown?.ms ?? 0)}</Text>
              <Text style={[styles.cdCity, { color: sub }]}>{times.city}</Text>
            </>
          )}
        </Card>

        {/* (c) Cartes Suhoor / Iftar */}
        <MealCard icon={Sunrise} name={t.suhoor} meal={split.suhoor} />
        <MealCard icon={Moon} name={t.iftar} meal={split.iftar} />
        <Text style={[styles.footNote, { color: sub, textAlign: txtAlign(isRTL) }]}>{t.budgetNote}</Text>

        {/* (c-ter) LES ASSIETTES — le budget disait combien manger, jamais quoi.
            Suggestions deterministes tirees de la base locale : memes plats toute
            la journee, et disponibles hors connexion. */}
        <Card variant="raised" style={styles.cardBox}>
          <Text style={[styles.secTitle, { color: text, marginBottom: 2, textAlign: txtAlign(isRTL) }]}>{t.assiettes}</Text>
          <Text style={[styles.footNote, { color: sub, marginBottom: 10, textAlign: txtAlign(isRTL) }]}>{t.assiettesSub}</Text>
          {([['suhoor', assietteSuhoor], ['iftar', assietteIftar]] as const).map(([cle, assiette]) => (
            <View key={cle} style={{ marginBottom: 10 }}>
              <Text style={[styles.legendTxt, { color: text, fontWeight: '800', textAlign: txtAlign(isRTL) }]}>
                {cle === 'suhoor' ? t.suhoor : t.iftar} · {assiette.kcal} {t.kcal}
              </Text>
              {assiette.portions.map((portion) => (
                <View
                  key={portion.aliment.n}
                  style={[styles.legendItem, { flexDirection: rowDir(isRTL), justifyContent: 'space-between' }]}
                >
                  <Text style={[styles.legendTxt, { color: sub, flex: 1, textAlign: txtAlign(isRTL) }]} numberOfLines={1}>
                    {nomAliment(portion.aliment, String(language))}
                  </Text>
                  <Text style={[styles.legendTxt, { color: sub }]}>{portion.grammes} g · {portion.kcal} {t.kcal}</Text>
                </View>
              ))}
            </View>
          ))}
        </Card>

        {/* (c-bis) Répartition indicative des macros Suhoor/Iftar — présentation dérivée du split */}
        <Card variant="raised" style={styles.cardBox}>
          <Text style={[styles.secTitle, { color: text, marginBottom: 4, textAlign: txtAlign(isRTL) }]}>{t.macroSplit}</Text>
          <Text style={[styles.sub, { color: sub, marginBottom: 10, textAlign: txtAlign(isRTL) }]}>{t.macroSplitSub}</Text>
          <View style={[styles.splitLegend, { flexDirection: rowDir(isRTL) }]}>
            <View style={[styles.legendItem, { flexDirection: rowDir(isRTL) }]}>
              <View style={[styles.legendDot, { backgroundColor: k.warning }]} />
              <Text style={[styles.legendTxt, { color: sub }]}>{t.suhoor}</Text>
            </View>
            <View style={[styles.legendItem, { flexDirection: rowDir(isRTL) }]}>
              <View style={[styles.legendDot, { backgroundColor: GREEN }]} />
              <Text style={[styles.legendTxt, { color: sub }]}>{t.iftar}</Text>
            </View>
          </View>
          <MacroSplitBar label={t.protein} share={macroShares.protein} />
          <MacroSplitBar label={t.carbs} share={macroShares.carbs} />
          <MacroSplitBar label={t.fat} share={macroShares.fat} />

          <View style={[styles.windowRow, { flexDirection: rowDir(isRTL), borderTopColor: border }]}>
            <Droplets size={16} color={GREEN} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.windowLbl, { color: text, textAlign: txtAlign(isRTL) }]}>{t.hydrationWindow}</Text>
              <Text style={[styles.windowSub, { color: sub, textAlign: txtAlign(isRTL) }]}>{t.hydrationWindowSub}</Text>
            </View>
          </View>
        </Card>

        {/* (c-ter) Guidance non-clinique : refeed après le jeûne + note TDEE */}
        <Card variant="raised" style={styles.cardBox}>
          <View style={[styles.secHeadRow, { flexDirection: rowDir(isRTL) }]}>
            <Moon size={18} color={GREEN} />
            <Text style={[styles.secTitle, { color: text, marginBottom: 0, textAlign: txtAlign(isRTL) }]}>{t.guidance}</Text>
          </View>
          <Text style={[styles.guidanceTxt, { color: text, marginTop: 10, textAlign: txtAlign(isRTL) }]}>{t.guidanceRefeed}</Text>
          <Text style={[styles.guidanceTxt, { color: text, marginTop: 8, textAlign: txtAlign(isRTL) }]}>{t.guidanceTdee}</Text>
          <Text style={[styles.guidanceDisc, { color: sub, marginTop: 8, textAlign: txtAlign(isRTL) }]}>{t.guidanceDisclaimer}</Text>
        </Card>

        {/* (d) Hydratation */}
        <Card variant="raised" style={styles.cardBox}>
          <View style={[styles.secHeadRow, { flexDirection: rowDir(isRTL) }]}>
            <Droplets size={18} color={GREEN} />
            <Text style={[styles.secTitle, { color: text, marginBottom: 0, textAlign: txtAlign(isRTL) }]}>{t.hydration}</Text>
          </View>
          <Text style={[styles.sub, { color: sub, marginTop: 4, textAlign: txtAlign(isRTL) }]}>{t.hydrationSub}</Text>

          <Text style={[styles.hydroCount, { color: GREEN, textAlign: 'center' }]}>{glasses} / {HYDRATION_TARGET_GLASSES}</Text>
          <View style={[styles.glassRow, { flexDirection: rowDir(isRTL) }]}>
            {Array.from({ length: HYDRATION_TARGET_GLASSES }).map((_, i) => (
              <Droplets key={i} size={22} color={i < glasses ? GREEN : (isDark ? k.textMuted : k.textFaint)} fill={i < glasses ? GREEN : 'transparent'} />
            ))}
          </View>
          <View style={[styles.hydroBtns, { flexDirection: rowDir(isRTL) }]}>
            <PrimaryButton
              title={t.addGlass}
              icon={<Droplets size={18} color={k.onAccent} />}
              onPress={() => setGlasses((g) => Math.min(HYDRATION_TARGET_GLASSES, g + 1))}
              style={{ flex: 1 }}
            />
            <SecondaryButton title={t.resetGlasses} onPress={() => setGlasses(0)} full={false} />
          </View>

          {slots.length > 0 && (
            <>
              <Text style={[styles.slotsLbl, { color: sub, textAlign: txtAlign(isRTL) }]}>{t.slots}</Text>
              <View style={[styles.slotsWrap, { flexDirection: rowDir(isRTL) }]}>
                {slots.map((sl) => (
                  <View key={sl.glass} style={[styles.slotChip, { backgroundColor: k.surface, borderColor: border }]}>
                    <Text style={[styles.slotTime, { color: text }]}>{sl.time}</Text>
                    <Text style={[styles.slotLbl, { color: sub }]}>{slotT[sl.label]}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </Card>

        {/* (e) Défi Ramadan : streak + bouton */}
        <Card variant="raised" style={styles.cardBox}>
          <View style={[styles.secHeadRow, { flexDirection: rowDir(isRTL) }]}>
            <Flame size={18} color={GREEN} />
            <Text style={[styles.secTitle, { color: text, marginBottom: 0, textAlign: txtAlign(isRTL) }]}>{t.challenge}</Text>
          </View>
          <View style={[styles.streakRow, { flexDirection: rowDir(isRTL) }]}>
            <Text style={styles.streakNum}>{streak}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.streakLbl, { color: text, textAlign: txtAlign(isRTL) }]}>{t.streak}</Text>
              <Text style={[styles.streakDays, { color: sub, textAlign: txtAlign(isRTL) }]}>{streak} {t.days}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.fastBtn, { backgroundColor: fastedToday ? (isDark ? '#334155' : k.surfaceSunken) : GREEN, flexDirection: rowDir(isRTL) }, (logging || !email) && { opacity: 0.6 }]}
            onPress={logToday}
            disabled={fastedToday || logging || !email}
          >
            {logging ? <ActivityIndicator color={k.onAccent} /> : (
              <>
                <CheckCircle2 size={18} color={fastedToday ? sub : k.onAccent} />
                <Text style={[styles.fastBtnTxt, { color: fastedToday ? sub : k.onAccent }]}>{fastedToday ? t.fastedDone : t.fastedToday}</Text>
              </>
            )}
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeStyles = (k: Tokens) => StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 18, paddingBottom: 130 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  intro: { fontSize: 13.5, marginTop: 6, lineHeight: 19 },

  cardBox: { borderRadius: 18, borderWidth: 1, padding: 16, marginTop: 16 },
  secTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  secHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  toggleLbl: { flex: 1, fontSize: 14.5, fontWeight: '700' },
  saveBtn: { borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  saveTxt: { color: k.onAccent, fontWeight: '800', fontSize: 14.5 },

  timesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 8 },
  timesTxt: { fontSize: 13, fontWeight: '600' },
  cdLabel: { fontSize: 13, marginTop: 4 },
  cdTimer: { fontSize: 46, fontWeight: '900', marginVertical: 6, fontVariant: ['tabular-nums'] },
  cdCity: { fontSize: 12, fontWeight: '600' },
  sub: { fontSize: 13 },

  mealCard: { borderRadius: 18, borderWidth: 1, padding: 16, marginTop: 16 },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mealName: { fontSize: 15.5, fontWeight: '800' },
  mealKcal: { fontSize: 15, fontWeight: '900' },
  macroRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  macroCell: { alignItems: 'center', flex: 1 },
  macroVal: { fontSize: 15, fontWeight: '800' },
  macroLbl: { fontSize: 11, marginTop: 2 },
  footNote: { fontSize: 11.5, marginTop: 10, lineHeight: 16 },

  splitLegend: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { fontSize: 12, fontWeight: '700' },
  splitItem: { marginTop: 10 },
  splitTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  splitLbl: { fontSize: 13, fontWeight: '700' },
  splitPct: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  splitTrack: { flexDirection: 'row', height: 8, borderRadius: 6, overflow: 'hidden' },
  windowRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, paddingTop: 14, borderTopWidth: 1 },
  windowLbl: { fontSize: 13.5, fontWeight: '800' },
  windowSub: { fontSize: 12, marginTop: 3, lineHeight: 16 },
  guidanceTxt: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  guidanceDisc: { fontSize: 11, lineHeight: 15, fontStyle: 'italic' },

  hydroCount: { fontSize: 30, fontWeight: '900', marginTop: 10, fontVariant: ['tabular-nums'] },
  glassRow: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 8, flexWrap: 'wrap' },
  hydroBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  hydroAdd: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  hydroAddTxt: { color: k.onAccent, fontWeight: '800', fontSize: 14 },
  hydroReset: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', borderWidth: 1.5 },
  hydroResetTxt: { fontWeight: '800', fontSize: 14 },
  slotsLbl: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16 },
  slotsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  slotChip: { borderRadius: 12, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', minWidth: 64 },
  slotTime: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  slotLbl: { fontSize: 10.5, marginTop: 2 },

  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  streakNum: { fontSize: 44, fontWeight: '900', color: k.warning },
  streakLbl: { fontSize: 15, fontWeight: '800' },
  streakDays: { fontSize: 13, marginTop: 2 },
  fastBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  fastBtnTxt: { fontWeight: '800', fontSize: 15 },
});
