// Register a product whose barcode wasn't found in OpenFoodFacts. Saves the
// nutrition the user enters + a product photo + a barcode photo to the shared
// custom_products collection, so the next scan of this barcode resolves instantly.
import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, TextInput,
  ActivityIndicator, Image, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, Check, ScanBarcode } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { saveCustomProduct } from '../../lib/aiStore';

export default function RegisterProductScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const barcode = String(code || '');
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const newProductTitle = language === 'fr' ? 'Nouveau produit' : language === 'ar' ? 'منتج جديد' : 'New product';
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

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#000' : 'transparent';
  const inputBg = isDark ? '#1e293b' : '#f1f5f9';

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
      if (!perm.granted) { Alert.alert('Galerie', 'Autorise l\'accès aux photos pour choisir une image.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.25, base64: true,
      });
      if (!res.canceled && res.assets?.[0]?.base64) {
        const uri = `data:image/jpeg;base64,${res.assets[0].base64}`;
        if (mode === 'product') setProductImage(uri); else setBarcodeImage(uri);
      }
    } catch { Alert.alert('Galerie', 'Impossible d\'ouvrir la galerie.'); }
  };

  const choosePhoto = (mode: 'product' | 'barcode') => {
    Alert.alert(mode === 'product' ? 'Photo du produit' : 'Photo du code-barres', 'Source de l\'image', [
      { text: '📷 Caméra', onPress: () => openCam(mode) },
      { text: '🖼️ Galerie / Téléchargements', onPress: () => pickFromGallery(mode) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const save = async () => {
    if (!barcode) { Alert.alert('Erreur', 'Code-barres manquant.'); return; }
    if (!name.trim()) { Alert.alert('Nom requis', 'Indique au moins le nom du produit.'); return; }
    setSaving(true);
    try {
      await saveCustomProduct({
        barcode, name: name.trim(), brand: brand.trim(),
        calories: calories || '0', protein: protein || '0', carbs: carbs || '0', fat: fat || '0',
        productImage: productImage || undefined, barcodeImage: barcodeImage || undefined,
      }, user?.primaryEmailAddress?.emailAddress || '');
      Alert.alert('✅ Produit enregistré', 'Il sera reconnu au prochain scan de ce code-barres.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch {
      Alert.alert('Oups', 'Échec de l\'enregistrement. Réessaie.');
    } finally { setSaving(false); }
  };

  // Camera capture overlay
  if (capMode !== 'none') {
    return (
      <View style={styles.black}>
        <CameraView ref={camRef} style={StyleSheet.absoluteFillObject} facing="back" />
        <View style={styles.camTop}><Text style={styles.camTitle}>{capMode === 'product' ? 'Photo du produit' : 'Photo du code-barres'}</Text></View>
        <View style={styles.camBottom}>
          <TouchableOpacity style={styles.shutter} onPress={capture}><View style={styles.shutterInner} /></TouchableOpacity>
          <TouchableOpacity onPress={() => setCapMode('none')}><Text style={styles.camCancel}>Annuler</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <ScreenTopBar showBack title={newProductTitle} showBrand={false} showNotif={false} />
          <Text style={[styles.codeLine, { color: sub }]}><ScanBarcode size={14} color={sub} /> Code-barres : {barcode}</Text>

          {/* Photos */}
          <View style={styles.photoRow}>
            <TouchableOpacity style={[styles.photoBox, { backgroundColor: inputBg }]} onPress={() => choosePhoto('product')}>
              {productImage ? <Image source={{ uri: productImage }} style={styles.photo} /> : <><Camera size={26} color={sub} /><Text style={[styles.photoTxt, { color: sub }]}>Photo produit</Text></>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.photoBox, { backgroundColor: inputBg }]} onPress={() => choosePhoto('barcode')}>
              {barcodeImage ? <Image source={{ uri: barcodeImage }} style={styles.photo} /> : <><ScanBarcode size={26} color={sub} /><Text style={[styles.photoTxt, { color: sub }]}>Photo code-barres</Text></>}
            </TouchableOpacity>
          </View>

          {/* Fields */}
          <Field label="Nom du produit *" value={name} onChange={setName} placeholder="ex. Jus d'orange Marrakech" {...{ text, sub, inputBg }} />
          <Field label="Marque" value={brand} onChange={setBrand} placeholder="ex. Marrakech" {...{ text, sub, inputBg }} />
          <Text style={[styles.per100, { color: sub }]}>Valeurs pour 100 g / 100 ml</Text>
          <View style={styles.macroGrid}>
            <Field half label="Calories" value={calories} onChange={setCalories} keyboard placeholder="kcal" {...{ text, sub, inputBg }} />
            <Field half label="Protéines" value={protein} onChange={setProtein} keyboard placeholder="g" {...{ text, sub, inputBg }} />
            <Field half label="Glucides" value={carbs} onChange={setCarbs} keyboard placeholder="g" {...{ text, sub, inputBg }} />
            <Field half label="Lipides" value={fat} onChange={setFat} keyboard placeholder="g" {...{ text, sub, inputBg }} />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <><Check size={18} color="#fff" /><Text style={styles.saveTxt}>Enregistrer dans la base</Text></>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, placeholder, keyboard, half, text, sub, inputBg }: any) {
  return (
    <View style={[{ marginBottom: 14 }, half && { width: '48%' }]}>
      <Text style={[styles.label, { color: sub }]}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={sub}
        keyboardType={keyboard ? 'numeric' : 'default'}
        style={[styles.input, { backgroundColor: inputBg, color: text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.gray[50] },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  codeLine: { fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 16 },
  photoRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  photoBox: { flex: 1, height: 120, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoTxt: { fontSize: 13, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: { height: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, fontWeight: '600' },
  per100: { fontSize: 12, fontWeight: '700', marginBottom: 10 },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  saveBtn: { flexDirection: 'row', gap: 8, backgroundColor: Colors.light.primary, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  black: { flex: 1, backgroundColor: '#000' },
  camTop: { position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center' },
  camTitle: { color: '#fff', fontSize: 16, fontWeight: '800', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  camBottom: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center', gap: 16 },
  shutter: { width: 74, height: 74, borderRadius: 37, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  camCancel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
