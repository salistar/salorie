import ScreenTopBar from '../../components/ScreenTopBar';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Search, Plus, Utensils, ScanBarcode } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { searchFood } from '../../lib/fatsecret';
import { useLogging } from '../../lib/LoggingContext';
import { addNutritionLog } from '../../lib/firebase';
import { useUser } from '@clerk/clerk-expo';
import { debounce } from 'lodash';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';

const TXT: Record<string, {
  title: string;
  searchPlaceholder: string;
  noResults: string;
  keepTyping: string;
}> = {
  en: {
    title: 'Food Database',
    searchPlaceholder: 'Search food (e.g. Apple, Chicken...)',
    noResults: 'No results found for',
    keepTyping: 'Keep typing to search...',
  },
  fr: {
    title: 'Base d\'aliments',
    searchPlaceholder: 'Rechercher un aliment (ex. Pomme, Poulet...)',
    noResults: 'Aucun résultat pour',
    keepTyping: 'Continuez à taper pour rechercher...',
  },
  ar: {
    title: 'قاعدة بيانات الأطعمة',
    searchPlaceholder: 'ابحث عن طعام (مثال: تفاح، دجاج...)',
    noResults: 'لا توجد نتائج لـ',
    keepTyping: 'استمر في الكتابة للبحث...',
  },
};

export default function FoodDatabaseScreen() {
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const { user } = useUser();
  const { selectedDate, triggerRefresh } = useLogging();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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

  // Long debounce (OpenFoodFacts limits search to ~10 req/min and BLOCKS
  // search-as-you-type). We wait until the user pauses typing, and also expose
  // an immediate search on keyboard submit.
  const debouncedSearch = useCallback(
    debounce((text: string) => performSearch(text), 1100),
    []
  );

  const handleSearch = (text: string) => {
    setQuery(text);
    debouncedSearch(text);
  };

  const parseDescription = (desc: string) => {
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
  };

  const handleAddFood = (item: any) => {
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
  };

  const renderItem = ({ item }: { item: any }) => {
    const { serving, calories } = parseDescription(item.food_description);

    return (
      <TouchableOpacity
        style={[styles.card, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: isDark ? Colors.dark.card : Colors.light.white, borderColor: isDark ? Colors.dark.gray[200] : Colors.light.gray[100] }]}
        onPress={() => handleAddFood(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.cardLeft, isRTL && { marginRight: 0, marginLeft: 12 }]}>
          <Text style={[styles.foodName, { color: isDark ? '#fff' : Colors.light.gray[900], textAlign: isRTL ? 'right' : 'left' }]}>{item.food_name}</Text>
          <Text style={[styles.foodInfo, { color: isDark ? '#9BA1A6' : Colors.light.gray[400], textAlign: isRTL ? 'right' : 'left' }]}>{serving} • {calories} kcal</Text>
        </View>
        <View style={styles.addBtn}>
          <Plus size={24} color={Colors.light.white} strokeWidth={3} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isDark ? '#000' : Colors.light.white }]}>
      <ScreenTopBar />
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50] }]} onPress={() => router.back()}>
          <ArrowLeft size={28} color={isDark ? '#fff' : Colors.light.gray[900]} strokeWidth={2.5} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </TouchableOpacity>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: isDark ? '#fff' : Colors.light.gray[900], textAlign: isRTL ? 'right' : 'left' }]}>{t.title}</Text>
        <TouchableOpacity style={styles.scanBtn} onPress={() => router.push('/scan-barcode' as any)}>
          <ScanBarcode size={24} color={Colors.light.primary} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Search size={20} color={isDark ? '#9BA1A6' : Colors.light.gray[400]} style={[styles.searchIcon, isRTL ? { left: undefined, right: 36 } : undefined]} />
        <TextInput
          style={[styles.input, { backgroundColor: isDark ? Colors.dark.card : Colors.light.gray[50], color: isDark ? '#fff' : Colors.light.gray[900], borderColor: isDark ? Colors.dark.gray[200] : Colors.light.gray[100], textAlign: isRTL ? 'right' : 'left', paddingLeft: isRTL ? 48 : 52, paddingRight: isRTL ? 52 : 48 }]}
          placeholder={t.searchPlaceholder}
          value={query}
          onChangeText={handleSearch}
          placeholderTextColor={isDark ? '#9BA1A6' : Colors.light.gray[400]}
          returnKeyType="search"
          onSubmitEditing={() => performSearch(query)}
        />
        {loading && <ActivityIndicator size="small" color={Colors.light.primary} style={[styles.loader, isRTL ? { right: undefined, left: 36 } : undefined]} />}
      </View>

      <FlatList
        data={results}
        renderItem={renderItem}
        keyExtractor={(item) => item.food_id.toString()}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={() => (
          !loading && query.length >= 3 ? (
            <View style={styles.emptyState}>
              <Utensils size={48} color={isDark ? Colors.dark.gray[200] : Colors.light.gray[200]} />
              <Text style={[styles.emptyText, { color: isDark ? '#9BA1A6' : Colors.light.gray[400] }]}>{t.noResults} "{query}"</Text>
            </View>
          ) : query.length > 0 && query.length < 3 ? (
             <View style={styles.emptyState}>
              <Text style={[styles.hintText, { color: isDark ? '#9BA1A6' : Colors.light.gray[300] }]}>{t.keepTyping}</Text>
            </View>
          ) : null
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.white,
  },
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
    color: Colors.light.gray[900],
  },
  scanBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.primaryLight,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.gray[50],
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
    backgroundColor: Colors.light.gray[50],
    borderRadius: 16,
    paddingLeft: 52,
    paddingRight: 48,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.gray[900],
    borderWidth: 1.5,
    borderColor: Colors.light.gray[100],
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
    backgroundColor: Colors.light.white,
    borderRadius: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.light.gray[100],
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
    color: Colors.light.gray[900],
    marginBottom: 4,
  },
  foodInfo: {
    fontSize: 14,
    color: Colors.light.gray[400],
    fontWeight: '600',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.light.primary,
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
    color: Colors.light.gray[400],
    fontWeight: '600',
    textAlign: 'center',
  },
  hintText: {
    fontSize: 15,
    color: Colors.light.gray[300],
    fontWeight: '500',
  },
});
