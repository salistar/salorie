// Barcode scanner — scanne un code-barres produit (EAN/UPC) et recupere les
// infos nutritionnelles via OpenFoodFacts (API publique, gratuite, sans cle),
// puis pre-remplit l'ecran log-food-details. Logging produit ultra-rapide.
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import BrandOverlay from '../../components/BrandOverlay';
import { ArrowLeft, ScanBarcode, RefreshCw, PlusCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { getCustomProduct } from '../../lib/aiStore';

type Found = {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  image?: string;
};

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
      setFound({
        name: [p.product_name, p.brands].filter(Boolean).join(' · ') || `Product ${barcode}`,
        calories: num(n['energy-kcal_100g']),
        protein: num(n.proteins_100g),
        carbs: num(n.carbohydrates_100g),
        fat: num(n.fat_100g),
        image: p.image_front_small_url,
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
      <BrandOverlay />
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
        onBarcodeScanned={status === 'scanning' ? onScanned : undefined}
      />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('barcode.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Scan window */}
      {status === 'scanning' && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.scanWindow} />
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
    borderWidth: 3, borderColor: '#4ade80', backgroundColor: 'rgba(255,255,255,0.04)',
  },
  hint: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 18, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8 },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, gap: 14,
  },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: Colors.light.gray[900] },
  sheetSub: { fontSize: 14, color: Colors.light.gray[500] },
  foundRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  thumb: { width: 64, height: 64, borderRadius: 14, backgroundColor: Colors.light.gray[100] },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  foundName: { fontSize: 17, fontWeight: '800', color: Colors.light.gray[900] },
  foundMacros: { fontSize: 14, color: Colors.light.gray[600], marginTop: 4 },
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
