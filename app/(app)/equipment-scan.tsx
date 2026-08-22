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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Camera, ImageIcon, Dumbbell, Flame, BookOpen } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenTopBar from '../../components/ScreenTopBar';
import { aiVision } from '../../lib/aiProxy';
import { analyzeImageUri } from '../../lib/imageAI';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Equipment scanner', sub: 'Take a photo of a gym machine — AI tells you what it is, which muscles it works, how to use it, and calories burned.', cam: 'Take photo', lib: 'Gallery', analyzing: 'Analyzing…', muscles: 'Muscles', howto: 'How to use', cal: 'Calories (30 min)', err: 'Analysis failed. Try again.' },
  fr: { title: "Scanner d'équipement", sub: "Prends en photo un appareil de sport — l'IA te dit ce que c'est, les muscles travaillés, comment l'utiliser et les calories brûlées.", cam: 'Prendre une photo', lib: 'Galerie', analyzing: 'Analyse…', muscles: 'Muscles', howto: 'Comment l\'utiliser', cal: 'Calories (30 min)', err: "L'analyse a échoué. Réessaie." },
  ar: { title: 'ماسح الأجهزة الرياضية', sub: 'التقط صورة لجهاز رياضي — يخبرك الذكاء الاصطناعي ما هو، والعضلات المستهدفة، وكيفية استخدامه، والسعرات المحروقة.', cam: 'التقط صورة', lib: 'المعرض', analyzing: 'جارٍ التحليل…', muscles: 'العضلات', howto: 'طريقة الاستخدام', cal: 'سعرات (30 دقيقة)', err: 'فشل التحليل. حاول مجدداً.' },
};

export default function EquipmentScan() {
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  // Accent thémé : GREEN est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  const accent = isDark ? '#4ade80' : GREEN;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);

  const pick = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const r = camera ? await ImagePicker.launchCameraAsync({ quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (r.canceled || !r.assets?.[0]?.uri) return;
    setPhoto(r.assets[0].uri); setRes(null); setBusy(true);
    try {
      const langName = language === 'fr' ? 'French' : language === 'ar' ? 'Arabic' : 'English';
      const out = await analyzeImageUri(
        `You are a certified gym coach. Identify the gym equipment/machine in this photo. Reply ONLY with JSON: {"name":"...","muscles":["..."],"howto":"3 short steps, beginner friendly","kcal30":number} in ${langName}.`,
        r.assets[0].uri,
        { maxWidth: 800 },
      );
      const m = out.match(/\{[\s\S]*\}/);
      setRes(m ? JSON.parse(m[0]) : null);
      if (!m) Alert.alert(t.title, t.err);
    } catch { Alert.alert(t.title, t.err); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[accent, '#1d6440']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroBanner}>
          <Dumbbell size={30} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={[s.heroTitle, align]}>{t.title}</Text>
            <Text style={[s.heroSub, align]}>{t.sub}</Text>
          </View>
        </LinearGradient>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          <TouchableOpacity style={[s.btn, { backgroundColor: accent }]} onPress={() => pick(true)} disabled={busy}>
            <Camera size={18} color="#fff" /><Text style={s.btnTxt} numberOfLines={1}>{t.cam}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: isDark ? '#334155' : '#e2e8f0' }]} onPress={() => pick(false)} disabled={busy}>
            <ImageIcon size={18} color={isDark ? '#fff' : '#0f172a'} /><Text style={[s.btnTxt, { color: isDark ? '#fff' : '#0f172a' }]} numberOfLines={1}>{t.lib}</Text>
          </TouchableOpacity>
        </View>

        {photo && <Image source={{ uri: photo }} style={s.photo} resizeMode="cover" />}
        {busy && (
          <View style={{ alignItems: 'center', marginTop: 20 }}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={{ color: sub, marginTop: 8 }}>{t.analyzing}</Text>
          </View>
        )}

        {res && (
          <View style={[s.card, { backgroundColor: card }]}>
            <Text style={[s.resName, { color: text }, align]}>{res.name}</Text>
            <View style={[s.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Dumbbell size={16} color={accent} />
              <Text style={[s.rowTxt, { color: sub }, align]}>{t.muscles} : {(res.muscles || []).join(', ')}</Text>
            </View>
            <View style={[s.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Flame size={16} color="#ea580c" />
              <Text style={[s.rowTxt, { color: sub }, align]}>{t.cal} : ~{res.kcal30} kcal</Text>
            </View>
            <View style={[s.row, { flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'flex-start' }]}>
              <BookOpen size={16} color={accent} style={{ marginTop: 2 }} />
              <Text style={[s.rowTxt, { color: text, flex: 1 }, align]}>{res.howto}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 18, paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  sub: { fontSize: 13.5, marginTop: 6, lineHeight: 19 },
  heroBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 18 },
  heroTitle: { color: '#fff', fontSize: 21, fontWeight: '900', letterSpacing: -0.3 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 4, lineHeight: 17 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 14, flexShrink: 1 },
  photo: { width: '100%', height: 220, borderRadius: 18, marginTop: 16 },
  card: { borderRadius: 18, padding: 16, marginTop: 16, gap: 10 },
  resName: { fontSize: 18, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTxt: { fontSize: 13.5, lineHeight: 19 },
});
