// Register a product whose barcode wasn't found in OpenFoodFacts. Saves the
// nutrition the user enters + a product photo + a barcode photo to the shared
// custom_products collection, so the next scan of this barcode resolves instantly.
import React, { useRef, useState, useMemo } from 'react';
import { useTokens, Tokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ScanBarcode } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormCard, FormInput, Stepper, SubmitBar } from '../../components/FormKit';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { txtAlign } from '../../lib/rtl';
import { saveCustomProduct } from '../../lib/aiStore';

const TXT: any = {
  en: {
    title: 'New product', barcode: 'Barcode',
    photoProduct: 'Product photo', photoBarcode: 'Barcode photo',
    namePh: 'e.g. Marrakech orange juice', brandPh: 'e.g. Marrakech',
    nameLabel: 'Product name *', brandLabel: 'Brand',
    per100: 'Values per 100 g / 100 ml',
    calories: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat',
    submit: 'Save to database',
    photoSrcTitle: 'Image source', camera: '📷 Camera', gallery: '🖼️ Gallery / Downloads', cancel: 'Cancel',
    galleryTitle: 'Gallery', galleryPerm: 'Allow photo access to choose an image.', galleryOpenErr: "Can't open the gallery.",
    errTitle: 'Error', errBarcode: 'Missing barcode.', nameReqTitle: 'Name required', nameReq: 'Enter at least the product name.',
    savedTitle: '✅ Product saved', savedBody: 'It will be recognized at the next scan of this barcode.', ok: 'OK',
    oops: 'Oops', saveFail: 'Save failed. Try again.',
  },
  fr: {
    title: 'Nouveau produit', barcode: 'Code-barres',
    photoProduct: 'Photo produit', photoBarcode: 'Photo code-barres',
    namePh: "ex. Jus d'orange Marrakech", brandPh: 'ex. Marrakech',
    nameLabel: 'Nom du produit *', brandLabel: 'Marque',
    per100: 'Valeurs pour 100 g / 100 ml',
    calories: 'Calories', protein: 'Protéines', carbs: 'Glucides', fat: 'Lipides',
    submit: 'Enregistrer dans la base',
    photoSrcTitle: "Source de l'image", camera: '📷 Caméra', gallery: '🖼️ Galerie / Téléchargements', cancel: 'Annuler',
    galleryTitle: 'Galerie', galleryPerm: "Autorise l'accès aux photos pour choisir une image.", galleryOpenErr: "Impossible d'ouvrir la galerie.",
    errTitle: 'Erreur', errBarcode: 'Code-barres manquant.', nameReqTitle: 'Nom requis', nameReq: 'Indique au moins le nom du produit.',
    savedTitle: '✅ Produit enregistré', savedBody: 'Il sera reconnu au prochain scan de ce code-barres.', ok: 'OK',
    oops: 'Oups', saveFail: "Échec de l'enregistrement. Réessaie.",
  },
  ar: {
    title: 'منتج جديد', barcode: 'الرمز الشريطي',
    photoProduct: 'صورة المنتج', photoBarcode: 'صورة الرمز الشريطي',
    namePh: 'مثال: عصير برتقال مراكش', brandPh: 'مثال: مراكش',
    nameLabel: 'اسم المنتج *', brandLabel: 'العلامة التجارية',
    per100: 'القيم لكل 100 غ / 100 مل',
    calories: 'السعرات', protein: 'البروتين', carbs: 'الكربوهيدرات', fat: 'الدهون',
    submit: 'حفظ في قاعدة البيانات',
    photoSrcTitle: 'مصدر الصورة', camera: '📷 الكاميرا', gallery: '🖼️ المعرض / التنزيلات', cancel: 'إلغاء',
    galleryTitle: 'المعرض', galleryPerm: 'اسمح بالوصول إلى الصور لاختيار صورة.', galleryOpenErr: 'تعذّر فتح المعرض.',
    errTitle: 'خطأ', errBarcode: 'الرمز الشريطي مفقود.', nameReqTitle: 'الاسم مطلوب', nameReq: 'أدخل اسم المنتج على الأقل.',
    savedTitle: '✅ تم حفظ المنتج', savedBody: 'سيتم التعرف عليه عند المسح التالي لهذا الرمز.', ok: 'حسناً',
    oops: 'عذراً', saveFail: 'فشل الحفظ. حاول مرة أخرى.',
  },
};

export default function RegisterProductScreen() {
  const k = useTokens();
  const { code } = useLocalSearchParams<{ code: string }>();
  const barcode = String(code || '');
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);
  const tx = TXT[language] || TXT.en;
  const newProductTitle = tx.title;
  const [permission, requestPermission] = useCameraPermissions();

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [productImage, setProductImage] = useState<string | null>(null);
  const [barcodeImage, setBarcodeImage] = useState<string | null>(null);
  const [capMode, setCapMode] = useState<'none' | 'product' | 'barcode'>('none');
  const [saving, setSaving] = useState(false);
  const camRef = useRef<CameraView>(null);

  const text = isDark ? '#fff' : k.text;
  const sub = isDark ? '#9BA1A6' : k.textMuted;
  const card = isDark ? k.surface : '#fff';
  const bg = isDark ? '#0f1419' : 'transparent';
  const tok = useTokens();
  const inputBg = tok.surfaceSunken;

  const capture = async () => {
    if (!camRef.current) return;
    try {
      const photo = await camRef.current.takePictureAsync({ quality: 0.25, base64: true });
      const uri = `data:image/jpeg;base64,${photo?.base64 || ''}`;
      if (capMode === 'product') setProductImage(uri); else setBarcodeImage(uri);
    } catch {}
    setCapMode('none');
  };

  const openCam = async (mode: 'product' | 'barcode') => {
    if (!permission?.granted) { const r = await requestPermission(); if (!r.granted) return; }
    setCapMode(mode);
  };

  // Pick an existing photo (e.g. from Downloads / gallery).
  const pickFromGallery = async (mode: 'product' | 'barcode') => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert(tx.galleryTitle, tx.galleryPerm); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.25, base64: true,
      });
      if (!res.canceled && res.assets?.[0]?.base64) {
        const uri = `data:image/jpeg;base64,${res.assets[0].base64}`;
        if (mode === 'product') setProductImage(uri); else setBarcodeImage(uri);
      }
    } catch { Alert.alert(tx.galleryTitle, tx.galleryOpenErr); }
  };

  const choosePhoto = (mode: 'product' | 'barcode') => {
    Alert.alert(mode === 'product' ? tx.photoProduct : tx.photoBarcode, tx.photoSrcTitle, [
      { text: tx.camera, onPress: () => openCam(mode) },
      { text: tx.gallery, onPress: () => pickFromGallery(mode) },
      { text: tx.cancel, style: 'cancel' },
    ]);
  };

  const save = async () => {
    if (!barcode) { Alert.alert(tx.errTitle, tx.errBarcode); return; }
    if (!name.trim()) { Alert.alert(tx.nameReqTitle, tx.nameReq); return; }
    setSaving(true);
    try {
      await saveCustomProduct({
        barcode, name: name.trim(), brand: brand.trim(),
        calories: calories || '0', protein: protein || '0', carbs: carbs || '0', fat: fat || '0',
        productImage: productImage || undefined, barcodeImage: barcodeImage || undefined,
      }, user?.primaryEmailAddress?.emailAddress || '');
      Alert.alert(tx.savedTitle, tx.savedBody, [{ text: tx.ok, onPress: () => router.back() }]);
    } catch {
      Alert.alert(tx.oops, tx.saveFail);
    } finally { setSaving(false); }
  };

  // Camera capture overlay
  if (capMode !== 'none') {
    return (
      <View style={styles.black}>
        <CameraView ref={camRef} style={StyleSheet.absoluteFillObject} facing="back" />
        <View style={styles.camTop}><Text style={styles.camTitle}>{capMode === 'product' ? tx.photoProduct : tx.photoBarcode}</Text></View>
        <View style={styles.camBottom}>
          <TouchableOpacity style={styles.shutter} onPress={capture}><View style={styles.shutterInner} /></TouchableOpacity>
          <TouchableOpacity onPress={() => setCapMode('none')}><Text style={styles.camCancel}>{tx.cancel}</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.container, { backgroundColor: bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <ScreenTopBar showBack title={newProductTitle} showBrand={false} showNotif={false} />
          <Text style={[styles.codeLine, { color: sub, textAlign: txtAlign(isRTL) }]}><ScanBarcode size={14} color={sub} /> {tx.barcode} : {barcode}</Text>

          {/* Photos */}
          <View style={[styles.photoRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <TouchableOpacity style={[styles.photoBox, { backgroundColor: inputBg }]} onPress={() => choosePhoto('product')}>
              {productImage ? <Image source={{ uri: productImage }} style={styles.photo} /> : <><Camera size={26} color={sub} /><Text style={[styles.photoTxt, { color: sub }]}>{tx.photoProduct}</Text></>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.photoBox, { backgroundColor: inputBg }]} onPress={() => choosePhoto('barcode')}>
              {barcodeImage ? <Image source={{ uri: barcodeImage }} style={styles.photo} /> : <><ScanBarcode size={26} color={sub} /><Text style={[styles.photoTxt, { color: sub }]}>{tx.photoBarcode}</Text></>}
            </TouchableOpacity>
          </View>

          {/* Fields */}
          <FormCard>
            <FormInput label={tx.nameLabel} value={name} onChangeText={setName} placeholder={tx.namePh} />
            <FormInput label={tx.brandLabel} value={brand} onChangeText={setBrand} placeholder={tx.brandPh} />
          </FormCard>
          <Text style={[styles.per100, { color: sub, textAlign: txtAlign(isRTL) }]}>{tx.per100}</Text>
          <FormCard>
            <Stepper label={tx.calories} value={calories} onChange={setCalories} step={10} unit="kcal" />
            <Stepper label={tx.protein} value={protein} onChange={setProtein} step={1} unit="g" />
            <Stepper label={tx.carbs} value={carbs} onChange={setCarbs} step={1} unit="g" />
            <Stepper label={tx.fat} value={fat} onChange={setFat} step={1} unit="g" />
          </FormCard>
        </ScrollView>
        <SubmitBar label={tx.submit} onPress={save} loading={saving} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: k.surfaceSunken },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  codeLine: { fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 16 },
  photoRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  photoBox: { flex: 1, height: 120, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoTxt: { fontSize: 13, fontWeight: '700' },
  per100: { fontSize: 12, fontWeight: '700', marginBottom: 10 },
  black: { flex: 1, backgroundColor: '#000' },
  camTop: { position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center' },
  camTitle: { color: '#fff', fontSize: 16, fontWeight: '800', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  camBottom: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center', gap: 16 },
  shutter: { width: 74, height: 74, borderRadius: 37, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  camCancel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
