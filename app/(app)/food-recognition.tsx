// Reconnaissance d'aliments par photo ON-DEVICE (TFLite / MobileNet food_V1).
// Pipeline 100% local : photo → resize → décodage pixels (jpeg-js) → tenseur →
// inférence TFLite (react-native-fast-tflite) → top-3 classes alimentaires.
// Robuste : tout est try/catch, aucun crash si le module natif manque.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode as jpegDecode } from 'jpeg-js';
import { Buffer } from 'buffer';
import { Camera, Images, Utensils, AlertTriangle } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FOOD_LABELS } from '../../lib/foodLabels';

const GREEN = '#2E8B57';

let modelPromise: Promise<any> | null = null;
async function getModel() {
  if (!modelPromise) {
    const { loadTensorflowModel } = await import('react-native-fast-tflite');
    modelPromise = loadTensorflowModel(require('../../assets/models/food_v1.tflite'));
  }
  return modelPromise;
}

type Pred = { label: string; score: number };

async function classify(uri: string): Promise<Pred[]> {
  const model = await getModel();
  const shape: number[] = model.inputs[0].shape; // [1, H, W, 3]
  const H = shape[1], W = shape[2];
  const dtype: string = model.inputs[0].dataType; // 'uint8' | 'float32'

  const manip = await ImageManipulator.manipulateAsync(
    uri, [{ resize: { width: W, height: H } }],
    { base64: true, format: ImageManipulator.SaveFormat.JPEG },
  );
  const raw = Buffer.from(manip.base64 as string, 'base64');
  const { data } = jpegDecode(raw, { useTArray: true }); // RGBA

  const px = W * H;
  let input: Uint8Array | Float32Array;
  if (dtype === 'uint8') {
    input = new Uint8Array(px * 3);
    for (let i = 0, j = 0; i < px; i++) { input[j++] = data[i * 4]; input[j++] = data[i * 4 + 1]; input[j++] = data[i * 4 + 2]; }
  } else {
    input = new Float32Array(px * 3);
    for (let i = 0, j = 0; i < px; i++) { input[j++] = data[i * 4] / 255; input[j++] = data[i * 4 + 1] / 255; input[j++] = data[i * 4 + 2] / 255; }
  }

  const out = await model.run([input]);
  const probs: ArrayLike<number> = out[0];
  // top-3 en ignorant l'index 0 (__background__)
  const idx: number[] = [];
  for (let i = 1; i < probs.length; i++) idx.push(i);
  idx.sort((a, b) => (probs[b] as number) - (probs[a] as number));
  const max = probs[idx[0]] as number;
  const norm = (v: number) => (max > 1 ? v / 255 : v); // déquantif. approx si uint8
  return idx.slice(0, 3).map((i) => ({
    label: FOOD_LABELS[i] || `class ${i}`,
    score: Math.min(1, norm(probs[i] as number)),
  }));
}

export default function FoodRecognitionScreen() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [preds, setPreds] = useState<Pred[]>([]);

  const run = async (fromCamera: boolean) => {
    setErr(null); setPreds([]);
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setErr('Permission refusée'); return; }
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setUri(res.assets[0].uri);
      setLoading(true);
      const p = await classify(res.assets[0].uri);
      setPreds(p);
    } catch (e: any) {
      setErr(e?.message || 'Modèle indisponible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showBrand showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}>
          <Utensils size={26} color={GREEN} />
          <Text style={styles.title}>Reconnaître un aliment</Text>
        </View>
        <Text style={styles.sub}>Photographie ton plat — classification 100% on-device (TFLite / MobileNet, 2024 aliments).</Text>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.primary]} onPress={() => run(true)}>
            <Camera size={20} color="#fff" /><Text style={styles.btnTxt}>Caméra</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.secondary]} onPress={() => run(false)}>
            <Images size={20} color="#475569" /><Text style={styles.btnTxtDark}>Galerie</Text>
          </TouchableOpacity>
        </View>

        {uri && <Image source={{ uri }} style={styles.preview} resizeMode="cover" />}
        {loading && <View style={styles.loadingRow}><ActivityIndicator color={GREEN} /><Text style={styles.muted}>  Analyse on-device…</Text></View>}

        {err && (
          <View style={styles.warn}><AlertTriangle size={16} color="#B45309" /><Text style={styles.warnTxt}>{err}</Text></View>
        )}

        {preds.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Résultats</Text>
            {preds.map((p, i) => (
              <View key={i} style={styles.predRow}>
                <Text style={[styles.predName, i === 0 && styles.bold]} numberOfLines={1}>{p.label}</Text>
                <Text style={styles.predScore}>{Math.round(p.score * 100)}%</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.note}>Modèle : TFLite MobileNet (AIY food_V1, on-device, hors-ligne).</Text>
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
  preview: { width: '100%', height: 220, borderRadius: 14, marginTop: 18, backgroundColor: '#E2E8F0' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  muted: { fontSize: 13, color: '#94A3B8' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginTop: 16 },
  warnTxt: { fontSize: 13, color: '#92400E', flex: 1 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 18, borderWidth: 1, borderColor: '#D1FAE5' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: GREEN, marginBottom: 8 },
  predRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  predName: { fontSize: 14, color: '#334155', flex: 1, marginRight: 8 },
  bold: { fontWeight: '800', color: '#0F172A' },
  predScore: { fontSize: 13, color: GREEN, fontWeight: '700' },
  note: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 24 },
});
