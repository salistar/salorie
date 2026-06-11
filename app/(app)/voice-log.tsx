import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Mic, Square, Check, RotateCcw } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { addNutritionLog } from '../../lib/firebase';
import { todayStr } from '../../lib/tracking';
import { parseMealFromAudio, ParsedMeal } from '../../lib/voiceMeal';

const GREEN = '#2E8B57';
type Phase = 'idle' | 'recording' | 'analyzing' | 'preview' | 'saved';

export default function VoiceLog() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [phase, setPhase] = useState<Phase>('idle');
  const [meal, setMeal] = useState<ParsedMeal | null>(null);
  const [err, setErr] = useState('');
  const recRef = useRef<Audio.Recording | null>(null);

  const start = async () => {
    setErr('');
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { setErr('Permission micro refusée.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recRef.current = recording;
      setPhase('recording');
    } catch (e: any) { setErr(e?.message || 'Erreur micro'); }
  };

  const stop = async () => {
    const rec = recRef.current;
    if (!rec) return;
    setPhase('analyzing');
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recRef.current = null;
      if (!uri) throw new Error('Pas d\'audio');
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const parsed = await parseMealFromAudio(base64, 'audio/mp4');
      if (!parsed || !parsed.name) { setErr('Je n\'ai pas compris d\'aliment. Réessaie en parlant clairement.'); setPhase('idle'); return; }
      setMeal(parsed);
      setPhase('preview');
    } catch (e: any) { setErr(e?.message || 'Erreur d\'analyse'); setPhase('idle'); }
  };

  const save = async () => {
    if (!meal || !email) return;
    try {
      await addNutritionLog({
        userId: email, type: 'meal', name: meal.name,
        calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat,
        date: todayStr(),
      } as any);
      setPhase('saved');
    } catch (e: any) { Alert.alert('Erreur', e?.message || 'Échec de l\'enregistrement'); }
  };

  const reset = () => { setMeal(null); setErr(''); setPhase('idle'); };

  return (
    <SafeAreaView style={s.safe}>
      <ScreenTopBar />
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.head}><Mic size={26} color={GREEN} /><Text style={s.title}>Logging vocal</Text></View>
        <Text style={s.sub}>Dis ce que tu as mangé (ex: « un bol de couscous au poulet et une orange ») — l'IA transcrit et estime les calories.</Text>

        {(phase === 'idle' || phase === 'recording' || phase === 'analyzing') && (
          <View style={s.micWrap}>
            <TouchableOpacity
              style={[s.micBtn, phase === 'recording' && s.micBtnRec]}
              onPress={phase === 'recording' ? stop : start}
              disabled={phase === 'analyzing'}
            >
              {phase === 'analyzing' ? <ActivityIndicator color="#fff" size="large" />
                : phase === 'recording' ? <Square size={42} color="#fff" fill="#fff" />
                : <Mic size={48} color="#fff" />}
            </TouchableOpacity>
            <Text style={s.micLabel}>
              {phase === 'recording' ? 'Enregistrement… appuie pour arrêter'
                : phase === 'analyzing' ? 'Analyse en cours…'
                : 'Appuie pour parler'}
            </Text>
          </View>
        )}

        {!!err && <Text style={s.err}>{err}</Text>}

        {phase === 'preview' && meal && (
          <View style={s.card}>
            <Text style={s.mealName}>{meal.name}</Text>
            <Text style={s.kcal}>{meal.calories} kcal</Text>
            <View style={s.macros}>
              <View style={s.macro}><Text style={s.mVal}>{meal.protein}g</Text><Text style={s.mLbl}>Protéines</Text></View>
              <View style={s.macro}><Text style={s.mVal}>{meal.carbs}g</Text><Text style={s.mLbl}>Glucides</Text></View>
              <View style={s.macro}><Text style={s.mVal}>{meal.fat}g</Text><Text style={s.mLbl}>Lipides</Text></View>
            </View>
            <View style={s.actions}>
              <TouchableOpacity style={s.retry} onPress={reset}><RotateCcw size={15} color={GREEN} /><Text style={s.retryTxt} numberOfLines={1}>Refaire</Text></TouchableOpacity>
              <TouchableOpacity style={s.add} onPress={save}><Check size={17} color="#fff" /><Text style={s.addTxt} numberOfLines={1}>Ajouter</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {phase === 'saved' && meal && (
          <View style={s.card}>
            <Check size={40} color={GREEN} style={{ alignSelf: 'center' }} />
            <Text style={s.savedTxt}>« {meal.name} » ajouté ({meal.calories} kcal) ✅</Text>
            <TouchableOpacity style={s.add} onPress={reset}><Mic size={18} color="#fff" /><Text style={s.addTxt}>Logger un autre repas</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f6f4' },
  body: { padding: 18, paddingBottom: 90 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 26, fontWeight: '800', color: '#1B2A33' },
  sub: { fontSize: 13, color: '#667085', marginTop: 6, lineHeight: 19 },
  micWrap: { alignItems: 'center', marginTop: 50 },
  micBtn: { width: 130, height: 130, borderRadius: 65, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: GREEN, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  micBtnRec: { backgroundColor: '#e11d48' },
  micLabel: { marginTop: 20, fontSize: 14, color: '#667085', fontWeight: '600' },
  err: { color: '#e11d48', fontSize: 13, marginTop: 18, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 22, marginTop: 28, borderWidth: 1, borderColor: '#e6ece8' },
  mealName: { fontSize: 20, fontWeight: '800', color: '#1B2A33', textAlign: 'center' },
  kcal: { fontSize: 40, fontWeight: '900', color: GREEN, textAlign: 'center', marginTop: 4 },
  macros: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 18 },
  macro: { alignItems: 'center' },
  mVal: { fontSize: 18, fontWeight: '800', color: '#1B2A33' },
  mLbl: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  retry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5, borderColor: GREEN },
  retryTxt: { color: GREEN, fontWeight: '700', fontSize: 14.5, flexShrink: 1 },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flex: 1, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 14, backgroundColor: GREEN },
  addTxt: { color: '#fff', fontWeight: '800', fontSize: 14.5, flexShrink: 1 },
  savedTxt: { fontSize: 16, fontWeight: '700', color: '#1B2A33', textAlign: 'center', marginVertical: 16 },
});
