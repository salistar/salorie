// Photos de progression — capture + galerie locale (persistée sur l'appareil).
import React, { useEffect, useState } from 'react';
import { useTokens } from '../../constants/tokens';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Image, Dimensions, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Camera, Image as ImageIcon, TrendingUp, Sparkles } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import PhotoStrip from '../../components/PhotoStrip';
import { aiVision, aiGenerate } from '../../lib/aiProxy';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { useScreenGate } from '../../components/FeatureGate';
import { useUser } from '@clerk/clerk-expo';
// Synchronisation vers Firebase Storage : c'est ce qui fait qu'une photo prise
// ici se retrouve sur app.salorie.salistar.com/me/photos, et l'inverse.
import { televerser, stockageConfigure, jourLocal } from '../../lib/photosProgressionSync';

const GREEN = '#2E8B57';
const KEY = 'progress_photos_v1';
const COL = (Dimensions.get('window').width - 52) / 2;

const TXT: any = {
  en: { title: 'Progress photos', sub: 'Keep a visual record. New photos sync to your account so you can compare them on a large screen; only you can see them.', photo: 'Photo', gallery: 'Gallery', empty: 'No photos yet. Add your first one to track your progress.', analyze: 'Analyze my evolution', analyzing: 'Analyzing…', needTwo: 'Add at least 2 photos to analyze your evolution.', result: 'Evolution analysis', err: 'Analysis unavailable.', send: 'Send to my account', sent: '✓ Synced' },
  fr: { title: 'Photos de progression', sub: 'Garde une trace visuelle. Les nouvelles photos rejoignent ton compte pour se comparer sur grand écran ; toi seul(e) peux les voir.', photo: 'Photo', gallery: 'Galerie', empty: 'Aucune photo. Ajoute ta première pour suivre ton évolution.', analyze: 'Analyser mon évolution', analyzing: 'Analyse…', needTwo: 'Ajoute au moins 2 photos pour analyser ton évolution.', result: 'Analyse de l’évolution', err: 'Analyse indisponible.', send: 'Envoyer vers mon compte', sent: '✓ Synchronisée' },
  ar: { title: 'صور التقدم', sub: 'احتفظ بسجل مرئي. الصور الجديدة تُزامَن مع حسابك لمقارنتها على شاشة كبيرة؛ أنت وحدك من يراها.', photo: 'صورة', gallery: 'المعرض', empty: 'لا توجد صور. أضف أول صورة لتتابع تطورك.', analyze: 'حلّل تطوري', analyzing: 'جارٍ التحليل…', needTwo: 'أضف صورتين على الأقل لتحليل تطورك.', result: 'تحليل التطور', err: 'التحليل غير متاح.', send: 'أرسل إلى حسابي', sent: '✓ مُزامنة' },
};

export default function ProgressPhotosScreen() {
  const __gate = useScreenGate('progress-photos');
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  // Accent thémé : GREEN est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  const accent = isDark ? '#4ade80' : GREEN;
  const tok = useTokens();
  const bg = tok.bg;
  const text = tok.text;
  const sub = tok.textMuted;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const [photos, setPhotos] = useState<{ uri: string; date: string; distant?: string }[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState('');

  const load = async () => { try { const r = await AsyncStorage.getItem(KEY); if (r) setPhotos(JSON.parse(r)); } catch {} };
  useEffect(() => { load(); }, []);

  // Analyse de l'évolution : compare la 1ère et la dernière photo. Aucun modèle
  // on-device ne juge le physique → on passe par le backend/Gemini (cascade).
  const analyzeEvolution = async () => {
    if (photos.length < 2 || analyzing) return;
    setAnalyzing(true); setAnalysis('');
    try {
      const latest = photos[0], first = photos[photos.length - 1];
      const b64 = async (uri: string) => {
        const m = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 512 } }], { base64: true, compress: 0.6, format: ImageManipulator.SaveFormat.JPEG });
        return m.base64 as string;
      };
      const [b1, b2] = await Promise.all([b64(first.uri), b64(latest.uri)]);
      const d1 = await aiVision('Décris en 1 phrase la silhouette/corpulence sur cette photo (objectif, neutre).', b1, 'image/jpeg');
      const d2 = await aiVision('Décris en 1 phrase la silhouette/corpulence sur cette photo (objectif, neutre).', b2, 'image/jpeg');
      const lang = language === 'fr' ? 'Réponds en français' : language === 'ar' ? 'Réponds en arabe' : 'Reply in English';
      const res = await aiGenerate(`Photo de départ (${first.date}) : ${d1}. Photo récente (${latest.date}) : ${d2}. Compare l'évolution physique entre les deux photos, donne un verdict encourageant et 2 conseils concrets. ${lang}, court (4-5 lignes).`);
      setAnalysis(res.trim());
    } catch { setAnalysis(t.err); }
    finally { setAnalyzing(false); }
  };

  const add = async (fromCamera: boolean) => {
    try {
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const ts = Date.now();
      const dest = `${FileSystem.documentDirectory}progress_${ts}.jpg`;
      await FileSystem.copyAsync({ from: res.assets[0].uri, to: dest }); // persiste
      const d = new Date(ts);
      const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      // La copie locale est ecrite D'ABORD : elle doit exister meme sans reseau,
      // et l'ecran reste utilisable hors ligne comme avant.
      const next: any[] = [{ uri: dest, date }, ...photos];
      setPhotos(next);
      await AsyncStorage.setItem(KEY, JSON.stringify(next));

      // Puis l'envoi, en arriere-plan. Un echec ne fait rien perdre : la photo
      // est deja sur l'appareil, et un prochain envoi la reprendra.
      if (email && stockageConfigure()) {
        setEnvoi(true);
        try {
          const nom = await televerser(email, dest, jourLocal(new Date(ts)));
          next[0].distant = nom;
          setPhotos([...next]);
          await AsyncStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          // Silencieux : la photo est sauve en local, c'est l'essentiel.
        } finally {
          setEnvoi(false);
        }
      }
    } catch {}
  };

  /**
   * Envoie une photo ANCIENNE, a la demande.
   *
   * Volontairement manuel : ces photos ont ete prises quand l'ecran promettait
   * « stockee sur ton appareil ». Les televerser en silence trahirait
   * retroactivement ce qui avait ete annonce.
   */
  const envoyerAncienne = async (index: number) => {
    const ph = photos[index];
    if (!ph || ph.distant || !email || envoi) return;
    setEnvoi(true);
    try {
      const nom = await televerser(email, ph.uri, jourLocal());
      const next = [...photos];
      next[index] = { ...ph, distant: nom };
      setPhotos(next);
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch {
    } finally {
      setEnvoi(false);
    }
  };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><TrendingUp size={24} color={accent} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <PhotoStrip category="health" />
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => add(true)}><Camera size={20} color="#fff" /><Text style={styles.btnPrimaryTxt}>{t.photo}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => add(false)}><ImageIcon size={20} color={accent} /><Text style={styles.btnGhostTxt}>{t.gallery}</Text></TouchableOpacity>
        </View>

        {photos.length >= 2 && (
          <TouchableOpacity style={[styles.analyzeBtn, analyzing && { opacity: 0.7 }]} onPress={analyzeEvolution} disabled={analyzing} activeOpacity={0.85}>
            {analyzing ? <ActivityIndicator color="#fff" /> : <Sparkles size={18} color="#fff" />}
            <Text style={styles.analyzeTxt}>{analyzing ? t.analyzing : t.analyze}</Text>
          </TouchableOpacity>
        )}
        {!!analysis && (
          <View style={[styles.analysisCard, { backgroundColor: isDark ? '#161C23' : '#fff' }]}>
            <Text style={[styles.analysisTitle, align]}>{t.result}</Text>
            <Text style={[styles.analysisTxt, { color: text }, align]}>{analysis}</Text>
            <Text style={[styles.analysisSrc, { color: sub }, align]}>⛅ {language === 'fr' ? 'Source : IA · Gemini (pas de modèle on-device pour juger le physique)' : language === 'ar' ? 'المصدر: ذكاء · Gemini' : 'Source: AI · Gemini'}</Text>
          </View>
        )}

        {photos.length === 0 ? <Text style={styles.empty}>{t.empty}</Text> : (
          <View style={styles.grid}>
            {photos.map((p, i) => (
              <View key={i} style={styles.cell}>
                <Image source={{ uri: p.uri }} style={[styles.photo, isDark && { backgroundColor: '#334155' }]} resizeMode="cover" />
                <Text style={[styles.date, { color: sub }]}>{p.date}</Text>
                {/* Les photos d'AVANT la synchronisation ne partent que sur ce
                    geste explicite : elles ont ete prises quand l'ecran
                    promettait « stockee sur ton appareil ». */}
                {p.distant ? (
                  <Text style={{ fontSize: 11, fontWeight: '700', marginTop: 2, color: accent }}>{t.sent}</Text>
                ) : email ? (
                  <TouchableOpacity onPress={() => envoyerAncienne(i)} disabled={envoi}>
                    <Text style={{ fontSize: 11, fontWeight: '700', marginTop: 2, textDecorationLine: 'underline', color: sub }}>
                      {envoi ? '…' : t.send}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 23, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 18 },
  btnRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16 },
  btnPrimary: { backgroundColor: GREEN },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnGhost: { backgroundColor: '#EAF4EE' },
  btnGhostTxt: { color: GREEN, fontWeight: '800', fontSize: 15 },
  empty: { color: '#94A3B8', fontSize: 14, textAlign: 'center', marginTop: 30, lineHeight: 20 },
  analyzeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 16, paddingVertical: 14, marginBottom: 16 },
  analyzeTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  analysisCard: { borderRadius: 18, borderWidth: 1.5, borderColor: GREEN, padding: 16, marginBottom: 18, gap: 6 },
  analysisTitle: { color: GREEN, fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  analysisTxt: { fontSize: 14, lineHeight: 21 },
  analysisSrc: { fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: { width: COL, marginBottom: 12 },
  photo: { width: COL, height: COL * 1.3, borderRadius: 16, backgroundColor: '#E5E7EB' },
  date: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: 6, textAlign: 'center' },
});
