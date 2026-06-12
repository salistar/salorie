// Photos de progression — capture + galerie locale (persistée sur l'appareil).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Image, Dimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Camera, Image as ImageIcon, TrendingUp } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';

const GREEN = '#2E8B57';
const KEY = 'progress_photos_v1';
const COL = (Dimensions.get('window').width - 52) / 2;

const TXT: any = {
  en: { title: 'Progress photos', sub: 'Keep a visual record (stored on your device, private).', photo: 'Photo', gallery: 'Gallery', empty: 'No photos yet. Add your first one to track your progress.' },
  fr: { title: 'Photos de progression', sub: 'Garde une trace visuelle (stockée sur ton appareil, privée).', photo: 'Photo', gallery: 'Galerie', empty: 'Aucune photo. Ajoute ta première pour suivre ton évolution.' },
  ar: { title: 'صور التقدم', sub: 'احتفظ بسجل مرئي (مخزّن على جهازك، خاص).', photo: 'صورة', gallery: 'المعرض', empty: 'لا توجد صور. أضف أول صورة لتتابع تطورك.' },
};

export default function ProgressPhotosScreen() {
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const [photos, setPhotos] = useState<{ uri: string; date: string }[]>([]);

  const load = async () => { try { const r = await AsyncStorage.getItem(KEY); if (r) setPhotos(JSON.parse(r)); } catch {} };
  useEffect(() => { load(); }, []);

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
      const next = [{ uri: dest, date }, ...photos];
      setPhotos(next);
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><TrendingUp size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => add(true)}><Camera size={20} color="#fff" /><Text style={styles.btnPrimaryTxt}>{t.photo}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => add(false)}><ImageIcon size={20} color={GREEN} /><Text style={styles.btnGhostTxt}>{t.gallery}</Text></TouchableOpacity>
        </View>

        {photos.length === 0 ? <Text style={styles.empty}>{t.empty}</Text> : (
          <View style={styles.grid}>
            {photos.map((p, i) => (
              <View key={i} style={styles.cell}>
                <Image source={{ uri: p.uri }} style={[styles.photo, isDark && { backgroundColor: '#334155' }]} resizeMode="cover" />
                <Text style={[styles.date, { color: sub }]}>{p.date}</Text>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: { width: COL, marginBottom: 12 },
  photo: { width: COL, height: COL * 1.3, borderRadius: 16, backgroundColor: '#E5E7EB' },
  date: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: 6, textAlign: 'center' },
});
