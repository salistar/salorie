import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { ArrowLeft, Play, Pause, Square, MapPin, Zap, Navigation, History } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { addNutritionLog, emailToDocId } from '../lib/firebase';
import { addDistanceToJoinedChallenges } from '../lib/races';

// Google Maps JS in a WebView — same approach as the Sally apps (the JS API key
// works in a WebView with a baseUrl; react-native-maps would need a Maps SDK for
// Android key instead).
const GOOGLE_MAPS_KEY = 'AIzaSyAa1lBSroSXA-Om4mio84-SWAcmzQgYv8w';
const PRIMARY = Colors.light.primary;

const TXT: Record<string, any> = {
  en: { title: 'Solo Run', perm: 'Location permission is required to track your run.', grant: 'Grant access', dist: 'Distance', time: 'Time', pace: 'Pace', kcal: 'Calories', start: 'Start', pause: 'Pause', resume: 'Resume', finish: 'Finish', saved: 'Run saved', savedMsg: 'kcal added to your activity for today.', waiting: 'Getting your location…', gps: 'GPS', sim: 'Simulation', history: 'Recent runs', noHistory: 'No runs yet — start one above.' },
  fr: { title: 'Course solo', perm: 'La permission de localisation est requise pour suivre ta course.', grant: 'Autoriser', dist: 'Distance', time: 'Temps', pace: 'Allure', kcal: 'Calories', start: 'Démarrer', pause: 'Pause', resume: 'Reprendre', finish: 'Terminer', saved: 'Course enregistrée', savedMsg: 'kcal ajoutées à ton activité du jour.', waiting: 'Localisation en cours…', gps: 'GPS', sim: 'Simulation', history: 'Courses récentes', noHistory: 'Aucune course — démarres-en une ci-dessus.' },
  ar: { title: 'جري فردي', perm: 'إذن الموقع مطلوب لتتبّع جريك.', grant: 'السماح', dist: 'المسافة', time: 'الوقت', pace: 'الإيقاع', kcal: 'سعرات', start: 'ابدأ', pause: 'إيقاف', resume: 'استئناف', finish: 'إنهاء', saved: 'تم حفظ الجري', savedMsg: 'سعرة أُضيفت إلى نشاط اليوم.', waiting: 'جارٍ تحديد موقعك…', gps: 'GPS', sim: 'محاكاة', history: 'الجريات الأخيرة', noHistory: 'لا جريات بعد — ابدأ واحدة بالأعلى.' },
};

type LatLng = { lat: number; lng: number };

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function buildHtml(center: LatLng, color: string): string {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>html,body,#map{height:100%;width:100%;margin:0;padding:0;background:#e8f0e8}</style>
</head><body><div id="map"></div>
<script>
  var C = ${JSON.stringify(center)};
  function initMap(){
    window._path = [C];
    window._map = new google.maps.Map(document.getElementById('map'), {
      center: C, zoom: 16, disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy'
    });
    window._me = new google.maps.Marker({ position: C, map: window._map,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '${color}', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } });
    window._poly = new google.maps.Polyline({ map: window._map, path: window._path, geodesic: true, strokeColor: '${color}', strokeOpacity: 1, strokeWeight: 7 });
    window.addPoint = function(lat,lng){ var p={lat:lat,lng:lng}; window._path.push(p); window._poly.setPath(window._path); window._me.setPosition(p); window._map.panTo(p); };
    window.recenter = function(lat,lng){ window._map.setCenter({lat:lat,lng:lng}); };
    window.resetPath = function(){ window._path=[C]; window._poly.setPath(window._path); window._me.setPosition(C); window._map.setCenter(C); };
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ready');
  }
  window.gm_authFailure=function(){ document.body.innerHTML='<div style="color:#b91c1c;font-family:sans-serif;padding:24px;text-align:center">Google Maps key error.</div>'; };
</script>
<script async defer src="https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&callback=initMap"></script>
</body></html>`;
}

export default function RunScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';

  const [perm, setPerm] = useState<'loading' | 'denied' | 'ok'>('loading');
  const [center, setCenter] = useState<LatLng | null>(null);
  const [meters, setMeters] = useState(0);
  const [secs, setSecs] = useState(0);
  const [status, setStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [weight, setWeight] = useState(70);
  const [mode, setMode] = useState<'gps' | 'sim'>('gps');
  const [history, setHistory] = useState<{ name: string; date: string; calories: number; duration?: number }[]>([]);

  const subRef = useRef<Location.LocationSubscription | null>(null);
  const lastPt = useRef<LatLng | null>(null);
  const timerRef = useRef<any>(null);
  const webRef = useRef<WebView | null>(null);
  const mapReady = useRef(false);
  const simTimer = useRef<any>(null);
  const simHeading = useRef(45);
  const simStep = useRef(0);

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
        setCenter({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch { setCenter({ lat: 33.5731, lng: -7.5898 }); }
      setPerm('ok');
      loadHistory();
    })();
    return () => { subRef.current?.remove(); if (timerRef.current) clearInterval(timerRef.current); if (simTimer.current) clearInterval(simTimer.current); };
  }, []);

  // Recent runs from the local log cache (activities whose name starts with the run title).
  const loadHistory = async () => {
    try {
      const email = user?.primaryEmailAddress?.emailAddress || '';
      if (!email) return;
      const raw = await AsyncStorage.getItem(`logs_${emailToDocId(email)}`);
      const arr: any[] = raw ? JSON.parse(raw) : [];
      const runs = arr
        .filter((l) => l?.type === 'activity' && typeof l?.name === 'string' && l.name.includes(t.title))
        .slice(-12).reverse()
        .map((l) => ({ name: l.name, date: l.date, calories: l.calories || 0, duration: l.duration }));
      setHistory(runs);
    } catch {}
  };

  const startTracking = async () => {
    setStatus('running');
    timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
    if (mode === 'sim') {
      // Simulation: advance 10 m every second (10 m/s) along a gently curving path.
      if (!lastPt.current) lastPt.current = center;
      simTimer.current = setInterval(() => {
        const from = lastPt.current || center;
        if (!from) return;
        simStep.current += 1;
        simHeading.current += Math.sin(simStep.current / 5) * 12; // gentle wander
        const brg = (simHeading.current * Math.PI) / 180;
        const dLat = (10 / 111111) * Math.cos(brg);
        const dLng = (10 / (111111 * Math.cos((from.lat * Math.PI) / 180))) * Math.sin(brg);
        const pt = { lat: from.lat + dLat, lng: from.lng + dLng };
        lastPt.current = pt;
        setMeters((m) => m + 10);
        if (mapReady.current) webRef.current?.injectJavaScript(`window.addPoint && window.addPoint(${pt.lat},${pt.lng}); true;`);
      }, 1000);
      return;
    }
    subRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 2000 },
      (loc) => {
        const pt = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        if (lastPt.current) {
          const d = haversine(lastPt.current, pt);
          if (d < 80) setMeters((m) => m + d);
        }
        lastPt.current = pt;
        if (mapReady.current) webRef.current?.injectJavaScript(`window.addPoint && window.addPoint(${pt.lat},${pt.lng}); true;`);
      }
    );
  };
  const pause = () => { setStatus('paused'); subRef.current?.remove(); subRef.current = null; if (timerRef.current) clearInterval(timerRef.current); if (simTimer.current) { clearInterval(simTimer.current); simTimer.current = null; } };

  const finish = async () => {
    pause();
    setStatus('idle');
    const km = meters / 1000;
    const kcal = Math.max(0, Math.round(weight * km * 1.036));
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (email && kcal > 0) {
      try {
        const d = new Date();
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        await addNutritionLog({ userId: email, type: 'activity', name: `${t.title} · ${km.toFixed(2)} km`, calories: kcal, protein: 0, carbs: 0, fat: 0, date, duration: Math.round(secs / 60), intensity: 'medium' } as any);
        // Phase 3 sync: a solo run also advances every virtual challenge you joined.
        addDistanceToJoinedChallenges(email, km).catch(() => {});
      } catch (e) { console.warn('[run] save failed', e); }
    }
    // Reset for the next run, refresh the history list, and stay on the screen.
    setMeters(0); setSecs(0); lastPt.current = null; simStep.current = 0;
    if (mapReady.current) webRef.current?.injectJavaScript(`window.resetPath && window.resetPath(); true;`);
    await loadHistory();
    Alert.alert(t.saved, `${kcal} ${t.savedMsg}`);
  };

  const km = meters / 1000;
  const paceMin = km > 0 ? secs / 60 / km : 0;
  const kcal = Math.round(weight * km * 1.036);
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const paceStr = paceMin > 0 ? `${Math.floor(paceMin)}'${String(Math.round((paceMin % 1) * 60)).padStart(2, '0')}"` : "--'--";

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#000' : '#fff';

  const html = useMemo(() => (center ? buildHtml(center, PRIMARY) : ''), [center]);

  if (perm === 'denied') {
    return (
      <View style={[styles.center, { backgroundColor: bg, padding: 32 }]}>
        <MapPin size={48} color={PRIMARY} />
        <Text style={[styles.permTxt, { color: text }]}>{t.perm}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => Location.requestForegroundPermissionsAsync().then((r) => r.status === 'granted' && setPerm('ok'))}>
          <Text style={styles.primaryBtnTxt}>{t.grant}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {center ? (
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://localhost/' }}
          style={StyleSheet.absoluteFill}
          javaScriptEnabled
          domStorageEnabled
          onMessage={(e) => { if (e.nativeEvent.data === 'ready') mapReady.current = true; }}
          startInLoadingState
          renderLoading={() => <View style={[StyleSheet.absoluteFill, styles.center]}><ActivityIndicator size="large" color={PRIMARY} /></View>}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}><ActivityIndicator size="large" color={PRIMARY} /><Text style={{ color: sub, marginTop: 12 }}>{t.waiting}</Text></View>
      )}

      <TouchableOpacity style={[styles.back, { backgroundColor: card }]} onPress={() => router.back()}>
        <ArrowLeft size={22} color={text} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
      </TouchableOpacity>

      <View style={[styles.panel, { backgroundColor: card }]}>
        {/* Mode switch (only before a run starts) */}
        {status === 'idle' && (
          <View style={[styles.modeRow, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'gps' && { backgroundColor: card, shadowOpacity: 0.12 }]}
              onPress={() => setMode('gps')}
            >
              <Navigation size={16} color={mode === 'gps' ? PRIMARY : sub} />
              <Text style={[styles.modeTxt, { color: mode === 'gps' ? PRIMARY : sub }]}>{t.gps}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'sim' && { backgroundColor: card, shadowOpacity: 0.12 }]}
              onPress={() => setMode('sim')}
            >
              <Zap size={16} color={mode === 'sim' ? '#0ea5e9' : sub} />
              <Text style={[styles.modeTxt, { color: mode === 'sim' ? '#0ea5e9' : sub }]}>{t.sim}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.statsRow}>
          <Stat label={t.dist} value={km.toFixed(2)} unit="km" text={text} sub={sub} />
          <Stat label={t.time} value={mmss} unit="" text={text} sub={sub} />
          <Stat label={t.pace} value={paceStr} unit="/km" text={text} sub={sub} />
          <Stat label={t.kcal} value={`${kcal}`} unit="kcal" text={text} sub={sub} />
        </View>
        <View style={styles.controls}>
          {status === 'idle' && (
            <TouchableOpacity style={[styles.bigBtn, mode === 'sim' && { backgroundColor: '#0ea5e9' }]} onPress={startTracking}>
              {mode === 'sim' ? <Zap size={24} color="#fff" fill="#fff" /> : <Play size={26} color="#fff" fill="#fff" />}
              <Text style={styles.bigBtnTxt}>{mode === 'sim' ? `${t.start} · ${t.sim}` : t.start}</Text>
            </TouchableOpacity>
          )}
          {status === 'running' && (
            <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#f59e0b' }]} onPress={pause}><Pause size={26} color="#fff" fill="#fff" /><Text style={styles.bigBtnTxt}>{t.pause}</Text></TouchableOpacity>
          )}
          {status === 'paused' && (
            <>
              <TouchableOpacity style={[styles.bigBtn, { flex: 1 }]} onPress={startTracking}><Play size={24} color="#fff" fill="#fff" /><Text style={styles.bigBtnTxt}>{t.resume}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.bigBtn, { flex: 1, backgroundColor: '#ef4444' }]} onPress={finish}><Square size={22} color="#fff" fill="#fff" /><Text style={styles.bigBtnTxt}>{t.finish}</Text></TouchableOpacity>
            </>
          )}
        </View>

        {/* Recent runs history (only when idle) */}
        {status === 'idle' && (
          <View style={styles.histWrap}>
            <View style={styles.histHead}>
              <History size={15} color={sub} />
              <Text style={[styles.histTitle, { color: text }]}>{t.history}</Text>
            </View>
            {history.length === 0 ? (
              <Text style={[styles.histEmpty, { color: sub }]}>{t.noHistory}</Text>
            ) : (
              <ScrollView style={{ maxHeight: 168 }} showsVerticalScrollIndicator={false}>
                {history.map((h, i) => (
                  <View key={i} style={[styles.histRow, { borderTopColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.histName, { color: text }]} numberOfLines={1}>{h.name}</Text>
                      <Text style={[styles.histDate, { color: sub }]}>{h.date}{h.duration ? ` · ${h.duration} min` : ''}</Text>
                    </View>
                    <Text style={[styles.histKcal, { color: PRIMARY }]}>{h.calories} kcal</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}
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
  primaryBtn: { backgroundColor: PRIMARY, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  primaryBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  back: { position: 'absolute', top: 50, left: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  stat: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 23, fontWeight: '900', letterSpacing: -1 },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  controls: { flexDirection: 'row', gap: 12 },
  bigBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: PRIMARY, paddingVertical: 18, borderRadius: 18 },
  bigBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
  modeRow: { flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: 16, gap: 4 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 11, shadowColor: '#000', shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  modeTxt: { fontSize: 14, fontWeight: '800' },
  histWrap: { marginTop: 18 },
  histHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  histTitle: { fontSize: 15, fontWeight: '800' },
  histEmpty: { fontSize: 13, fontWeight: '500', paddingVertical: 8 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1 },
  histName: { fontSize: 14, fontWeight: '700' },
  histDate: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  histKcal: { fontSize: 14, fontWeight: '800' },
});
