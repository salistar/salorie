// Barcode scanner — scanne un code-barres produit (EAN/UPC) et recupere les
// infos nutritionnelles via OpenFoodFacts (API publique, gratuite, sans cle),
// puis pre-remplit l'ecran log-food-details. Logging produit ultra-rapide.
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BrandOverlay from '../../components/BrandOverlay';
import { ArrowLeft, ScanBarcode, RefreshCw, PlusCircle, Camera, Sparkles, AlertTriangle, Ban, History } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';
import { radius, elevation } from '../../constants/theme';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { getCustomProduct } from '../../lib/aiStore';
import { computeHealthScore, VERDICT_TXT, HealthScore } from '../../lib/healthScore';
import { offToFood, edible, type OffProduct } from '../../lib/objective/offTags';
import { scoreFood, type FoodScore } from '../../lib/objective/scoring';
import { buildObjectiveContext } from '../../lib/objective/buildContext';
import { lookupProductByCode } from '../../lib/fatsecret';
import { fetchAlternatives, submitPendingProduct, type AlternativeProduct } from '../../lib/objective/api';
import { useNutritionData } from '../../hooks/useNutritionData';

// Verdict OBJECTIF (couleur + emoji + libellé i18n).
const OBJ_COLOR: Record<FoodScore['verdict'], string> = { great: '#16A34A', ok: '#D97706', avoid: '#DC2626' };
const OBJ_EMOJI: Record<FoodScore['verdict'], string> = { great: '✅', ok: '⚠️', avoid: '🚫' };

// Textes trilingues pour le verdict objectif + produit inconnu + non comestible.
const OBJ_TXT: any = {
  en: {
    verdict: { great: 'On point for your goal', ok: 'OK for your goal', avoid: 'Avoid for your goal' },
    why: 'Why', goalFit: 'goal fit', nutrition: 'Nutrition / 100 g',
    kcal: 'Calories', protein: 'Protein', carbs: 'Carbs', sugars: 'of which sugars', fat: 'Fat', sat: 'of which saturates', salt: 'Salt', sodium: 'Sodium', fiber: 'Fibre',
    alternatives: 'Better alternatives', altLoading: 'Finding alternatives…', altNone: 'No better alternative found.',
    notEdible: "This product isn't edible", notEdibleSub: "It has no nutrition data or isn't a food item.",
    unknownTitle: 'Unknown product — add it', unknownSub: 'Snap the nutrition label so we can add it to the database.',
    snapLabel: 'Photo of the label', badPhoto: 'Photo hard to read — retake it clearly.',
    sending: 'Sending…', sent: 'Sent for review — thanks!', sendFail: 'Could not send. Try again.', retake: 'Retake', send: 'Send for review',
  },
  fr: {
    verdict: { great: 'Idéal pour ton objectif', ok: 'OK pour ton objectif', avoid: 'À éviter pour ton objectif' },
    why: 'Pourquoi', goalFit: "adéquation à l'objectif", nutrition: 'Nutrition / 100 g',
    kcal: 'Calories', protein: 'Protéines', carbs: 'Glucides', sugars: 'dont sucres', fat: 'Lipides', sat: 'dont saturés', salt: 'Sel', sodium: 'Sodium', fiber: 'Fibres',
    alternatives: 'Meilleures alternatives', altLoading: "Recherche d'alternatives…", altNone: 'Aucune meilleure alternative trouvée.',
    notEdible: 'Ce produit ne se mange pas', notEdibleSub: "Il n'a pas de valeurs nutritionnelles ou n'est pas un aliment.",
    unknownTitle: 'Produit inconnu — ajoute-le', unknownSub: "Photographie l'étiquette nutritionnelle pour l'ajouter à la base.",
    snapLabel: "Photo de l'étiquette", badPhoto: 'Photo peu lisible, reprends-la clairement.',
    sending: 'Envoi…', sent: 'Envoyé à validation — merci !', sendFail: "Échec de l'envoi. Réessaie.", retake: 'Reprendre', send: 'Envoyer à validation',
  },
  ar: {
    verdict: { great: 'مثالي لهدفك', ok: 'مقبول لهدفك', avoid: 'تجنّبه لهدفك' },
    why: 'لماذا', goalFit: 'ملاءمة الهدف', nutrition: 'القيم الغذائية / 100 غ',
    kcal: 'السعرات', protein: 'البروتين', carbs: 'الكربوهيدرات', sugars: 'منها سكريات', fat: 'الدهون', sat: 'منها مشبعة', salt: 'الملح', sodium: 'الصوديوم', fiber: 'الألياف',
    alternatives: 'بدائل أفضل', altLoading: 'البحث عن بدائل…', altNone: 'لم يُعثر على بديل أفضل.',
    notEdible: 'هذا المنتج غير صالح للأكل', notEdibleSub: 'لا يحتوي على قيم غذائية أو ليس طعاماً.',
    unknownTitle: 'منتج غير معروف — أضِفه', unknownSub: 'صوّر الملصق الغذائي لإضافته إلى قاعدة البيانات.',
    snapLabel: 'صورة الملصق', badPhoto: 'الصورة غير واضحة، أعد التقاطها بوضوح.',
    sending: 'جارٍ الإرسال…', sent: 'أُرسل للمراجعة — شكراً!', sendFail: 'فشل الإرسال. حاول مجدداً.', retake: 'إعادة الالتقاط', send: 'إرسال للمراجعة',
  },
};

type Found = {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  image?: string;
  health?: HealthScore;
  desc?: string; // qualités/risques pour la description au log
  // Verdict OBJECTIF (perso : objectif du jour + régime + conditions).
  objective?: FoodScore | null;
  // Nutriments complets /100g (pour la liste détaillée).
  nutriments?: Record<string, any>;
  // Tags dérivés (offToFood) — passés au backend pour les alternatives.
  food?: { name: string; kcal: number; protein: number; carbs: number; fat: number; tags?: string[] };
  // Allergènes déclarés (OFF allergens_tags / allergens) — libellés nettoyés.
  allergens?: string[];
};

// Extrait les libellés d'allergènes d'un produit OFF (allergens_tags prioritaire,
// sinon champ texte `allergens`). Nettoie le préfixe langue ('en:milk' → 'Milk'),
// remplace tirets/underscores par des espaces, dédupe, capitalise. Renvoie [].
function extractAllergens(p: OffProduct): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const clean = String(raw || '')
      .replace(/^[a-z]{2}:/i, '') // préfixe langue OFF ('en:', 'fr:'…)
      .replace(/[-_]+/g, ' ')
      .trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean.charAt(0).toUpperCase() + clean.slice(1));
  };
  if (Array.isArray(p.allergens_tags) && p.allergens_tags.length) {
    p.allergens_tags.forEach(push);
  } else if (typeof p.allergens === 'string' && p.allergens.trim()) {
    p.allergens.split(',').forEach(push);
  }
  return out;
}

// --- Cache des produits scannés récemment (persisté AsyncStorage) ---
// Persiste les derniers produits résolus (barcode + nom + kcal) pour un re-scan
// instantané. Dédup par barcode, plus récent en tête, garde RECENTS_MAX entrées.
const RECENTS_KEY = '@salorie/barcode_recents';
const RECENTS_MAX = 15;

type RecentProduct = { barcode: string; name: string; kcal: string };

async function loadRecents(): Promise<RecentProduct[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // Garde-fou : on ne conserve que les entrées bien formées.
    return arr
      .filter((r: any) => r && typeof r.barcode === 'string' && r.barcode)
      .map((r: any) => ({ barcode: String(r.barcode), name: String(r.name || ''), kcal: String(r.kcal ?? '') }))
      .slice(0, RECENTS_MAX);
  } catch {
    return [];
  }
}

// Ajoute (ou remonte) un produit en tête, dédupe par barcode, tronque à RECENTS_MAX.
// Best-effort : renvoie la nouvelle liste (pour maj de l'état) même si l'écriture échoue.
async function pushRecent(prev: RecentProduct[], item: RecentProduct): Promise<RecentProduct[]> {
  const barcode = String(item.barcode || '').trim();
  if (!barcode) return prev;
  const entry: RecentProduct = { barcode, name: String(item.name || ''), kcal: String(item.kcal ?? '') };
  const next = [entry, ...prev.filter((r) => r.barcode !== barcode)].slice(0, RECENTS_MAX);
  try {
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch { /* écriture best-effort */ }
  return next;
}

// Rendu d'une valeur nutritionnelle /100g (ou '—' si absente).
function fmt(v: any, unit: string): string {
  if (v == null || v === '' || isNaN(Number(v))) return '—';
  return `${Math.round(Number(v) * 10) / 10} ${unit}`;
}

// Qualités + risques (note santé) à partir des nutriments /100g — déterministe, on-device.
function qualRiskDesc(n: any, lang: string): string {
  const L: any = {
    fr: { q: 'Qualités', r: 'Risques', prot: 'riche en protéines', fiber: 'source de fibres', lowsug: 'peu sucré', lowfat: 'pauvre en gras',
          hisug: 'riche en sucres', hisat: 'riche en graisses saturées', salt: 'salé', hical: 'calorique', watch: 'à consommer avec modération', good: 'profil équilibré' },
    en: { q: 'Strengths', r: 'Watch out', prot: 'high in protein', fiber: 'source of fiber', lowsug: 'low sugar', lowfat: 'low fat',
          hisug: 'high in sugar', hisat: 'high in saturated fat', salt: 'salty', hical: 'high calorie', watch: 'best in moderation', good: 'balanced profile' },
    ar: { q: 'الإيجابيات', r: 'تنبيهات', prot: 'غني بالبروتين', fiber: 'مصدر للألياف', lowsug: 'قليل السكر', lowfat: 'قليل الدهون',
          hisug: 'غني بالسكر', hisat: 'دهون مشبعة عالية', salt: 'مالح', hical: 'سعرات عالية', watch: 'باعتدال', good: 'متوازن' },
  };
  const x = L[lang] || L.en;
  const num = (v: any) => (v == null || isNaN(Number(v)) ? null : Number(v));
  const prot = num(n.proteins_100g), fib = num(n.fiber_100g), sug = num(n.sugars_100g),
        sat = num(n['saturated-fat_100g']), salt = num(n.salt_100g), kcal = num(n['energy-kcal_100g']);
  const Q: string[] = [], R: string[] = [];
  if (prot != null && prot >= 8) Q.push(x.prot);
  if (fib != null && fib >= 3) Q.push(x.fiber);
  if (sug != null && sug <= 5) Q.push(x.lowsug);
  if (sat != null && sat >= 5) R.push(x.hisat);
  if (sug != null && sug >= 15) R.push(x.hisug);
  if (salt != null && salt >= 1.2) R.push(x.salt);
  if (kcal != null && kcal >= 350) R.push(x.hical);
  if (!Q.length) Q.push(x.good);
  if (!R.length) R.push(x.watch);
  return `✅ ${x.q}: ${Q.join(' · ')}\n⚠️ ${x.r}: ${R.join(' · ')}`;
}

export default function ScanBarcodeScreen() {
  const { t, language } = useTranslation() as any;
  const registerLabel = language === 'fr' ? 'Enregistrer ce produit' : language === 'ar' ? 'سجّل هذا المنتج' : 'Register this product';
  const recentsLabel = language === 'fr' ? 'Scannés récemment' : language === 'ar' ? 'مُسح مؤخراً' : 'Recently scanned';
  const allergensLabel = language === 'fr' ? 'Allergènes' : language === 'ar' ? 'مسببات الحساسية' : 'Allergens';
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const card = isDark ? '#1e293b' : '#ffffff';
  const textCol = isDark ? '#f1f5f9' : Colors.light.gray[900];
  const subCol = isDark ? '#94a3b8' : Colors.light.gray[500];
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<'scanning' | 'loading' | 'found' | 'notedible' | 'notfound'>('scanning');
  const [found, setFound] = useState<Found | null>(null);
  const [code, setCode] = useState('');
  const lock = useRef(false);
  // Contexte objectif construit dans lookup() (1 getDoc Firestore + 1 lecture
  // AsyncStorage) — mémorisé pour être réutilisé par loadAlternatives() au lieu
  // de le reconstruire. Réinitialisé à chaque nouveau scan (rescan).
  const objCtxRef = useRef<Awaited<ReturnType<typeof buildObjectiveContext>> | null>(null);
  const ox = OBJ_TXT[language] || OBJ_TXT.en;

  const { user } = useUser();
  const today = new Date().toISOString().slice(0, 10);
  const nutrition: any = useNutritionData(today);

  // Alternatives (verdict=avoid) : chargées à la demande.
  const [alts, setAlts] = useState<AlternativeProduct[] | null>(null);
  const [altsLoading, setAltsLoading] = useState(false);
  // Produit inconnu : photo d'étiquette + envoi à validation.
  const [pendingImg, setPendingImg] = useState<string | null>(null);
  const [pendingState, setPendingState] = useState<'idle' | 'sending' | 'sent' | 'error' | 'badphoto'>('idle');

  // Cache local des produits scannés récemment (barcode + nom + kcal). Le ref suit
  // l'état pour que lookup() lise toujours la dernière liste sans dépendre d'elle.
  const [recents, setRecents] = useState<RecentProduct[]>([]);
  const recentsRef = useRef<RecentProduct[]>([]);
  useEffect(() => { recentsRef.current = recents; }, [recents]);
  useEffect(() => { loadRecents().then((r) => setRecents(r)).catch(() => {}); }, []);

  // Branche l'ajout au cache là où un produit est résolu avec succès (best-effort,
  // n'altère jamais le flux de scan/lookup). Dédup + persistance dans pushRecent().
  const rememberRecent = useCallback((barcode: string, name: string, kcal: string) => {
    pushRecent(recentsRef.current, { barcode, name, kcal })
      .then((next) => setRecents(next))
      .catch(() => {});
  }, []);

  const lookup = useCallback(async (barcode: string) => {
    setStatus('loading');
    setCode(barcode);
    try {
      // 1) Community custom products DB first (user-contributed barcodes).
      const custom = await getCustomProduct(barcode);
      if (custom) {
        const customName = [custom.name, custom.brand].filter(Boolean).join(' · ');
        setFound({
          name: customName,
          calories: custom.calories, protein: custom.protein, carbs: custom.carbs, fat: custom.fat,
          image: custom.productImage,
          health: computeHealthScore({ kcal: Number(custom.calories), protein: Number(custom.protein), carbs: Number(custom.carbs), fat: Number(custom.fat) }),
        });
        setStatus('found');
        rememberRecent(barcode, customName, custom.calories);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        return;
      }
      // Lookup produit OFF CACHÉ (off_prod_full_{code}, TTL 30 j) → re-scanner le
      // même produit ne retape plus le réseau.
      const product = await lookupProductByCode(barcode);
      if (!product) {
        setStatus('notfound');
        return;
      }
      const p: OffProduct = product;
      const n = p.nutriments || {};

      // Produit non comestible (hygiène, cosmétique, sans kcal…) → message clair.
      if (!edible(p)) {
        setFound({
          name: [p.product_name, p.brands].filter(Boolean).join(' · ') || `Product ${barcode}`,
          calories: '0', protein: '0', carbs: '0', fat: '0', image: p.image_front_small_url,
        });
        setStatus('notedible');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        return;
      }

      const num = (v: any) => (v == null || isNaN(Number(v)) ? '0' : String(Math.round(Number(v) * 10) / 10));
      // Score santé calculé ON-DEVICE (hors-ligne) à partir des nutriments OFF.
      const health = computeHealthScore({
        kcal: Number(n['energy-kcal_100g']), protein: Number(n.proteins_100g),
        carbs: Number(n.carbohydrates_100g), fat: Number(n.fat_100g),
        sugars: n.sugars_100g, satFat: n['saturated-fat_100g'],
        salt: n.salt_100g, sodium: n.sodium_100g, fiber: n.fiber_100g,
      });

      // Verdict OBJECTIF perso : offToFood (macros + tags seuils) → scoreFood
      // avec le contexte du jour (objectif + régime + conditions). Best-effort.
      const food = offToFood(p);
      let objective: FoodScore | null = null;
      try {
        const email = user?.primaryEmailAddress?.emailAddress || '';
        const ctx = await buildObjectiveContext(email, user?.id, today, nutrition);
        objCtxRef.current = ctx; // mémorisé pour loadAlternatives() (évite 1 getDoc + 1 AsyncStorage)
        objective = scoreFood(food, ctx);
      } catch { /* pas de verdict objectif si le contexte échoue */ }

      const foundName = [p.product_name, p.brands].filter(Boolean).join(' · ') || `Product ${barcode}`;
      const foundKcal = num(n['energy-kcal_100g']);
      setFound({
        name: foundName,
        calories: foundKcal,
        protein: num(n.proteins_100g),
        carbs: num(n.carbohydrates_100g),
        fat: num(n.fat_100g),
        image: p.image_front_small_url,
        health,
        desc: qualRiskDesc(n, language),
        objective,
        nutriments: n,
        food,
        allergens: extractAllergens(p),
      });
      setStatus('found');
      rememberRecent(barcode, foundName, foundKcal);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      setStatus('notfound');
    }
  }, [user?.primaryEmailAddress?.emailAddress, user?.id, today, nutrition, rememberRecent]);

  const onScanned = useCallback(({ data }: { data: string }) => {
    if (lock.current) return;
    lock.current = true;
    lookup(data);
  }, [lookup]);

  // Code transmis par le scanner unifié (caméra du bouton +) → on fait la
  // recherche OFF tout de suite, sans re-scanner.
  const { code: initialCode } = useLocalSearchParams<{ code?: string }>();
  useEffect(() => {
    if (initialCode && !lock.current) {
      lock.current = true;
      lookup(String(initialCode));
    }
  }, [initialCode, lookup]);

  const rescan = () => {
    lock.current = false; setFound(null); setStatus('scanning');
    setAlts(null); setAltsLoading(false); setPendingImg(null); setPendingState('idle');
    objCtxRef.current = null; // nouveau scan → oublie le contexte objectif mémorisé
  };

  // Re-affiche un produit du cache via le même flux existant (lookup → OFF cache).
  const openRecent = useCallback((barcode: string) => {
    if (lock.current) return;
    lock.current = true;
    objCtxRef.current = null;
    Haptics.selectionAsync().catch(() => {});
    lookup(barcode);
  }, [lookup]);

  // Charge jusqu'à 3 alternatives mieux notées (verdict=avoid) via le backend.
  const loadAlternatives = async () => {
    if (!found?.food) return;
    setAltsLoading(true);
    try {
      // Réutilise le contexte objectif déjà construit par lookup() (mêmes args) ;
      // ne le reconstruit (getDoc + AsyncStorage) que s'il manque.
      const ctx = objCtxRef.current
        ?? await buildObjectiveContext(user?.primaryEmailAddress?.emailAddress || '', user?.id, today, nutrition);
      const list = await fetchAlternatives(code, ctx);
      setAlts(list);
    } catch {
      setAlts([]);
    } finally {
      setAltsLoading(false);
    }
  };

  // Produit inconnu : capture/choix d'une photo d'étiquette (détecte photo illisible).
  const captureLabel = async () => {
    setPendingState('idle');
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true });
      const asset = res.assets?.[0];
      if (res.canceled || !asset?.base64) return;
      // Détecte une mauvaise photo : base64 trop petit (<15 Ko) ou dimension faible.
      const bytes = Math.floor((asset.base64.length * 3) / 4);
      const tooSmall = bytes < 15 * 1024;
      const tinyDim = (asset.width && asset.width < 320) || (asset.height && asset.height < 320);
      if (tooSmall || tinyDim) {
        setPendingImg(null);
        setPendingState('badphoto');
        return;
      }
      setPendingImg(asset.base64);
    } catch { /* annulé / caméra indisponible */ }
  };

  // Envoie le produit inconnu (photo étiquette) à la file de validation.
  const sendPending = async () => {
    if (!pendingImg) return;
    setPendingState('sending');
    try {
      await submitPendingProduct({ barcode: code, imageBase64: pendingImg, name: '' });
      setPendingState('sent');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      setPendingState('error');
    }
  };

  const logIt = () => {
    if (!found) return;
    router.replace({
      pathname: '/log-food-details' as any,
      params: {
        name: found.name,
        calories: found.calories,
        protein: found.protein,
        carbs: found.carbs,
        fat: found.fat,
        serving: '100 g',
        description: found.desc || '',
        // Note santé → persistée sur le repas loggé.
        ...(found.health ? {
          healthGrade: found.health.grade,
          healthScore: String(found.health.score),
          healthVerdict: (VERDICT_TXT[language] || VERDICT_TXT.en)[found.health.verdict],
          healthColor: found.health.color,
        } : {}),
      },
    });
  };

  // --- Permission gate ---
  if (!permission) return <View style={styles.black} />;
  if (!permission.granted) {
    return (
      <View style={[styles.permWrap, isDark && { backgroundColor: '#0f172a' }]}>
        <ScanBarcode size={56} color={isDark ? Colors.dark.primary : Colors.light.primary} />
        <Text style={[styles.permTitle, { color: textCol }]}>{t('barcode.perm_title')}</Text>
        <Text style={[styles.permText, { color: subCol }]}>{t('barcode.perm_text')}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>{t('barcode.allow')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()}><Text style={[styles.cancelText, { color: subCol }]}>{t('barcode.cancel')}</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.black}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
        onBarcodeScanned={status === 'scanning' ? onScanned : undefined}
      />
      {/* La pastille marque EST le titre (plus de chevauchement logo/texte). */}
      <BrandOverlay top={46} />

      {/* Top bar : retour à gauche, marque au centre */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ width: 40 }} />
      </View>

      {/* Scan window — coins verts + chip formats */}
      {status === 'scanning' && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.scanWindow}>
            <View style={[styles.corner, styles.cTL]} />
            <View style={[styles.corner, styles.cTR]} />
            <View style={[styles.corner, styles.cBL]} />
            <View style={[styles.corner, styles.cBR]} />
          </View>
          <View style={styles.formatChip}><Text style={styles.formatTxt}>EAN-13 · EAN-8 · UPC</Text></View>
          <Text style={styles.hint}>{t('barcode.hint')}</Text>
        </View>
      )}

      {/* Scannés récemment — visible seulement au repos (pas de scan/résultat) */}
      {status === 'scanning' && recents.length > 0 && (
        <View style={[styles.recentsSheet, { backgroundColor: card }]}>
          <View style={styles.recentsHead}>
            <History size={16} color={isDark ? Colors.dark.primary : Colors.light.primary} />
            <Text style={[styles.recentsTitle, { color: textCol }]}>{recentsLabel}</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {recents.map((r) => (
              <TouchableOpacity
                key={r.barcode}
                style={[styles.recentRow, isDark && { backgroundColor: '#0f172a', borderColor: '#334155' }]}
                onPress={() => openRecent(r.barcode)}
                activeOpacity={0.7}
              >
                <View style={[styles.recentThumb, styles.thumbPh, isDark && { backgroundColor: '#334155' }]}>
                  <ScanBarcode size={16} color={isDark ? Colors.dark.primary : Colors.light.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recentName, { color: textCol }]} numberOfLines={1}>{r.name || r.barcode}</Text>
                  <Text style={[styles.recentMeta, { color: subCol }]} numberOfLines={1}>
                    {r.kcal && r.kcal !== '—' ? `${r.kcal} kcal / 100 g · ` : ''}{r.barcode}
                  </Text>
                </View>
                <RefreshCw size={15} color={isDark ? Colors.dark.primary : Colors.light.primary} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Loading */}
      {status === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.hint}>{t('barcode.looking_up')} {code}…</Text>
        </View>
      )}

      {/* Not found → produit inconnu : ajoute-le (photo étiquette + validation) */}
      {status === 'notfound' && (
        <View style={[styles.sheet, { backgroundColor: card }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            <View>
              <Text style={[styles.sheetTitle, { color: textCol }]}>{ox.unknownTitle}</Text>
              <Text style={[styles.sheetSub, { color: subCol, marginTop: 4 }]}>{ox.unknownSub}</Text>
            </View>

            {pendingState === 'sent' ? (
              <View style={[styles.sentBanner, { borderColor: '#16A34A', backgroundColor: '#16A34A1A' }]}>
                <Text style={[styles.sentTxt, { color: '#16A34A' }]}>{ox.sent}</Text>
              </View>
            ) : (
              <>
                {/* Aperçu / capture de la photo d'étiquette */}
                <TouchableOpacity
                  style={[styles.labelCapture, isDark && { backgroundColor: '#0f172a', borderColor: '#334155' }]}
                  onPress={captureLabel}
                  disabled={pendingState === 'sending'}
                >
                  {pendingImg ? (
                    <Image source={{ uri: `data:image/jpeg;base64,${pendingImg}` }} style={styles.labelPreview} />
                  ) : (
                    <View style={styles.labelPlaceholder}>
                      <Camera size={28} color={isDark ? Colors.dark.primary : Colors.light.primary} />
                      <Text style={[styles.labelPlaceholderTxt, { color: subCol }]}>{ox.snapLabel}</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {pendingState === 'badphoto' && (
                  <View style={[styles.warnBanner, { borderColor: '#B45309', backgroundColor: '#FEF3C7' }]}>
                    <AlertTriangle size={16} color="#B45309" />
                    <Text style={styles.warnBannerTxt}>{ox.badPhoto}</Text>
                  </View>
                )}
                {pendingState === 'error' && (
                  <View style={[styles.warnBanner, { borderColor: '#DC2626', backgroundColor: '#DC26261A' }]}>
                    <AlertTriangle size={16} color="#DC2626" />
                    <Text style={[styles.warnBannerTxt, { color: '#DC2626' }]}>{ox.sendFail}</Text>
                  </View>
                )}

                {pendingImg && (
                  <TouchableOpacity style={styles.primaryBtn} onPress={sendPending} disabled={pendingState === 'sending'}>
                    {pendingState === 'sending'
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <PlusCircle size={18} color="#fff" />}
                    <Text style={styles.primaryBtnText}>{pendingState === 'sending' ? ox.sending : ox.send}</Text>
                  </TouchableOpacity>
                )}

                {/* Alternative : formulaire de saisie manuelle complet */}
                <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push(('/register-product?code=' + code) as any)}>
                  <PlusCircle size={16} color={isDark ? Colors.dark.primary : Colors.light.primary} />
                  <Text style={styles.ghostBtnText}>{registerLabel}</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.ghostBtn} onPress={rescan}>
              <RefreshCw size={16} color={isDark ? Colors.dark.primary : Colors.light.primary} />
              <Text style={styles.ghostBtnText}>{t('barcode.scan_again')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Not edible (produit non alimentaire) */}
      {status === 'notedible' && found && (
        <View style={[styles.sheet, { backgroundColor: card }]}>
          <View style={styles.foundRow}>
            <View style={[styles.thumb, styles.thumbPh, isDark && { backgroundColor: '#334155' }]}><Ban size={26} color="#DC2626" /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.foundName, { color: textCol }]} numberOfLines={2}>{found.name}</Text>
              <Text style={[styles.sheetSub, { color: subCol }]}>{ox.notEdibleSub}</Text>
            </View>
          </View>
          <View style={[styles.notEdibleBanner, { borderColor: '#DC2626', backgroundColor: '#DC26261A' }]}>
            <Ban size={18} color="#DC2626" />
            <Text style={[styles.notEdibleTxt, { color: '#DC2626' }]}>{ox.notEdible}</Text>
          </View>
          <TouchableOpacity style={styles.ghostBtn} onPress={rescan}>
            <RefreshCw size={16} color={isDark ? Colors.dark.primary : Colors.light.primary} />
            <Text style={styles.ghostBtnText}>{t('barcode.scan_another')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Found product card */}
      {status === 'found' && found && (
        <View style={[styles.sheet, { backgroundColor: card }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
          <View style={styles.foundRow}>
            {found.image ? <Image source={{ uri: found.image }} style={[styles.thumb, isDark && { backgroundColor: '#334155' }]} /> : <View style={[styles.thumb, styles.thumbPh, isDark && { backgroundColor: '#334155' }]}><ScanBarcode size={26} color={Colors.light.primary} /></View>}
            <View style={{ flex: 1 }}>
              <Text style={[styles.foundName, { color: textCol }]} numberOfLines={2}>{found.name}</Text>
              <Text style={[styles.foundMacros, { color: subCol }]}>{found.calories} kcal · P {found.protein}g · C {found.carbs}g · F {found.fat}g <Text style={[styles.per100, isDark && { color: '#64748b' }]}>/ 100 g</Text></Text>
            </View>
          </View>

          {/* Verdict OBJECTIF (perso : objectif du jour + régime + conditions) */}
          {found.objective && (
            <View style={[styles.objCard, { borderColor: OBJ_COLOR[found.objective.verdict], backgroundColor: OBJ_COLOR[found.objective.verdict] + '14' }]}>
              <View style={styles.objHead}>
                <Text style={styles.objEmoji}>{OBJ_EMOJI[found.objective.verdict]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.objVerdict, { color: OBJ_COLOR[found.objective.verdict] }]}>{ox.verdict[found.objective.verdict]}</Text>
                  <Text style={[styles.objSub, { color: subCol }]}>{found.objective.fit}/100 · {ox.goalFit}</Text>
                </View>
              </View>
              {found.objective.reasons?.length ? (
                <View style={{ marginTop: 8, gap: 3 }}>
                  <Text style={[styles.objWhy, { color: subCol }]}>{ox.why}</Text>
                  {found.objective.reasons.slice(0, 4).map((r, i) => (
                    <Text key={i} style={[styles.objReason, { color: isDark ? '#cbd5e1' : '#334155' }]}>• {r}</Text>
                  ))}
                </View>
              ) : null}
            </View>
          )}

          {found.health && (
            <View style={[styles.healthBadge, { backgroundColor: found.health.color + '1A', borderColor: found.health.color }]}>
              <View style={[styles.healthGrade, { backgroundColor: found.health.color }]}>
                <Text style={styles.healthGradeTxt}>{found.health.grade}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.healthVerdict, { color: found.health.color }]}>
                  {(VERDICT_TXT[language] || VERDICT_TXT.en)[found.health.verdict]}
                </Text>
                <Text style={[styles.healthSub, { color: subCol }]}>
                  {found.health.score}/100{found.health.approx ? ' ~' : ''} · {language === 'fr' ? 'sur l’appareil' : language === 'ar' ? 'على الجهاز' : 'on-device'}
                </Text>
              </View>
            </View>
          )}

          {/* Alerte allergènes (OFF allergens_tags / allergens) */}
          {found.allergens && found.allergens.length > 0 && (
            <View style={styles.allergenBanner}>
              <AlertTriangle size={16} color="#B45309" />
              <Text style={styles.allergenTxt}>{allergensLabel}: {found.allergens.join(', ')}</Text>
            </View>
          )}

          {/* Liste nutritionnelle complète /100 g */}
          {found.nutriments && (
            <View style={[styles.nutriBox, isDark && { backgroundColor: '#0f172a', borderColor: '#334155' }]}>
              <Text style={[styles.nutriTitle, { color: textCol }]}>{ox.nutrition}</Text>
              {[
                [ox.kcal, fmt(found.nutriments['energy-kcal_100g'], 'kcal'), false],
                [ox.protein, fmt(found.nutriments['proteins_100g'], 'g'), false],
                [ox.carbs, fmt(found.nutriments['carbohydrates_100g'], 'g'), false],
                [ox.sugars, fmt(found.nutriments['sugars_100g'], 'g'), true],
                [ox.fat, fmt(found.nutriments['fat_100g'], 'g'), false],
                [ox.sat, fmt(found.nutriments['saturated-fat_100g'], 'g'), true],
                [ox.salt, fmt(found.nutriments['salt_100g'], 'g'), false],
                [ox.sodium, fmt(found.nutriments['sodium_100g'], 'g'), false],
                [ox.fiber, fmt(found.nutriments['fiber_100g'], 'g'), false],
              ].map(([label, val, indent], i) => (
                <View key={i} style={styles.nutriRow}>
                  <Text style={[styles.nutriLabel, { color: subCol }, indent ? styles.nutriIndent : null]}>{label as string}</Text>
                  <Text style={[styles.nutriVal, { color: textCol }]}>{val as string}</Text>
                </View>
              ))}
            </View>
          )}

          {found.desc ? (
            <Text style={[styles.descTxt, { color: subCol }]}>{found.desc}</Text>
          ) : null}

          {/* Bouton Alternatives (uniquement si verdict=avoid) */}
          {found.objective?.verdict === 'avoid' && (
            <View style={{ gap: 8 }}>
              {alts == null ? (
                <TouchableOpacity style={styles.altBtn} onPress={loadAlternatives} disabled={altsLoading}>
                  {altsLoading ? <ActivityIndicator size="small" color={isDark ? Colors.dark.primary : Colors.light.primary} /> : <Sparkles size={16} color={isDark ? Colors.dark.primary : Colors.light.primary} />}
                  <Text style={styles.altBtnTxt}>{altsLoading ? ox.altLoading : ox.alternatives}</Text>
                </TouchableOpacity>
              ) : alts.length === 0 ? (
                <Text style={[styles.altNone, { color: subCol }]}>{ox.altNone}</Text>
              ) : (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.objWhy, { color: subCol }]}>{ox.alternatives}</Text>
                  {alts.map((a, i) => (
                    <View key={i} style={[styles.altRow, isDark && { backgroundColor: '#0f172a', borderColor: '#334155' }]}>
                      {a.image ? <Image source={{ uri: a.image }} style={styles.altThumb} /> : <View style={[styles.altThumb, styles.thumbPh]}><ScanBarcode size={18} color={isDark ? Colors.dark.primary : Colors.light.primary} /></View>}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.altName, { color: textCol }]} numberOfLines={2}>{[a.name, a.brand].filter(Boolean).join(' · ')}</Text>
                        {(a.fit != null || a.kcal != null) && (
                          <Text style={[styles.altMeta, { color: subCol }]}>
                            {a.fit != null ? `${a.fit}/100` : ''}{a.fit != null && a.kcal != null ? ' · ' : ''}{a.kcal != null ? `${Math.round(a.kcal)} kcal` : ''}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.primaryBtn} onPress={logIt}>
            <Text style={styles.primaryBtnText}>{t('barcode.log_food')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={rescan}>
            <RefreshCw size={16} color={isDark ? Colors.dark.primary : Colors.light.primary} />
            <Text style={styles.ghostBtnText}>{t('barcode.scan_another')}</Text>
          </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute', top: 44, left: 0, right: 0, zIndex: 5,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanWindow: {
    width: 280, height: 180, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  // Coins type "viseur" (plus pro qu'un cadre plein)
  corner: { position: 'absolute', width: 34, height: 34, borderColor: '#4ade80' },
  cTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 },
  cTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 },
  cBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 18 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 18 },
  formatChip: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 14 },
  formatTxt: { color: '#a7f3d0', fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6 },
  hint: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 12, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8 },
  // Carte flottante AU-DESSUS de la barre de navigation persistante (~90px) —
  // avant : bottom 0 → la barre recouvrait le bouton « Log » (taps impossibles).
  sheet: {
    position: 'absolute', left: 12, right: 12, bottom: 96,
    backgroundColor: '#fff', borderRadius: 24,
    padding: 22, gap: 14, maxHeight: '78%',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900] },
  sheetSub: { fontSize: 14, color: isDark ? Colors.dark.gray[500] : Colors.light.gray[500] },
  foundRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  thumb: { width: 64, height: 64, borderRadius: 14, backgroundColor: isDark ? Colors.dark.gray[100] : Colors.light.gray[100] },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  foundName: { fontSize: 17, fontWeight: '800', color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900] },
  foundMacros: { fontSize: 14, color: isDark ? Colors.dark.gray[600] : Colors.light.gray[600], marginTop: 4 },
  healthBadge: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 12 },
  healthGrade: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  healthGradeTxt: { color: '#fff', fontSize: 22, fontWeight: '900' },
  healthVerdict: { fontSize: 16, fontWeight: '800' },
  healthSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  descTxt: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  per100: { color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400] },
  // Verdict objectif
  objCard: { borderRadius: 16, borderWidth: 1.5, padding: 14 },
  objHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  objEmoji: { fontSize: 26 },
  objVerdict: { fontSize: 16, fontWeight: '800' },
  objSub: { fontSize: 12.5, fontWeight: '600', marginTop: 1 },
  objWhy: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  objReason: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  // Liste nutritionnelle
  nutriBox: { borderRadius: 16, borderWidth: 1, borderColor: isDark ? Colors.dark.gray[200] : Colors.light.gray[200], padding: 14, backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50] },
  nutriTitle: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  nutriRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  nutriLabel: { fontSize: 13.5, fontWeight: '600' },
  nutriIndent: { paddingLeft: 14, fontWeight: '500', fontStyle: 'italic' },
  nutriVal: { fontSize: 13.5, fontWeight: '800' },
  // Alternatives
  altBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: isDark ? Colors.dark.primary : Colors.light.primary },
  altBtnTxt: { color: isDark ? Colors.dark.primary : Colors.light.primary, fontSize: 15, fontWeight: '800' },
  altNone: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  altRow: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: isDark ? Colors.dark.gray[200] : Colors.light.gray[200], padding: 8, backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50] },
  altThumb: { width: 40, height: 40, borderRadius: 10, backgroundColor: isDark ? Colors.dark.gray[100] : Colors.light.gray[100], alignItems: 'center', justifyContent: 'center' },
  altName: { fontSize: 14, fontWeight: '700' },
  altMeta: { fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  // Alerte allergènes (couleur warning, alignée sur warnBanner)
  allergenBanner: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: '#B45309', backgroundColor: '#FEF3C7', padding: 12 },
  allergenTxt: { fontSize: 13, fontWeight: '800', color: '#92400E', flex: 1 },
  // Non comestible
  notEdibleBanner: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: 14, borderWidth: 1.5, padding: 14 },
  notEdibleTxt: { fontSize: 15, fontWeight: '800', flex: 1 },
  // Produit inconnu — capture étiquette
  labelCapture: { height: 150, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: isDark ? Colors.dark.gray[300] : Colors.light.gray[300], backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50], overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  labelPreview: { width: '100%', height: '100%' },
  labelPlaceholder: { alignItems: 'center', gap: 8 },
  labelPlaceholderTxt: { fontSize: 14, fontWeight: '700' },
  warnBanner: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 12 },
  warnBannerTxt: { fontSize: 13, fontWeight: '700', color: '#92400E', flex: 1 },
  sentBanner: { borderRadius: 14, borderWidth: 1.5, padding: 16, alignItems: 'center' },
  sentTxt: { fontSize: 15, fontWeight: '800' },
  primaryBtn: {
    flexDirection: 'row', gap: 8, backgroundColor: Colors.light.primary,
    paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  ghostBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  ghostBtnText: { color: isDark ? Colors.dark.primary : Colors.light.primary, fontSize: 15, fontWeight: '700' },
  // Scannés récemment — carte flottante au repos, au-dessus de la barre de nav (~90px).
  recentsSheet: {
    position: 'absolute', left: 12, right: 12, bottom: 96,
    borderRadius: radius.xl, padding: 16, gap: 10, maxHeight: '42%',
    ...elevation.lg,
  },
  recentsHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  recentsTitle: { fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  recentRow: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    borderRadius: radius.sm, borderWidth: 1, borderColor: isDark ? Colors.dark.gray[200] : Colors.light.gray[200],
    padding: 8, backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
  },
  recentThumb: { width: 34, height: 34, borderRadius: 10, backgroundColor: isDark ? Colors.dark.gray[100] : Colors.light.gray[100] },
  recentName: { fontSize: 14, fontWeight: '700' },
  recentMeta: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  permWrap: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  permTitle: { fontSize: 22, fontWeight: '900', color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900] },
  permText: { fontSize: 15, color: isDark ? Colors.dark.gray[500] : Colors.light.gray[500], textAlign: 'center' },
  cancelText: { color: isDark ? Colors.dark.gray[500] : Colors.light.gray[500], fontSize: 15, fontWeight: '600', marginTop: 4 },
});
