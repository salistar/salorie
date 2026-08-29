import ScreenTopBar from '../../components/ScreenTopBar';
import { a11y } from '../../lib/a11y';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Search, Plus, Utensils, ScanBarcode, Star, History, RotateCcw, Flame } from 'lucide-react-native';
import PerfList from '../../components/PerfList';
import { searchFood } from '../../lib/fatsecret';
import { useLogging } from '../../lib/LoggingContext';
import { addNutritionLog } from '../../lib/firebase';
import { getRecentFoods, getFavoriteFoods, addRecentFood, toggleFavoriteFood, QuickFood } from '../../lib/recentFoods';
import { useUser } from '@clerk/clerk-expo';
import { debounce } from 'lodash';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { useTokens, Tokens } from '../../constants/tokens';

/** « Per 100g » (FatSecret, toujours en anglais) → « Pour 100g » / « لكل 100g ».
 *  Seul le préfixe est traduit : la quantité et l'unité viennent de l'API et restent
 *  telles quelles. Motif non reconnu → valeur d'origine, jamais de traduction inventée. */
function localizeServing(serving: string, language: string): string {
  const m = /^Per\s+(.+)$/i.exec(serving.trim());
  if (!m) return serving;
  const prefix = language === 'fr' ? 'Pour' : language === 'ar' ? 'لكل' : 'Per';
  return `${prefix} ${m[1]}`;
}

const TXT: Record<string, {
  title: string;
  searchPlaceholder: string;
  noResults: string;
  keepTyping: string;
  recents: string;
  favorites: string;
  viewed: string;
  frequents: string;
  km: string;
}> = {
  en: {
    title: 'Food Database',
    searchPlaceholder: 'Search food (e.g. Apple, Chicken...)',
    noResults: 'No results found for',
    keepTyping: 'Keep typing to search...',
    recents: 'Recent', favorites: 'Favorites', viewed: 'Recently viewed', frequents: 'Frequent', km: 'km',
  },
  fr: {
    title: 'Base d\'aliments',
    searchPlaceholder: 'Rechercher un aliment (ex. Pomme, Poulet...)',
    noResults: 'Aucun résultat pour',
    keepTyping: 'Continuez à taper pour rechercher...',
    recents: 'Récents', favorites: 'Favoris', viewed: 'Consultés récemment', frequents: 'Fréquents', km: 'km',
  },
  ar: {
    title: 'قاعدة بيانات الأطعمة',
    searchPlaceholder: 'ابحث عن طعام (مثال: تفاح، دجاج...)',
    noResults: 'لا توجد نتائج لـ',
    keepTyping: 'استمر في الكتابة للبحث...',
    recents: 'الأخيرة', favorites: 'المفضلة', viewed: 'شوهدت مؤخراً', frequents: 'الأكثر تكراراً', km: 'كلم',
  },
};

// FEATURE #112 — aliments récemment CONSULTÉS (ouverts vers la fiche détail),
// persistés localement sous une clé unique (indépendante du compte). On garde
// ~10 entrées, dédupliquées, la plus récente en tête. Additif : ne touche ni
// aux favoris ni aux « récents » (re-log 1 tap) existants.
const VIEWED_KEY = '@salorie/food_recents';
const MAX_VIEWED = 10;

type ViewedFood = { food_id: string; food_name: string; food_description: string };

async function readViewedFoods(): Promise<ViewedFood[]> {
  try {
    const raw = await AsyncStorage.getItem(VIEWED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function pushViewedFood(item: any): Promise<void> {
  if (!item?.food_id || !item?.food_name) return;
  try {
    const entry: ViewedFood = {
      food_id: String(item.food_id),
      food_name: String(item.food_name),
      food_description: String(item.food_description || ''),
    };
    const list = await readViewedFoods();
    const next = [entry, ...list.filter((x) => x.food_id !== entry.food_id)].slice(0, MAX_VIEWED);
    await AsyncStorage.setItem(VIEWED_KEY, JSON.stringify(next));
  } catch {}
}

// FEATURE #112 (fréquents) — suivi de FRÉQUENCE d'usage. À chaque aliment
// consulté/ajouté on incrémente un compteur (map food_id -> count) et on garde
// le libellé/description pour pouvoir réafficher la fiche. Additif : clé propre,
// n'altère ni les « consultés » (@salorie/food_recents) ni les favoris/récents.
const FREQ_KEY = '@salorie/food_freq';
const MAX_FREQUENTS = 5;

type FreqEntry = { food_id: string; food_name: string; food_description: string; count: number };
type FreqMap = Record<string, FreqEntry>;

async function readFreqMap(): Promise<FreqMap> {
  try {
    const raw = await AsyncStorage.getItem(FREQ_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map && typeof map === 'object' && !Array.isArray(map) ? (map as FreqMap) : {};
  } catch {
    return {};
  }
}

async function bumpFreqFood(item: any): Promise<void> {
  if (!item?.food_id || !item?.food_name) return;
  try {
    const id = String(item.food_id);
    const map = await readFreqMap();
    const prev = map[id];
    map[id] = {
      food_id: id,
      food_name: String(item.food_name),
      food_description: String(item.food_description || prev?.food_description || ''),
      count: (prev?.count || 0) + 1,
    };
    await AsyncStorage.setItem(FREQ_KEY, JSON.stringify(map));
  } catch {}
}

// Top N par compteur décroissant. Retourne des items compatibles renderItem.
function topFrequents(map: FreqMap, n: number): ViewedFood[] {
  return Object.values(map)
    .filter((e) => e && e.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((e) => ({ food_id: e.food_id, food_name: e.food_name, food_description: e.food_description }));
}

export default function FoodDatabaseScreen() {
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const k = useTokens();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);
  const { user } = useUser();
  const { selectedDate, triggerRefresh } = useLogging();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [recents, setRecents] = useState<QuickFood[]>([]);
  const [favorites, setFavorites] = useState<QuickFood[]>([]);
  // FEATURE #112 — aliments récemment consultés (AsyncStorage, indépendant du compte).
  const [viewed, setViewed] = useState<ViewedFood[]>([]);
  // FEATURE #112 (fréquents) — top aliments par compteur d'usage (AsyncStorage).
  const [frequents, setFrequents] = useState<ViewedFood[]>([]);

  const loadQuick = useCallback(async () => {
    setViewed(await readViewedFoods());
    setFrequents(topFrequents(await readFreqMap(), MAX_FREQUENTS));
    if (!email) return;
    setRecents(await getRecentFoods(email));
    setFavorites(await getFavoriteFoods(email));
  }, [email]);
  useFocusEffect(useCallback(() => { loadQuick(); }, [loadQuick]));

  // Slot cible : si on arrive depuis le « + » d'une section du journal, on respecte
  // le repas tapé (params.slot) ; sinon on déduit du créneau horaire.
  const slotParam = String((useLocalSearchParams() as any)?.slot || '');
  const slotByHour = () => {
    if (['breakfast', 'lunch', 'snack', 'dinner'].includes(slotParam)) return slotParam;
    const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 18 ? 'snack' : 'dinner';
  };

  // Re-log en 1 tap depuis Récents/Favoris.
  const quickLog = async (f: QuickFood) => {
    if (!email) return;
    try {
      await addNutritionLog({ userId: email, type: 'meal', name: f.name, calories: f.calories, protein: f.protein || 0, carbs: f.carbs || 0, fat: f.fat || 0, serving: f.serving, slot: slotByHour(), date: selectedDate } as any);
      await addRecentFood(email, f);
      triggerRefresh();
      router.replace('/(tabs)' as any);
    } catch {}
  };
  const onToggleFav = async (f: QuickFood) => { await toggleFavoriteFood(email, f); loadQuick(); };

  const performSearch = async (text: string) => {
    if (text.length < 3) {
      setResults([]);
      return;
    }
    setLoading(true);
    const data = await searchFood(text);
    setResults(data);
    setLoading(false);
  };

  // PERF #21 — debounce de la recherche : on n'appelle le réseau qu'après une
  // pause de frappe (~300 ms). lodash.debounce annule automatiquement le timer
  // précédent à chaque frappe. La recherche immédiate reste possible via
  // onSubmitEditing (clavier). On garde le debounce STABLE (useCallback [])
  // et on l'annule au démontage pour éviter un setState après unmount.
  const debouncedSearch = useCallback(
    debounce((text: string) => performSearch(text), 300),
    []
  );
  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  const handleSearch = (text: string) => {
    setQuery(text);
    debouncedSearch(text);
  };

  // PERF #19 — parseDescription est une fonction pure de son argument : on la
  // stabilise (useCallback [] deps) pour ne pas recréer une nouvelle référence à
  // chaque render (utile pour les callbacks qui en dépendent).
  const parseDescription = useCallback((desc: string) => {
    // FatSecret desc format: "Per 100g - Calories: 100kcal | Fat: 1.00g | Carbs: 20.00g | Protein: 5.00g"
    const parts = desc.split(' - ');
    const serving = parts[0] || '100g';
    const calsPart = parts[1]?.split(' | ')[0] || '0kcal';
    const cals = parseInt(calsPart.replace('Calories: ', '').replace('kcal', ''));

    // Extract others if needed
    const proteinPart = parts[1]?.split(' | ').find(p => p.startsWith('Protein: ')) || '0g';
    const carbsPart = parts[1]?.split(' | ').find(p => p.startsWith('Carbs: ')) || '0g';
    const fatPart = parts[1]?.split(' | ').find(p => p.startsWith('Fat: ')) || '0g';

    return {
        serving,
        calories: cals,
        protein: parseFloat(proteinPart.replace('Protein: ', '').replace('g', '')),
        carbs: parseFloat(carbsPart.replace('Carbs: ', '').replace('g', '')),
        fat: parseFloat(fatPart.replace('Fat: ', '').replace('g', '')),
    };
  }, []);

  // PERF #19 — handleAddFood stabilisé : ne dépend que de parseDescription
  // (elle-même stable). Évite de recréer la closure à chaque render, ce qui
  // permet à renderItem de rester référentiellement stable.
  const handleAddFood = useCallback((item: any) => {
    // FEATURE #112 — mémorise l'aliment consulté + incrémente sa fréquence
    // (fire-and-forget, n'altère pas la nav).
    pushViewedFood(item);
    bumpFreqFood(item);
    loadQuick();
    const { serving, calories, protein, carbs, fat } = parseDescription(item.food_description);

    router.push({
      pathname: '/log-food-details' as any,
      params: {
        name: item.food_name,
        calories,
        protein,
        carbs,
        fat,
        serving,
      }
    });
  }, [parseDescription, loadQuick]);

  // PERF #19 — renderItem stabilisé via useCallback (deps : isRTL, isDark,
  // parseDescription, handleAddFood). Une référence stable évite que la liste
  // re-render inutilement toutes ses lignes quand un state non lié change.
  const renderItem = useCallback(({ item }: { item: any }) => {
    const { serving, calories } = parseDescription(item.food_description);

    return (
      <TouchableOpacity
        style={[styles.card, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: k.surface, borderColor: k.border }]}
        onPress={() => handleAddFood(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.cardLeft, isRTL && { marginRight: 0, marginLeft: 12 }]}>
          <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.foodName, { color: isDark ? '#fff' : k.text, textAlign: isRTL ? 'right' : 'left' }]}>{item.food_name}</Text>
          <Text style={[styles.foodInfo, { color: isDark ? '#9BA1A6' : k.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{localizeServing(serving, language)} • {calories} kcal</Text>
        </View>
        <View style={styles.addBtn}>
          <Plus size={24} color={k.surface} strokeWidth={3} />
        </View>
      </TouchableOpacity>
    );
  }, [isRTL, isDark, parseDescription, handleAddFood, language]);

  // PERF #19 — keyExtractor stabilisé (sans dépendance) pour une identité stable.
  const keyExtractor = useCallback((item: any) => item.food_id.toString(), []);

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safeArea, { backgroundColor: isDark ? '#0f1419' : k.surface }]}>
      <ScreenTopBar />
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retour')} style={[styles.backBtn, { backgroundColor: k.surfaceSunken }]} onPress={() => router.back()}>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}><ArrowLeft size={28} color={isDark ? '#fff' : k.text} strokeWidth={2.5} /></View>
        </TouchableOpacity>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: isDark ? '#fff' : k.text, textAlign: isRTL ? 'right' : 'left' }]}>{t.title}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('scanner')} style={styles.scanBtn} onPress={() => router.push('/scan-barcode' as any)}>
          <ScanBarcode size={24} color={k.accent} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Search size={20} color={isDark ? '#9BA1A6' : k.textMuted} style={[styles.searchIcon, isRTL ? { left: undefined, right: 36 } : undefined]} />
        <TextInput
          style={[styles.input, { backgroundColor: k.surfaceSunken, color: isDark ? '#fff' : k.text, borderColor: k.border, textAlign: isRTL ? 'right' : 'left', paddingLeft: isRTL ? 48 : 52, paddingRight: isRTL ? 52 : 48 }]}
          placeholder={t.searchPlaceholder}
          value={query}
          onChangeText={handleSearch}
          placeholderTextColor={isDark ? '#9BA1A6' : k.textMuted}
          returnKeyType="search"
          onSubmitEditing={() => performSearch(query)}
        />
        {loading && <ActivityIndicator size="small" color={k.accent} style={[styles.loader, isRTL ? { right: undefined, left: 36 } : undefined]} />}
      </View>

      {/* La liste se re-rend à CHAQUE frappe dans la recherche sur 653+ aliments : c'est
          l'écran où la virtualisation compte le plus. Voir components/PerfList.tsx pour
          la raison du passage de FlashList à FlatList. */}
      <PerfList
        data={results}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={() => (
          query.length >= 1 ? null : (
            <View>
              {frequents.length > 0 && (
                <>
                  <View style={[styles.quickHead, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Flame size={16} color="#ef4444" /><Text style={[styles.quickTitle, { color: isDark ? '#fff' : k.text }]}>{t.frequents}</Text>
                  </View>
                  {frequents.map((f) => (
                    <React.Fragment key={`freq${f.food_id}`}>{renderItem({ item: f })}</React.Fragment>
                  ))}
                </>
              )}
              {viewed.length > 0 && (
                <>
                  <View style={[styles.quickHead, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <RotateCcw size={16} color={k.accent} /><Text style={[styles.quickTitle, { color: isDark ? '#fff' : k.text }]}>{t.viewed}</Text>
                  </View>
                  {viewed.map((f) => (
                    <React.Fragment key={`viewed${f.food_id}`}>{renderItem({ item: f })}</React.Fragment>
                  ))}
                </>
              )}
              {favorites.length > 0 && (
                <>
                  <View style={[styles.quickHead, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Star size={16} color="#f59e0b" fill="#f59e0b" /><Text style={[styles.quickTitle, { color: isDark ? '#fff' : k.text }]}>{t.favorites}</Text>
                  </View>
                  {favorites.map((f, i) => (
                    <QuickRow key={`fav${i}`} f={f} fav onLog={quickLog} onFav={onToggleFav} isDark={isDark} isRTL={isRTL} km={t.km} language={language} />
                  ))}
                </>
              )}
              {recents.length > 0 && (
                <>
                  <View style={[styles.quickHead, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <History size={16} color={k.accent} /><Text style={[styles.quickTitle, { color: isDark ? '#fff' : k.text }]}>{t.recents}</Text>
                  </View>
                  {recents.map((f, i) => (
                    <QuickRow key={`rec${i}`} f={f} fav={favorites.some((x) => x.name === f.name)} onLog={quickLog} onFav={onToggleFav} isDark={isDark} isRTL={isRTL} km={t.km} language={language} />
                  ))}
                </>
              )}
            </View>
          )
        )}
        ListEmptyComponent={() => (
          !loading && query.length >= 3 ? (
            <View style={styles.emptyState}>
              <Utensils size={48} color={k.border} />
              <Text style={[styles.emptyText, { color: isDark ? '#9BA1A6' : k.textMuted }]}>{t.noResults} {String.fromCharCode(8220)}{query}{String.fromCharCode(8221)}</Text>
            </View>
          ) : query.length > 0 && query.length < 3 ? (
             <View style={styles.emptyState}>
              <Text style={[styles.hintText, { color: isDark ? '#9BA1A6' : k.textFaint }]}>{t.keepTyping}</Text>
            </View>
          ) : null
        )}
      />
    </SafeAreaView>
  );
}

// Ligne Récent/Favori : tap = re-log 1 tap ; étoile = (dé)favoriser.
function QuickRow({ f, fav, onLog, onFav, isDark, isRTL, km, language }: any) {
  // Ce composant recevait `isDark` en propriete et n avait acces a aucune
  // couleur : il lit desormais les jetons lui-meme, comme son parent.
  const k = useTokens();
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => onLog(f)}
      style={[qrStyles.row, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: k.surface, borderColor: k.border }]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('favori')} onPress={() => onFav(f)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Star size={20} color="#f59e0b" fill={fav ? '#f59e0b' : 'transparent'} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', color: isDark ? '#fff' : k.text, textAlign: isRTL ? 'right' : 'left' }}>{f.name}</Text>
        <Text style={{ fontSize: 12.5, color: isDark ? '#9BA1A6' : k.textMuted, textAlign: isRTL ? 'right' : 'left' }}>{f.serving ? `${localizeServing(f.serving, language)} • ` : ''}{Math.round(f.calories)} {km === 'كلم' ? 'سعرة' : 'kcal'}</Text>
      </View>
      <View style={[qrStyles.relog, { backgroundColor: k.accent }]}><RotateCcw size={18} color="#fff" strokeWidth={2.5} /></View>
    </TouchableOpacity>
  );
}
const qrStyles = StyleSheet.create({
  row: { alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginHorizontal: 20, marginBottom: 10 },
  relog: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: k.surface,
  },
  quickHead: { alignItems: 'center', gap: 8, paddingHorizontal: 20, marginTop: 4, marginBottom: 10 },
  quickTitle: { fontSize: 16, fontWeight: '800' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 16,
    marginBottom: 20,
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    color: k.text,
  },
  scanBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: k.accentSoft,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: k.surfaceSunken,
  },
  searchContainer: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: 36,
    zIndex: 1,
  },
  input: {
    flex: 1,
    height: 56,
    backgroundColor: k.surfaceSunken,
    borderRadius: 16,
    paddingLeft: 52,
    paddingRight: 48,
    fontSize: 16,
    fontWeight: '600',
    color: k.text,
    borderWidth: 1.5,
    borderColor: k.border,
  },
  loader: {
    position: 'absolute',
    right: 36,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    backgroundColor: k.surface,
    borderRadius: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: k.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardLeft: {
    flex: 1,
    marginRight: 12,
  },
  foodName: {
    fontSize: 17,
    fontWeight: '700',
    color: k.text,
    marginBottom: 4,
  },
  foodInfo: {
    fontSize: 14,
    color: k.textMuted,
    fontWeight: '600',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: k.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: k.isDark ? 'transparent' : k.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  emptyState: {
    marginTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    color: k.textMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
  hintText: {
    fontSize: 15,
    color: k.textFaint,
    fontWeight: '500',
  },
});
