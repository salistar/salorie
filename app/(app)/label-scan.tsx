// OCR d'étiquettes nutritionnelles ON-DEVICE (MLKit Text Recognition).
// Photo (caméra/galerie) → reconnaissance de texte locale → parsing kcal/macros.
// 100% on-device, hors-ligne. Gestion d'erreur robuste (jamais de crash).
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Images, ScanText, AlertTriangle } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { computeHealthScore, VERDICT_TXT } from '../../lib/healthScore';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Scan a label', sub: 'Snap the nutrition facts table — 100% on-device text recognition (MLKit).', camera: 'Camera', gallery: 'Gallery', detected: 'Detected values', calories: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat', recognized: 'Recognized text', note: 'Model: MLKit Text Recognition (on-device, offline).', permDenied: 'Permission denied', ocrUnavailable: 'OCR unavailable' },
  fr: { title: 'Scanner une étiquette', sub: 'Photographie le tableau nutritionnel — lecture de texte 100% on-device (MLKit).', camera: 'Caméra', gallery: 'Galerie', detected: 'Valeurs détectées', calories: 'Calories', protein: 'Protéines', carbs: 'Glucides', fat: 'Lipides', recognized: 'Texte reconnu', note: 'Modèle : MLKit Text Recognition (on-device, hors-ligne).', permDenied: 'Permission refusée', ocrUnavailable: 'OCR indisponible' },
  ar: { title: 'مسح ملصق غذائي', sub: 'صوّر جدول القيم الغذائية — قراءة نص 100% على الجهاز (MLKit).', camera: 'الكاميرا', gallery: 'المعرض', detected: 'القيم المكتشفة', calories: 'السعرات', protein: 'البروتين', carbs: 'الكربوهيدرات', fat: 'الدهون', recognized: 'النص المتعرف عليه', note: 'النموذج: MLKit Text Recognition (على الجهاز، دون اتصال).', permDenied: 'تم رفض الإذن', ocrUnavailable: 'OCR غير متوفر' },
};

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
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F8FAFC';
  const card = isDark ? '#1e293b' : '#ffffff';
  const fg = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

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
      if (!perm.granted) { setErr(t.permDenied); return; }
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
      setErr(e?.message || t.ocrUnavailable);
    } finally {
      setLoading(false);
    }
  };

  const hasParsed = parsed.calories || parsed.protein || parsed.carbs || parsed.fat;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showBrand showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}>
          <ScanText size={26} color={GREEN} />
          <Text style={[styles.title, { color: fg }]}>{t.title}</Text>
        </View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.primary]} onPress={() => run(true)}>
            <Camera size={20} color="#fff" /><Text style={styles.btnTxt}>{t.camera}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.secondary, isDark && { backgroundColor: '#334155' }]} onPress={() => run(false)}>
            <Images size={20} color={isDark ? '#cbd5e1' : '#475569'} /><Text style={[styles.btnTxtDark, isDark && { color: '#cbd5e1' }]}>{t.gallery}</Text>
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
          <View style={[styles.parsedCard, { backgroundColor: card }, isDark && { borderColor: '#334155' }]}>
            <Text style={[styles.parsedTitle, align]}>{t.detected}</Text>
            {parsed.calories != null && <Text style={[styles.parsedRow, { color: isDark ? '#cbd5e1' : '#334155' }, align]}>{t.calories} : <Text style={[styles.bold, { color: fg }]}>{parsed.calories} kcal</Text></Text>}
            {parsed.protein != null && <Text style={[styles.parsedRow, { color: isDark ? '#cbd5e1' : '#334155' }, align]}>{t.protein} : <Text style={[styles.bold, { color: fg }]}>{parsed.protein} g</Text></Text>}
            {parsed.carbs != null && <Text style={[styles.parsedRow, { color: isDark ? '#cbd5e1' : '#334155' }, align]}>{t.carbs} : <Text style={[styles.bold, { color: fg }]}>{parsed.carbs} g</Text></Text>}
            {parsed.fat != null && <Text style={[styles.parsedRow, { color: isDark ? '#cbd5e1' : '#334155' }, align]}>{t.fat} : <Text style={[styles.bold, { color: fg }]}>{parsed.fat} g</Text></Text>}
          </View>
        ) : null}

        {hasParsed ? (() => {
          const h = computeHealthScore({ kcal: parsed.calories, protein: parsed.protein, carbs: parsed.carbs, fat: parsed.fat });
          return (
            <View style={[styles.healthBadge, { backgroundColor: h.color + '1A', borderColor: h.color }]}>
              <View style={[styles.healthGrade, { backgroundColor: h.color }]}>
                <Text style={styles.healthGradeTxt}>{h.grade}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.healthVerdict, { color: h.color }, align]}>{(VERDICT_TXT[language] || VERDICT_TXT.en)[h.verdict]}</Text>
                <Text style={[styles.healthSub, { color: sub }, align]}>
                  {h.score}/100{h.approx ? ' ~' : ''} · {language === 'fr' ? 'calcul sur l’appareil' : language === 'ar' ? 'حساب على الجهاز' : 'computed on-device'}
                </Text>
              </View>
            </View>
          );
        })() : null}

        {text ? (
          <View style={[styles.textCard, { backgroundColor: card }]}>
            <Text style={[styles.textTitle, { color: isDark ? '#cbd5e1' : '#334155' }, align]}>{t.recognized}</Text>
            <Text style={[styles.rawText, { color: sub }]}>{text}</Text>
          </View>
        ) : null}

        <Text style={[styles.note, { color: sub }]}>{t.note}</Text>
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
