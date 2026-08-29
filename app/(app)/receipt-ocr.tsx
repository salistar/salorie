// OCR ticket de caisse — photo → lignes structurées (backend llama-3.2, objectif-aware)
// EN PRIORITÉ ; repli sur MLKit OCR on-device + extraction Gemini si l'endpoint échoue.
import React, { useState } from 'react';
import { useTokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Camera, Image as ImageIcon, Receipt, PlusCircle } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { PrimaryButton } from '../../components/ui';
import { aiGenerate } from '../../lib/aiProxy';
import { analyzeReceipt } from '../../lib/objective/api';
import { buildObjectiveContext } from '../../lib/objective/buildContext';
import type { FoodScore } from '../../lib/objective/scoring';
import { useNutritionData } from '../../hooks/useNutritionData';
import { auth } from '../../lib/firebaseAuth';
import { addNutritionLog } from '../../lib/firebase';
import { useLogging } from '../../lib/LoggingContext';
import { useUser } from '@clerk/clerk-expo';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { useScreenGate } from '../../components/FeatureGate';

const GREEN = '#2E8B57';

// Verdict objectif par ligne (couleur + libellé court i18n).
const VERDICT_COLOR: Record<FoodScore['verdict'], string> = { great: '#16A34A', ok: '#D97706', avoid: '#DC2626' };

const TXT: any = {
  en: { title: 'Receipt scan', sub: 'Snap your receipt → merchant, total and the food items you bought, extracted automatically.', photo: 'Photo', gallery: 'Gallery', loading: 'Reading receipt…', no_text: 'No text detected. Try again with a sharper photo.', fail: 'Could not read it', error: 'error', merchant: 'Merchant', total: 'Total', items: 'Items', no_items: 'No food items found on this receipt.', verdict: { great: 'On point', ok: 'OK', avoid: 'Avoid' }, add_all: 'Add all to journal', adding: 'Adding…', added: (n: number) => `${n} item${n > 1 ? 's' : ''} added to your journal` },
  fr: { title: 'Ticket de caisse', sub: 'Photographie ton ticket → enseigne, total et aliments achetés, extraits automatiquement.', photo: 'Photo', gallery: 'Galerie', loading: 'Lecture du ticket…', no_text: 'Aucun texte détecté. Réessaie avec une photo plus nette.', fail: 'Lecture impossible', error: 'erreur', merchant: 'Enseigne', total: 'Total', items: 'Articles', no_items: 'Aucun aliment trouvé sur ce ticket.', verdict: { great: 'Idéal', ok: 'OK', avoid: 'À éviter' }, add_all: 'Tout ajouter au journal', adding: 'Ajout en cours…', added: (n: number) => `${n} article${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} au journal` },
  ar: { title: 'إيصال الشراء', sub: 'صوّر إيصالك ← المتجر والمجموع والأطعمة المشتراة تُستخرج تلقائياً.', photo: 'صورة', gallery: 'المعرض', loading: 'قراءة الإيصال…', no_text: 'لم يتم اكتشاف نص. أعد المحاولة بصورة أوضح.', fail: 'تعذّرت القراءة', error: 'خطأ', merchant: 'المتجر', total: 'المجموع', items: 'المنتجات', no_items: 'لم يتم العثور على أطعمة في هذا الإيصال.', verdict: { great: 'مثالي', ok: 'مقبول', avoid: 'تجنّب' }, add_all: 'إضافة الكل إلى السجل', adding: 'جارٍ الإضافة…', added: (n: number) => `تمت إضافة ${n} عنصر إلى سجلّك` },
};

// Ligne de ticket structurée renvoyée par /receipt/analyze.
type ReceiptLine = { raw: string; food: string | null; qty: number; price: number | null; verdict?: FoodScore };
type ReceiptData = { merchant: string | null; date: string | null; total: number | null; lines: ReceiptLine[]; ok: boolean };

export default function ReceiptOcrScreen() {
  const k = useTokens();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  // Accent thémé : GREEN est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  const accent = isDark ? '#4ade80' : GREEN;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const cardTxtColor = isDark ? '#e2e8f0' : '#1F2937';
  const border = tok.border;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };
  const rowDir: any = { flexDirection: isRTL ? 'row-reverse' : 'row' };

  const today = new Date().toISOString().slice(0, 10);
  const nutrition: any = useNutritionData(today);

  // Ajout au journal (feature #102) : email Clerk + date sélectionnée + refresh des jauges.
  const { user } = useUser();
  const { selectedDate, triggerRefresh } = useLogging();

  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReceiptData | null>(null); // résultat structuré (backend, prioritaire)
  const [result, setResult] = useState(''); // texte brut (repli Gemini)
  const [adding, setAdding] = useState(false); // ajout au journal en cours
  const [addSummary, setAddSummary] = useState<string | null>(null); // résumé « N articles ajoutés »

  const __gate = useScreenGate('receipt-ocr');

  // Repli : MLKit OCR on-device + extraction Gemini. N'est utilisé QUE si le
  // backend /receipt/analyze échoue (endpoint indisponible / non parsé).
  const fallbackGemini = async (imgUri: string) => {
    const TextRecognition = (await import('@react-native-ml-kit/text-recognition')).default;
    const ocr = await TextRecognition.recognize(imgUri);
    const raw = (ocr?.text || '').slice(0, 4000);
    if (!raw.trim()) { setResult(t.no_text); return; }
    const aiTxt = await aiGenerate(`Voici le texte OCR d'un ticket de caisse :\n${raw}\n\nExtrais uniquement les PRODUITS ALIMENTAIRES (ignore le total, la TVA, l'enseigne). Pour chacun : nom + prix si visible. Liste à puces, en français. Termine par une estimation du nombre d'aliments.`);
    setResult(aiTxt.trim());
  };

  const run = async (cam: boolean) => {
    try {
      const opts = { quality: 0.6, base64: true } as const;
      const res = cam ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      const asset = res.assets?.[0];
      if (res.canceled || !asset?.uri) return;
      setUri(asset.uri); setResult(''); setData(null); setAddSummary(null); setLoading(true);

      // 1) PRIORITÉ : extraction structurée + objectif-aware via le backend.
      const b64 = asset.base64;
      if (b64) {
        try {
          const email = auth.currentUser?.email || (auth.currentUser as any)?.uid || '';
          const objective = await buildObjectiveContext(email, undefined, today, nutrition).catch(() => undefined as any);
          const r = (await analyzeReceipt(b64, objective)) as unknown as ReceiptData;
          if (r?.ok && Array.isArray(r.lines)) { setData(r); return; }
        } catch { /* repli Gemini ci-dessous */ }
      }

      // 2) REPLI : OCR on-device + Gemini (uniquement si le backend a échoué).
      await fallbackGemini(asset.uri);
    } catch (e: any) { setResult(`${t.fail} (${e?.message || t.error}).`); } finally { setLoading(false); }
  };

  // Lignes alimentaires seulement (les lignes non-food du ticket sont ignorées à l'affichage).
  const foodLines = (data?.lines || []).filter((l) => l.food);

  // Feature #102 — ajoute chaque aliment du ticket au journal (repas), à la date sélectionnée.
  // Additif : chaque ligne est isolée en try/catch → un échec ne bloque pas les autres.
  const addAllToJournal = async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email || adding || foodLines.length === 0) return;
    setAdding(true); setAddSummary(null);
    let ok = 0;
    for (const l of foodLines) {
      if (!l.food) continue;
      try {
        // kcal n'est pas typé sur FoodScore mais peut être renvoyé par le backend → lecture souple.
        const kcal = (l.verdict as any)?.kcal;
        await addNutritionLog({
          userId: email,
          type: 'meal',
          name: l.food,
          calories: Math.round(l.verdict && kcal ? kcal : 0),
          protein: 0,
          carbs: 0,
          fat: 0,
          date: selectedDate,
        });
        ok += 1;
      } catch { /* on ignore cette ligne et on continue les suivantes */ }
    }
    triggerRefresh();
    setAddSummary(t.added(ok));
    setAdding(false);
    // Feature #199 — retour haptique de succès une fois l'ajout groupé terminé.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><Receipt size={24} color={accent} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => run(true)} disabled={loading}><Camera size={20} color="#fff" /><Text style={styles.btnPrimaryTxt}>{t.photo}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => run(false)} disabled={loading}><ImageIcon size={20} color={accent} /><Text style={styles.btnGhostTxt}>{t.gallery}</Text></TouchableOpacity>
        </View>
        {uri && <Image source={{ uri }} style={styles.preview} resizeMode="cover" />}
        {loading && <View style={styles.center}><ActivityIndicator color={accent} /><Text style={[styles.loadingTxt, { color: sub }]}>{t.loading}</Text></View>}

        {/* Résultat STRUCTURÉ (backend, prioritaire) : enseigne + total + lignes (+ verdict). */}
        {data && (
          <View style={[styles.card, { backgroundColor: card }]}>
            {(data.merchant || data.total != null) && (
              <View style={[styles.recHead, rowDir, { borderBottomColor: border }]}>
                <Text style={[styles.merchant, { color: text }, align]} numberOfLines={1}>{data.merchant || t.merchant}</Text>
                {data.total != null && <Text style={[styles.total, { color: accent }]}>{t.total} {Number(data.total).toFixed(2)}</Text>}
              </View>
            )}
            <Text style={[styles.sectionLbl, { color: sub }, align]}>{t.items}</Text>
            {foodLines.length === 0 && <Text style={[styles.cardTxt, { color: sub }, align]}>{t.no_items}</Text>}
            {foodLines.map((l, i) => (
              <View key={i} style={[styles.line, rowDir]}>
                <View style={styles.lineMain}>
                  <Text style={[styles.lineName, { color: cardTxtColor }, align]} numberOfLines={2}>
                    {l.qty > 1 ? `${l.qty}× ` : ''}{l.food}
                  </Text>
                  {!!l.verdict && (
                    <View style={[styles.verdictRow, rowDir]}>
                      <View style={[styles.dot, { backgroundColor: VERDICT_COLOR[l.verdict.verdict] }]} />
                      <Text style={[styles.verdictTxt, { color: VERDICT_COLOR[l.verdict.verdict] }, align]}>
                        {t.verdict[l.verdict.verdict]} · {l.verdict.fit}/100
                      </Text>
                    </View>
                  )}
                </View>
                {l.price != null && <Text style={[styles.linePrice, { color: sub }]}>{Number(l.price).toFixed(2)}</Text>}
              </View>
            ))}

            {/* Feature #102 — ajout groupé au journal (visible dès qu'il y a des aliments). */}
            {foodLines.length > 0 && (
              <View style={styles.addBlock}>
                <PrimaryButton
                  title={adding ? t.adding : t.add_all}
                  onPress={addAllToJournal}
                  loading={adding}
                  disabled={adding}
                  icon={<PlusCircle size={18} color="#fff" />}
                />
                {!!addSummary && <Text style={[styles.addSummary, { color: accent }, align]}>{addSummary}</Text>}
              </View>
            )}
          </View>
        )}

        {/* Repli texte (Gemini) — uniquement si le backend a échoué. */}
        {!!result && <View style={[styles.card, { backgroundColor: card }]}><Text style={[styles.cardTxt, { color: cardTxtColor }, align]}>{result}</Text></View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 20 },
  btnRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16 },
  btnPrimary: { backgroundColor: GREEN }, btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnGhost: { backgroundColor: '#EAF4EE' }, btnGhostTxt: { color: GREEN, fontWeight: '800', fontSize: 15 },
  preview: { width: '100%', height: 200, borderRadius: 18, marginBottom: 16 },
  center: { alignItems: 'center', paddingVertical: 24 }, loadingTxt: { color: '#64748B', marginTop: 10, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTxt: { fontSize: 14.5, color: '#1F2937', lineHeight: 22 },
  recHead: { alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 12, marginBottom: 4, borderBottomWidth: 1 },
  merchant: { flex: 1, fontSize: 17, fontWeight: '800' },
  total: { fontSize: 15, fontWeight: '900' },
  sectionLbl: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 12, marginBottom: 6 },
  line: { alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  lineMain: { flex: 1 },
  lineName: { fontSize: 14.5, fontWeight: '600' },
  verdictRow: { alignItems: 'center', gap: 6, marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  verdictTxt: { fontSize: 12.5, fontWeight: '700' },
  linePrice: { fontSize: 14, fontWeight: '700' },
  addBlock: { marginTop: 14, gap: 8 },
  addSummary: { fontSize: 13.5, fontWeight: '700' },
});
