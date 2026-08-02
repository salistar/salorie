// Import de l'historique alimentaire depuis un export CSV (MyFitnessPal / Yazio / autres).
// Réduit le coût de switch depuis un concurrent : l'utilisateur importe ses repas passés.
// DocumentPicker est requis de façon DÉFENSIVE (module natif) → si non linké (build pas
// à jour), on affiche un message clair au lieu de planter.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { Upload, FileText, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useUser } from '@clerk/clerk-expo';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { useLogging } from '../../lib/LoggingContext';
import { addNutritionLog } from '../../lib/firebase';
import { parseFoodExport, ImportedLog } from '../../lib/importParsers';
import { useScreenGate } from '../../components/FeatureGate';

// Module natif chargé de façon défensive (autolinké au prochain build).
let DocumentPicker: any = null;
try { DocumentPicker = require('expo-document-picker'); } catch { /* pas encore linké */ }

const T: any = {
  en: { title: 'Import history', sub: 'Bring your food log from MyFitnessPal, Yazio, Cronometer… Export a CSV from that app, then pick it here.',
    pick: 'Choose a CSV file', parsing: 'Reading file…', found: (n: number) => `${n} meals found`, skipped: (n: number) => `${n} rows skipped (missing date/name/calories)`,
    import: (n: number) => `Import ${n} meals`, importing: 'Importing…', done: 'Import complete', doneSub: (n: number) => `${n} meals added to your diary.`, toDiary: 'Open diary',
    again: 'Import another file', noModule: 'File picker unavailable in this build. Rebuild the app to enable CSV import.', empty: 'No valid meals found in this file. Make sure it has Date, Food and Calories columns.', error: 'Could not read this file.' },
  fr: { title: 'Importer l\'historique', sub: 'Récupère ton journal depuis MyFitnessPal, Yazio, Cronometer… Exporte un CSV depuis cette appli, puis sélectionne-le ici.',
    pick: 'Choisir un fichier CSV', parsing: 'Lecture du fichier…', found: (n: number) => `${n} repas trouvés`, skipped: (n: number) => `${n} lignes ignorées (date/nom/calories manquants)`,
    import: (n: number) => `Importer ${n} repas`, importing: 'Import en cours…', done: 'Import terminé', doneSub: (n: number) => `${n} repas ajoutés à ton journal.`, toDiary: 'Ouvrir le journal',
    again: 'Importer un autre fichier', noModule: 'Sélecteur de fichier indisponible dans ce build. Reconstruis l\'app pour activer l\'import CSV.', empty: 'Aucun repas valide dans ce fichier. Vérifie qu\'il contient des colonnes Date, Aliment et Calories.', error: 'Impossible de lire ce fichier.' },
  ar: { title: 'استيراد السجل', sub: 'استورد سجلك من MyFitnessPal أو Yazio أو Cronometer… صدّر ملف CSV من ذلك التطبيق ثم اخترْه هنا.',
    pick: 'اختر ملف CSV', parsing: 'قراءة الملف…', found: (n: number) => `${n} وجبات موجودة`, skipped: (n: number) => `${n} صفوف مُتجاهَلة (تاريخ/اسم/سعرات ناقصة)`,
    import: (n: number) => `استيراد ${n} وجبات`, importing: 'جارٍ الاستيراد…', done: 'اكتمل الاستيراد', doneSub: (n: number) => `تمت إضافة ${n} وجبات إلى سجلك.`, toDiary: 'فتح السجل',
    again: 'استيراد ملف آخر', noModule: 'منتقي الملفات غير متاح في هذا الإصدار. أعد بناء التطبيق لتفعيل الاستيراد.', empty: 'لا توجد وجبات صالحة في هذا الملف. تأكد من وجود أعمدة التاريخ والطعام والسعرات.', error: 'تعذّرت قراءة هذا الملف.' },
};

type Phase = 'idle' | 'parsing' | 'preview' | 'importing' | 'done' | 'error';

export default function ImportDataScreen() {
  const __gate = useScreenGate('import-recipe');
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const { triggerRefresh } = useLogging();
  const t = T[language] || T.en;
  const isDark = resolved === 'dark';

  const bg = isDark ? '#0B0F14' : '#F4F7F9';
  const card = isDark ? '#161C23' : '#ffffff';
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const sub = isDark ? '#94A3B8' : '#64748B';
  // Accent thémé : vert clair en mode clair, token dark officiel en sombre.
  const accent = isDark ? '#4ade80' : '#2E8B57';

  const [phase, setPhase] = useState<Phase>('idle');
  const [logs, setLogs] = useState<ImportedLog[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg] = useState('');

  const pickFile = async () => {
    if (!DocumentPicker?.getDocumentAsync) { setErrMsg(t.noModule); setPhase('error'); return; }
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setPhase('parsing');
      const content = await FileSystem.readAsStringAsync(res.assets[0].uri);
      const { logs: parsed, skipped: sk } = parseFoodExport(content);
      if (!parsed.length) { setErrMsg(t.empty); setPhase('error'); return; }
      setLogs(parsed); setSkipped(sk); setPhase('preview');
    } catch (e: any) {
      setErrMsg(t.error); setPhase('error');
    }
  };

  const runImport = async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email || !logs.length) return;
    setPhase('importing'); setProgress(0);
    let done = 0;
    for (const l of logs) {
      try {
        await addNutritionLog({
          userId: email, type: 'meal', name: l.name,
          calories: l.calories, protein: l.protein, carbs: l.carbs, fat: l.fat,
          slot: l.slot, date: l.date, source: 'import',
        } as any);
      } catch { /* offline-first : addNutritionLog met en file, on continue */ }
      done++; if (done % 3 === 0 || done === logs.length) setProgress(done);
    }
    try { triggerRefresh?.(); } catch {}
    setProgress(logs.length);
    setPhase('done');
  };

  if (!__gate.ok) return __gate.node;

  const btn = (label: string, onPress: () => void, primary = true, icon?: React.ReactNode) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={[styles.btn, { backgroundColor: primary ? accent : 'transparent', borderColor: accent, borderWidth: primary ? 0 : 1.5 }]}>
      {icon}
      <Text style={[styles.btnTxt, { color: primary ? '#fff' : accent }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showBrand showNotif={false} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: text, textAlign: isRTL ? 'right' : 'left' }]}>{t.title}</Text>
        <Text style={[styles.sub, { color: sub, textAlign: isRTL ? 'right' : 'left' }]}>{t.sub}</Text>

        <View style={[styles.cardBox, { backgroundColor: card }]}>
          {phase === 'idle' && btn(t.pick, pickFile, true, <Upload size={18} color="#fff" strokeWidth={2.5} />)}

          {phase === 'parsing' && (
            <View style={styles.center}><ActivityIndicator color={accent} /><Text style={[styles.muted, { color: sub }]}>{t.parsing}</Text></View>
          )}

          {phase === 'preview' && (
            <View style={{ gap: 12 }}>
              <View style={[styles.rowIcon, isRTL && { flexDirection: 'row-reverse' }]}>
                <FileText size={18} color={accent} strokeWidth={2.5} />
                <Text style={[styles.found, { color: text }]}>{t.found(logs.length)}</Text>
              </View>
              {skipped > 0 && <Text style={[styles.muted, { color: sub }]}>{t.skipped(skipped)}</Text>}
              {btn(t.import(logs.length), runImport, true, <CheckCircle2 size={18} color="#fff" strokeWidth={2.5} />)}
            </View>
          )}

          {phase === 'importing' && (
            <View style={styles.center}>
              <ActivityIndicator color={accent} />
              <Text style={[styles.muted, { color: sub }]}>{t.importing} {progress}/{logs.length}</Text>
            </View>
          )}

          {phase === 'done' && (
            <View style={{ gap: 12, alignItems: 'center' }}>
              <CheckCircle2 size={40} color={accent} strokeWidth={2} />
              <Text style={[styles.found, { color: text }]}>{t.done}</Text>
              <Text style={[styles.muted, { color: sub, textAlign: 'center' }]}>{t.doneSub(logs.length)}</Text>
              {btn(t.toDiary, () => router.replace('/(tabs)' as any), true)}
              {btn(t.again, () => { setLogs([]); setSkipped(0); setPhase('idle'); }, false)}
            </View>
          )}

          {phase === 'error' && (
            <View style={{ gap: 12, alignItems: 'center' }}>
              <AlertTriangle size={34} color="#D97706" strokeWidth={2} />
              <Text style={[styles.muted, { color: sub, textAlign: 'center' }]}>{errMsg}</Text>
              {btn(t.pick, () => { setErrMsg(''); setPhase('idle'); }, false)}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.6, marginBottom: 8 },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  cardBox: { borderRadius: 20, padding: 20, gap: 14 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  btnTxt: { fontSize: 15, fontWeight: '800' },
  center: { alignItems: 'center', gap: 10, paddingVertical: 12 },
  muted: { fontSize: 13, fontWeight: '600' },
  rowIcon: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  found: { fontSize: 17, fontWeight: '800' },
});
