// Scanner UNIFIÉ (vue RN inline) :
//  • Toggle EN HAUT : Plat | Code-barres.
//  • Code-barres : détection live + scan depuis la galerie (scanFromURLAsync).
//  • Plat : capture photo OU image galerie → analyse, avec CHOIX du modèle
//    (Appareil / Backend / Gemini) transmis à scan-analysis (forceModel).
import { useRef, useState, useEffect } from 'react';
import BrandOverlay from '../../components/BrandOverlay';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { CameraView, useCameraPermissions, scanFromURLAsync } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { X, Circle, RotateCw, Image as ImageIcon, ScanBarcode, UtensilsCrossed } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { colorLog, explain } from '../../lib/LocalDataStore';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';

const PENDING_SCAN_KEY = 'pending_scan_v1';
const GREEN = '#2E8B57';
const BARCODE_TYPES: any = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'];

const TXT: Record<string, any> = {
  en: { loading: 'Loading camera...', accessTitle: 'Camera Access Needed', accessText: 'We need camera access to scan.', grant: 'Grant Access', cancel: 'Cancel', processing: 'Processing…',
    dish: 'Dish', barcode: 'Barcode', gallery: 'Gallery', tapDish: 'Tap to capture the dish', aimBarcode: 'Point at a barcode', noBarcode: 'No barcode found in this image.',
    mDevice: 'Mobile', mBackend: 'Backend', mGemini: 'Gemini', model: 'Model' },
  fr: { loading: 'Chargement de la caméra...', accessTitle: 'Accès à la caméra requis', accessText: 'Nous avons besoin de la caméra pour scanner.', grant: "Autoriser l'accès", cancel: 'Annuler', processing: 'Traitement…',
    dish: 'Plat', barcode: 'Code-barres', gallery: 'Galerie', tapDish: 'Touchez pour capturer le plat', aimBarcode: 'Visez un code-barres', noBarcode: 'Aucun code-barres trouvé dans cette image.',
    mDevice: 'Mobile', mBackend: 'Backend', mGemini: 'Gemini', model: 'Modèle' },
  ar: { loading: 'جارٍ تحميل الكاميرا...', accessTitle: 'الوصول إلى الكاميرا مطلوب', accessText: 'نحتاج إلى الكاميرا للمسح.', grant: 'منح الإذن', cancel: 'إلغاء', processing: 'جارٍ المعالجة…',
    dish: 'طبق', barcode: 'باركود', gallery: 'المعرض', tapDish: 'اضغط لالتقاط الطبق', aimBarcode: 'وجّه نحو الباركود', noBarcode: 'لا يوجد باركود في هذه الصورة.',
    mDevice: 'الجهاز', mBackend: 'الخادم', mGemini: 'Gemini', model: 'النموذج' },
};

export default function ScanCameraScreen() {
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const params = useLocalSearchParams();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [capturing, setCapturing] = useState(false);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'dish' | 'barcode'>(params.mode === 'barcode' ? 'barcode' : 'dish');
  const [model, setModel] = useState<'device' | 'backend' | 'gemini'>('gemini'); // modèle pour le scan de PLAT
  const barcodeLock = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission]);

  if (!permission) {
    return <View style={styles.loadingWrap}><ActivityIndicator size="large" color={Colors.light.primary} /><Text style={styles.loadingText}>{t.loading}</Text></View>;
  }
  if (!permission.granted) {
    return (
      <View style={styles.permissionWrap}>
        <Text style={styles.permissionTitle}>{t.accessTitle}</Text>
        <Text style={styles.permissionText}>{t.accessText}</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}><Text style={styles.permissionBtnText}>{t.grant}</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.permissionBtn, { backgroundColor: '#334155' }]} onPress={() => router.back()}><Text style={styles.permissionBtnText}>{t.cancel}</Text></TouchableOpacity>
      </View>
    );
  }

  // Code-barres détecté en live → fiche produit.
  const onBarcode = ({ data }: { data: string }) => {
    if (barcodeLock.current || !data) return;
    barcodeLock.current = true;
    colorLog('GREEN', '[scan-camera] code-barres live → fiche produit', { data });
    router.replace({ pathname: '/scan-barcode' as any, params: { code: data } });
  };

  const goAnalysis = async (uri: string) => {
    try { await AsyncStorage.setItem(PENDING_SCAN_KEY, JSON.stringify({ uri, at: Date.now() })); } catch {}
    router.replace({ pathname: '/scan-analysis' as any, params: { imageUri: uri, forceModel: model } });
  };

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    if (!ready) { Alert.alert(t.processing, t.loading); return; }
    setCapturing(true);
    colorLog('GREEN', '[API→expo-camera] takePictureAsync REQUEST', { model });
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.4, base64: false, exif: false });
      if (!photo?.uri) throw new Error('Failed to capture image');
      await goAnalysis(photo.uri);
    } catch (e: any) {
      // FALLBACK Samsung : caméra système (Intent) — fiable en build release.
      colorLog('YELLOW', '[scan-camera] takePictureAsync KO → fallback', { err: e?.message });
      try {
        const res = await ImagePicker.launchCameraAsync({ quality: 0.4, exif: false, mediaTypes: ['images'] as any });
        if (!res.canceled && res.assets?.[0]?.uri) { await goAnalysis(res.assets[0].uri); return; }
        setCapturing(false);
      } catch (e2: any) { Alert.alert('Capture error', e2?.message || 'Unknown error'); setCapturing(false); }
    }
  };

  // Galerie : selon le mode → analyse plat OU décodage code-barres depuis l'image.
  const pickGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.5, exif: false, mediaTypes: ['images'] as any });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    const uri = res.assets[0].uri;
    if (mode === 'barcode') {
      try {
        explain('scan code-barres depuis une image galerie (scanFromURLAsync)');
        const found = await scanFromURLAsync(uri, BARCODE_TYPES);
        const code = found?.[0]?.data;
        if (code) { router.replace({ pathname: '/scan-barcode' as any, params: { code } }); return; }
        Alert.alert(t.barcode, t.noBarcode);
      } catch (e: any) { Alert.alert(t.barcode, t.noBarcode); }
    } else {
      await goAnalysis(uri);
    }
  };

  const MODELS: { k: 'device' | 'backend' | 'gemini'; label: string }[] = [
    { k: 'device', label: t.mDevice }, { k: 'backend', label: t.mBackend }, { k: 'gemini', label: t.mGemini },
  ];

  return (
    <SafeAreaView style={styles.root}>
      <BrandOverlay />
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode="picture"
        onCameraReady={() => setReady(true)}
        barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
        onBarcodeScanned={mode === 'barcode' && !capturing ? onBarcode : undefined}
      >
        <View style={styles.overlay}>
          {/* Top bar */}
          <View style={[styles.topBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} disabled={capturing}><X size={26} color="#fff" /></TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} disabled={capturing}>
              <RotateCw size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Toggle Plat / Code-barres */}
          <View style={styles.segmentWrap}>
            <View style={styles.segment}>
              {(['dish', 'barcode'] as const).map((m) => {
                const active = mode === m;
                const Icon = m === 'dish' ? UtensilsCrossed : ScanBarcode;
                return (
                  <TouchableOpacity key={m} style={[styles.segBtn, active && styles.segBtnActive]} onPress={() => { barcodeLock.current = false; setMode(m); }} activeOpacity={0.85}>
                    <Icon size={16} color={active ? '#fff' : '#cbd5e1'} />
                    <Text style={[styles.segTxt, { color: active ? '#fff' : '#cbd5e1' }]}>{m === 'dish' ? t.dish : t.barcode}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Cadre de visée code-barres */}
          {mode === 'barcode' && (
            <View style={styles.viewfinder} pointerEvents="none">
              <View style={styles.bcFrame} />
              <Text style={styles.hint}>{t.aimBarcode}</Text>
            </View>
          )}

          {/* Bas : modèle (plat) + shutter/galerie */}
          <View style={styles.bottomBar}>
            {mode === 'dish' && (
              <View style={styles.modelRow}>
                {MODELS.map((mm) => {
                  const active = model === mm.k;
                  return (
                    <TouchableOpacity key={mm.k} style={[styles.modelChip, active && styles.modelChipActive]} onPress={() => setModel(mm.k)} activeOpacity={0.85}>
                      <Text style={[styles.modelTxt, { color: active ? '#fff' : '#cbd5e1' }]}>{mm.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={[styles.controls, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {/* Galerie */}
              <TouchableOpacity style={styles.galleryBtn} onPress={pickGallery} disabled={capturing}>
                <ImageIcon size={24} color="#fff" />
                <Text style={styles.galleryTxt}>{t.gallery}</Text>
              </TouchableOpacity>

              {/* Shutter (plat uniquement) */}
              {mode === 'dish' ? (
                <TouchableOpacity style={[styles.shutter, capturing && styles.shutterDisabled]} onPress={handleCapture} disabled={capturing} activeOpacity={0.7}>
                  {capturing ? <ActivityIndicator color={GREEN} size="large" /> : <View style={styles.shutterInner} />}
                </TouchableOpacity>
              ) : (
                <View style={styles.shutterPlaceholder} />
              )}

              {/* Spacer pour centrer le shutter */}
              <View style={{ width: 72 }} />
            </View>
            <Text style={styles.hintBottom}>{capturing ? t.processing : mode === 'dish' ? t.tapDish : t.aimBarcode}</Text>
          </View>
        </View>
      </CameraView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'space-between', backgroundColor: 'transparent' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, backgroundColor: 'rgba(0,0,0,0.35)' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  segmentWrap: { alignItems: 'center', marginTop: -8 },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, padding: 4, gap: 4 },
  segBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999 },
  segBtnActive: { backgroundColor: GREEN },
  segTxt: { fontSize: 14, fontWeight: '800' },
  viewfinder: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  bcFrame: { width: 270, height: 160, borderRadius: 18, borderWidth: 3, borderColor: '#4ade80', backgroundColor: 'rgba(255,255,255,0.04)' },
  hint: { color: '#fff', fontSize: 14, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  bottomBar: { paddingBottom: 34, paddingTop: 14, backgroundColor: 'rgba(0,0,0,0.35)' },
  modelRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  modelChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  modelChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  modelTxt: { fontSize: 13, fontWeight: '800' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28 },
  galleryBtn: { width: 72, alignItems: 'center', gap: 4 },
  galleryTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  shutter: { width: 82, height: 82, borderRadius: 41, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.35)' },
  shutterDisabled: { opacity: 0.5 },
  shutterInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: GREEN },
  shutterPlaceholder: { width: 82, height: 82 },
  hintBottom: { color: '#fff', textAlign: 'center', marginTop: 12, fontSize: 13, fontWeight: '600' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#000' },
  loadingText: { color: '#fff', fontSize: 14 },
  permissionWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, backgroundColor: '#000' },
  permissionTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  permissionText: { color: '#ccc', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  permissionBtn: { backgroundColor: Colors.light.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, minWidth: 200, alignItems: 'center' },
  permissionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
