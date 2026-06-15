// Barcode scanner — scanne un code-barres produit (EAN/UPC) et recupere les
// infos nutritionnelles via OpenFoodFacts (API publique, gratuite, sans cle),
// puis pre-remplit l'ecran log-food-details. Logging produit ultra-rapide.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import BrandOverlay from '../../components/BrandOverlay';
import { ArrowLeft, ScanBarcode, RefreshCw, PlusCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { getCustomProduct } from '../../lib/aiStore';
import { computeHealthScore, VERDICT_TXT, HealthScore } from '../../lib/healthScore';

type Found = {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  image?: string;
  health?: HealthScore;
  desc?: string; // qualités/risques pour la description au log
};

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
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const card = isDark ? '#1e293b' : '#ffffff';
  const textCol = isDark ? '#f1f5f9' : Colors.light.gray[900];
  const subCol = isDark ? '#94a3b8' : Colors.light.gray[500];
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<'scanning' | 'loading' | 'found' | 'notfound'>('scanning');
  const [found, setFound] = useState<Found | null>(null);
  const [code, setCode] = useState('');
  const lock = useRef(false);

  const lookup = useCallback(async (barcode: string) => {
    setStatus('loading');
    setCode(barcode);
    try {
      // 1) Community custom products DB first (user-contributed barcodes).
      const custom = await getCustomProduct(barcode);
      if (custom) {
        setFound({
          name: [custom.name, custom.brand].filter(Boolean).join(' · '),
          calories: custom.calories, protein: custom.protein, carbs: custom.carbs, fat: custom.fat,
          image: custom.productImage,
          health: computeHealthScore({ kcal: Number(custom.calories), protein: Number(custom.protein), carbs: Number(custom.carbs), fat: Number(custom.fat) }),
        });
        setStatus('found');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        return;
      }
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,nutriments,image_front_small_url`,
        { headers: { 'User-Agent': 'Salorie/1.0 (salorie.salistar.com)' } }
      );
      const json = await res.json();
      if (json.status !== 1 || !json.product) {
        setStatus('notfound');
        return;
      }
      const p = json.product;
      const n = p.nutriments || {};
      const num = (v: any) => (v == null || isNaN(Number(v)) ? '0' : String(Math.round(Number(v) * 10) / 10));
      // Score santé calculé ON-DEVICE (hors-ligne) à partir des nutriments OFF.
      const health = computeHealthScore({
        kcal: Number(n['energy-kcal_100g']), protein: Number(n.proteins_100g),
        carbs: Number(n.carbohydrates_100g), fat: Number(n.fat_100g),
        sugars: n.sugars_100g, satFat: n['saturated-fat_100g'],
        salt: n.salt_100g, sodium: n.sodium_100g, fiber: n.fiber_100g,
      });
      setFound({
        name: [p.product_name, p.brands].filter(Boolean).join(' · ') || `Product ${barcode}`,
        calories: num(n['energy-kcal_100g']),
        protein: num(n.proteins_100g),
        carbs: num(n.carbohydrates_100g),
        fat: num(n.fat_100g),
        image: p.image_front_small_url,
        health,
        desc: qualRiskDesc(n, language),
      });
      setStatus('found');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      setStatus('notfound');
    }
  }, []);

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

  const rescan = () => { lock.current = false; setFound(null); setStatus('scanning'); };

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
        <ScanBarcode size={56} color={Colors.light.primary} />
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

      {/* Loading */}
      {status === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.hint}>{t('barcode.looking_up')} {code}…</Text>
        </View>
      )}

      {/* Not found */}
      {status === 'notfound' && (
        <View style={[styles.sheet, { backgroundColor: card }]}>
          <Text style={[styles.sheetTitle, { color: textCol }]}>{t('barcode.not_found_title')}</Text>
          <Text style={[styles.sheetSub, { color: subCol }]}>{t('barcode.not_found_sub')}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push(('/register-product?code=' + code) as any)}>
            <PlusCircle size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>{registerLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={rescan}>
            <RefreshCw size={16} color={Colors.light.primary} />
            <Text style={styles.ghostBtnText}>{t('barcode.scan_again')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Found product card */}
      {status === 'found' && found && (
        <View style={[styles.sheet, { backgroundColor: card }]}>
          <View style={styles.foundRow}>
            {found.image ? <Image source={{ uri: found.image }} style={[styles.thumb, isDark && { backgroundColor: '#334155' }]} /> : <View style={[styles.thumb, styles.thumbPh, isDark && { backgroundColor: '#334155' }]}><ScanBarcode size={26} color={Colors.light.primary} /></View>}
            <View style={{ flex: 1 }}>
              <Text style={[styles.foundName, { color: textCol }]} numberOfLines={2}>{found.name}</Text>
              <Text style={[styles.foundMacros, { color: subCol }]}>{found.calories} kcal · P {found.protein}g · C {found.carbs}g · F {found.fat}g <Text style={[styles.per100, isDark && { color: '#64748b' }]}>/ 100 g</Text></Text>
            </View>
          </View>
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
          {found.desc ? (
            <Text style={[styles.descTxt, { color: subCol }]}>{found.desc}</Text>
          ) : null}
          <TouchableOpacity style={styles.primaryBtn} onPress={logIt}>
            <Text style={styles.primaryBtnText}>{t('barcode.log_food')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={rescan}>
            <RefreshCw size={16} color={Colors.light.primary} />
            <Text style={styles.ghostBtnText}>{t('barcode.scan_another')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    padding: 22, gap: 14,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: Colors.light.gray[900] },
  sheetSub: { fontSize: 14, color: Colors.light.gray[500] },
  foundRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  thumb: { width: 64, height: 64, borderRadius: 14, backgroundColor: Colors.light.gray[100] },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  foundName: { fontSize: 17, fontWeight: '800', color: Colors.light.gray[900] },
  foundMacros: { fontSize: 14, color: Colors.light.gray[600], marginTop: 4 },
  healthBadge: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 12 },
  healthGrade: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  healthGradeTxt: { color: '#fff', fontSize: 22, fontWeight: '900' },
  healthVerdict: { fontSize: 16, fontWeight: '800' },
  healthSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  descTxt: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  per100: { color: Colors.light.gray[400] },
  primaryBtn: {
    flexDirection: 'row', gap: 8, backgroundColor: Colors.light.primary,
    paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  ghostBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  ghostBtnText: { color: Colors.light.primary, fontSize: 15, fontWeight: '700' },
  permWrap: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  permTitle: { fontSize: 22, fontWeight: '900', color: Colors.light.gray[900] },
  permText: { fontSize: 15, color: Colors.light.gray[500], textAlign: 'center' },
  cancelText: { color: Colors.light.gray[500], fontSize: 15, fontWeight: '600', marginTop: 4 },
});
