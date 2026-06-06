import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView, { Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { ArrowLeft, Play, Pause, Square, MapPin } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { addNutritionLog, emailToDocId } from '../lib/firebase';

const TXT: Record<string, any> = {
  en: { title: 'Solo Run', perm: 'Location permission is required to track your run.', grant: 'Grant access', dist: 'Distance', time: 'Time', pace: 'Pace', kcal: 'Calories', start: 'Start', pause: 'Pause', resume: 'Resume', finish: 'Finish', saved: 'Run saved', savedMsg: 'kcal added to your activity for today.', waiting: 'Getting your location…' },
  fr: { title: 'Course solo', perm: 'La permission de localisation est requise pour suivre ta course.', grant: 'Autoriser', dist: 'Distance', time: 'Temps', pace: 'Allure', kcal: 'Calories', start: 'Démarrer', pause: 'Pause', resume: 'Reprendre', finish: 'Terminer', saved: 'Course enregistrée', savedMsg: 'kcal ajoutées à ton activité du jour.', waiting: 'Localisation en cours…' },
  ar: { title: 'جري فردي', perm: 'إذن الموقع مطلوب لتتبّع جريك.', grant: 'السماح', dist: 'المسافة', time: 'الوقت', pace: 'الإيقاع', kcal: 'سعرات', start: 'ابدأ', pause: 'إيقاف', resume: 'استئناف', finish: 'إنهاء', saved: 'تم حفظ الجري', savedMsg: 'سعرة أُضيفت إلى نشاط اليوم.', waiting: 'جارٍ تحديد موقعك…' },
};

type Pt = { latitude: number; longitude: number };

function haversine(a: Pt, b: Pt): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la1 = (a.latitude * Math.PI) / 180;
  const la2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)); // meters
}

export default function RunScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';

  const [perm, setPerm] = useState<'loading' | 'denied' | 'ok'>('loading');
  const [region, setRegion] = useState<Region | null>(null);
  const [route, setRoute] = useState<Pt[]>([]);
  const [meters, setMeters] = useState(0);
  const [secs, setSecs] = useState(0);
  const [status, setStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [weight, setWeight] = useState(70);

  const subRef = useRef<Location.LocationSubscription | null>(null);
  const lastPt = useRef<Pt | null>(null);
  const timerRef = useRef<any>(null);
  const mapRef = useRef<MapView | null>(null);

  // Permission + initial location + cached weight.
  useEffect(() => {
    (async () => {
      try {
        const email = user?.primaryEmailAddress?.emailAddress || '';
        if (email) {
          const raw = await AsyncStorage.getItem(`profile_${emailToDocId(email)}`);
          const p = raw ? JSON.parse(raw) : null;
          if (p?.weight) setWeight(Number(p.weight) || 70);
        }
      } catch {}
      const { status: st } = await Location.requestForegroundPermissionsAsync();
      if (st !== 'granted') { setPerm('denied'); return; }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });
      } catch {}
      setPerm('ok');
    })();
    return () => { subRef.current?.remove(); if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startTracking = async () => {
    setStatus('running');
    timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
    subRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 2000 },
      (loc) => {
        const pt = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setRoute((r) => [...r, pt]);
        if (lastPt.current) {
          const d = haversine(lastPt.current, pt);
          if (d < 80) setMeters((m) => m + d); // ignore GPS jumps
        }
        lastPt.current = pt;
        mapRef.current?.animateCamera({ center: pt }, { duration: 500 });
      }
    );
  };

  const pause = () => { setStatus('paused'); subRef.current?.remove(); subRef.current = null; if (timerRef.current) clearInterval(timerRef.current); };
  const resume = () => startTracking();

  const finish = async () => {
    pause();
    setStatus('idle');
    const km = meters / 1000;
    // Running energy ≈ 1.036 kcal per kg per km (net).
    const kcal = Math.max(0, Math.round(weight * km * 1.036));
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (email && kcal > 0) {
      try {
        const today = new Date();
        const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        await addNutritionLog({
          userId: email, type: 'activity',
          name: `${t.title} · ${km.toFixed(2)} km`,
          calories: kcal, protein: 0, carbs: 0, fat: 0,
          date, duration: Math.round(secs / 60), intensity: 'medium',
        } as any);
      } catch (e) { console.warn('[run] save failed', e); }
    }
    Alert.alert(t.saved, `${kcal} ${t.savedMsg}`, [{ text: 'OK', onPress: () => router.back() }]);
  };

  const km = meters / 1000;
  const paceMin = km > 0 ? secs / 60 / km : 0; // min per km
  const kcal = Math.round(weight * km * 1.036);
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const paceStr = paceMin > 0 ? `${Math.floor(paceMin)}'${String(Math.round((paceMin % 1) * 60)).padStart(2, '0')}"` : "--'--";

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#000' : '#fff';

  if (perm === 'denied') {
    return (
      <View style={[styles.center, { backgroundColor: bg, padding: 32 }]}>
        <MapPin size={48} color={Colors.light.primary} />
        <Text style={[styles.permTxt, { color: text }]}>{t.perm}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => Location.requestForegroundPermissionsAsync().then((r) => r.status === 'granted' && setPerm('ok'))}>
          <Text style={styles.primaryBtnTxt}>{t.grant}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {region ? (
        <MapView
          ref={mapRef}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          style={StyleSheet.absoluteFill}
          initialRegion={region}
          showsUserLocation
          showsMyLocationButton={false}
          followsUserLocation
        >
          {route.length > 1 && <Polyline coordinates={route} strokeColor={Colors.light.primary} strokeWidth={6} />}
        </MapView>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={{ color: sub, marginTop: 12 }}>{t.waiting}</Text>
        </View>
      )}

      {/* Back */}
      <TouchableOpacity style={[styles.back, { backgroundColor: card }]} onPress={() => router.back()}>
        <ArrowLeft size={22} color={text} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
      </TouchableOpacity>

      {/* Stats + controls panel */}
      <View style={[styles.panel, { backgroundColor: card }]}>
        <View style={styles.statsRow}>
          <Stat label={t.dist} value={`${km.toFixed(2)}`} unit="km" text={text} sub={sub} />
          <Stat label={t.time} value={mmss} unit="" text={text} sub={sub} />
          <Stat label={t.pace} value={paceStr} unit="/km" text={text} sub={sub} />
          <Stat label={t.kcal} value={`${kcal}`} unit="kcal" text={text} sub={sub} />
        </View>

        <View style={styles.controls}>
          {status === 'idle' && (
            <TouchableOpacity style={styles.bigBtn} onPress={startTracking}>
              <Play size={26} color="#fff" fill="#fff" /><Text style={styles.bigBtnTxt}>{t.start}</Text>
            </TouchableOpacity>
          )}
          {status === 'running' && (
            <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#f59e0b' }]} onPress={pause}>
              <Pause size={26} color="#fff" fill="#fff" /><Text style={styles.bigBtnTxt}>{t.pause}</Text>
            </TouchableOpacity>
          )}
          {status === 'paused' && (
            <>
              <TouchableOpacity style={[styles.bigBtn, { flex: 1 }]} onPress={resume}>
                <Play size={24} color="#fff" fill="#fff" /><Text style={styles.bigBtnTxt}>{t.resume}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.bigBtn, { flex: 1, backgroundColor: '#ef4444' }]} onPress={finish}>
                <Square size={22} color="#fff" fill="#fff" /><Text style={styles.bigBtnTxt}>{t.finish}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function Stat({ label, value, unit, text, sub }: any) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, { color: text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: sub }]}>{label}{unit ? ` (${unit})` : ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  permTxt: { fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: 16, marginBottom: 20, lineHeight: 22 },
  primaryBtn: { backgroundColor: Colors.light.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  primaryBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  back: { position: 'absolute', top: 50, left: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  stat: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 24, fontWeight: '900', letterSpacing: -1 },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  controls: { flexDirection: 'row', gap: 12 },
  bigBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.light.primary, paddingVertical: 18, borderRadius: 18 },
  bigBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
