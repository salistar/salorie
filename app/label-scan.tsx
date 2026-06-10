// OCR d'étiquettes nutritionnelles ON-DEVICE (MLKit Text Recognition).
// Photo (caméra/galerie) → reconnaissance de texte locale → parsing kcal/macros.
// 100% on-device, hors-ligne. Gestion d'erreur robuste (jamais de crash).
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Images, ScanText, AlertTriangle } from 'lucide-react-native';
import ScreenTopBar from '../components/ScreenTopBar';

const GREEN = '#2E8B57';

type Parsed = { calories?: number; protein?: number; carbs?: number; fat?: number };

function parseNutrition(text: string): Parsed {
  const flat = text.replace(/\n/g, ' ').toLowerCase().replace(/,/g, '.');
  const out: Parsed = {};
  // Calories : ancré sur l'unité kcal (le plus fiable, quel que soit l'ordre OCR)
  const kcal = flat.match(/(\d{2,4})\s*k?cal/) || flat.match(/(?:calories|[ée]nergie)[^\d]{0,20}(\d{2,4})/);
  if (kcal) out.calories = parseFloat(kcal[1]);

  // Macros : appariement POSITIONNEL. MLKit lit souvent l'étiquette en colonnes
  // (tous les libellés, puis toutes les valeurs). On collecte les libellés DANS
  // L'ORDRE et les valeurs "N g" DANS L'ORDRE, puis on les apparie par index — ce
  // qui marche aussi en lecture ligne-à-ligne (même ordre relatif).
  // On démarre à "Calories" pour ignorer l'en-tête (ex "Pour 100 g") qui injecterait
  // un faux "100 g" et décalerait tout l'appariement.
  const startIdx = flat.search(/calor|[ée]nergie/);
  const body = startIdx >= 0 ? flat.slice(startIdx) : flat;
  const keys: (('protein' | 'carbs' | 'fat' | null))[] = [];
  const keyRe = /(prot[eé]ine|glucide|carbohydrate|carb\b|lipide|graisse|\bfat\b|sucre|\bsel\b|sodium|fibre)/g;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(body))) {
    const k = m[1];
    if (/prot/.test(k)) keys.push('protein');
    else if (/glucide|carb/.test(k)) keys.push('carbs');
    else if (/lipide|graisse|fat/.test(k)) keys.push('fat');
    else keys.push(null); // sucre / sel / sodium / fibre → occupent une position mais pas une macro
  }
  const vals: number[] = [];
  const valRe = /(\d{1,3}(?:\.\d{1,2})?)\s*g\b/g;
  while ((m = valRe.exec(body))) vals.push(parseFloat(m[1]));

  keys.forEach((key, i) => {
    if (key && vals[i] != null && out[key] == null) out[key] = vals[i];
  });
  // Repli : si l'appariement positionnel n'a rien donné, mot-clé → prochain "N g"
  const near = (re: RegExp) => { const x = flat.match(re); return x ? parseFloat(x[1]) : undefined; };
  if (out.protein == null) out.protein = near(/(?:prot[eé]ines?|protein)[^\d]{0,24}(\d{1,3}(?:\.\d)?)\s*g/);
  if (out.carbs == null) out.carbs = near(/(?:glucides|carbohydrates?|carbs)[^\d]{0,24}(\d{1,3}(?:\.\d)?)\s*g/);
  if (out.fat == null) out.fat = near(/(?:lipides|fat|graisses)[^\d]{0,24}(\d{1,3}(?:\.\d)?)\s*g/);
  return out;
}

export default function LabelScanScreen() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [text, setText] = useState<string>('');
  const [parsed, setParsed] = useState<Parsed>({});

  const run = async (fromCamera: boolean) => {
    setErr(null); setText(''); setParsed({});
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setErr('Permission refusée'); return; }
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const imageUri = res.assets[0].uri;
      setUri(imageUri);
      setLoading(true);
      // import dynamique → si le module natif manque, on tombe dans le catch (pas de crash)
      const TextRecognition = (await import('@react-native-ml-kit/text-recognition')).default;
      const result = await TextRecognition.recognize(imageUri);
      const full = (result?.text || '').trim();
      setText(full);
      setParsed(parseNutrition(full));
    } catch (e: any) {
      setErr(e?.message || 'OCR indisponible');
    } finally {
      setLoading(false);
    }
  };

  const hasParsed = parsed.calories || parsed.protein || parsed.carbs || parsed.fat;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showBrand showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}>
          <ScanText size={26} color={GREEN} />
          <Text style={styles.title}>Scanner une étiquette</Text>
        </View>
        <Text style={styles.sub}>Photographie le tableau nutritionnel — lecture de texte 100% on-device (MLKit).</Text>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.primary]} onPress={() => run(true)}>
            <Camera size={20} color="#fff" /><Text style={styles.btnTxt}>Caméra</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.secondary]} onPress={() => run(false)}>
            <Images size={20} color="#475569" /><Text style={styles.btnTxtDark}>Galerie</Text>
          </TouchableOpacity>
        </View>

        {uri && <Image source={{ uri }} style={styles.preview} resizeMode="cover" />}
        {loading && <ActivityIndicator color={GREEN} style={{ marginTop: 20 }} />}

        {err && (
          <View style={styles.warn}>
            <AlertTriangle size={16} color="#B45309" />
            <Text style={styles.warnTxt}>{err}</Text>
          </View>
        )}

        {hasParsed ? (
          <View style={styles.parsedCard}>
            <Text style={styles.parsedTitle}>Valeurs détectées</Text>
            {parsed.calories != null && <Text style={styles.parsedRow}>Calories : <Text style={styles.bold}>{parsed.calories} kcal</Text></Text>}
            {parsed.protein != null && <Text style={styles.parsedRow}>Protéines : <Text style={styles.bold}>{parsed.protein} g</Text></Text>}
            {parsed.carbs != null && <Text style={styles.parsedRow}>Glucides : <Text style={styles.bold}>{parsed.carbs} g</Text></Text>}
            {parsed.fat != null && <Text style={styles.parsedRow}>Lipides : <Text style={styles.bold}>{parsed.fat} g</Text></Text>}
          </View>
        ) : null}

        {text ? (
          <View style={styles.textCard}>
            <Text style={styles.textTitle}>Texte reconnu</Text>
            <Text style={styles.rawText}>{text}</Text>
          </View>
        ) : null}

        <Text style={styles.note}>Modèle : MLKit Text Recognition (on-device, hors-ligne).</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  body: { padding: 20, paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  sub: { fontSize: 13, color: '#64748B', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, gap: 8 },
  primary: { backgroundColor: GREEN },
  secondary: { backgroundColor: '#E2E8F0' },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnTxtDark: { color: '#475569', fontWeight: '700', fontSize: 15 },
  preview: { width: '100%', height: 200, borderRadius: 14, marginTop: 18, backgroundColor: '#E2E8F0' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginTop: 16 },
  warnTxt: { fontSize: 13, color: '#92400E', flex: 1 },
  parsedCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 18, borderWidth: 1, borderColor: '#D1FAE5' },
  parsedTitle: { fontSize: 14, fontWeight: '700', color: GREEN, marginBottom: 8 },
  parsedRow: { fontSize: 14, color: '#334155', paddingVertical: 3 },
  bold: { fontWeight: '800', color: '#0F172A' },
  textCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 14 },
  textTitle: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  rawText: { fontSize: 12, color: '#64748B', lineHeight: 18 },
  note: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 24 },
});
