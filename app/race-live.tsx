import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import BrandOverlay from '../components/BrandOverlay';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { ArrowLeft, Play, Pause, Square, MapPin } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { addNutritionLog, emailToDocId } from '../lib/firebase';
import {
  listenRaceParticipants, updateRaceProgress, finishMyRace,
  addDistanceToJoinedChallenges, RaceParticipant,
} from '../lib/races';

// Google Maps JS in a WebView — same approach as run.tsx (the JS API key works in a
// WebView with a baseUrl; react-native-maps would need a Maps SDK for Android key).
const GOOGLE_MAPS_KEY = 'AIzaSyAa1lBSroSXA-Om4mio84-SWAcmzQgYv8w';
const PRIMARY = Colors.light.primary;
const ME_COLOR = '#22c55e';   // current user — green
const OTHER_COLOR = '#3b82f6'; // others — blue

const TXT: Record<string, any> = {
  en: { title: 'Live Race', perm: 'Location permission is required to join the race.', grant: 'Grant access', dist: 'Distance', time: 'Time', pace: 'Pace', kcal: 'Calories', start: 'Start', pause: 'Pause', resume: 'Resume', finish: 'Finish', saved: 'Race finished', savedMsg: 'kcal added to your activity for today.', waiting: 'Getting your location…', leaderboard: 'Leaderboard', you: 'You', km: 'km', done: 'finished' },
  fr: { title: 'Course en direct', perm: 'La permission de localisation est requise pour rejoindre la course.', grant: 'Autoriser', dist: 'Distance', time: 'Temps', pace: 'Allure', kcal: 'Calories', start: 'Démarrer', pause: 'Pause', resume: 'Reprendre', finish: 'Terminer', saved: 'Course terminée', savedMsg: 'kcal ajoutées à ton activité du jour.', waiting: 'Localisation en cours…', leaderboard: 'Classement', you: 'Toi', km: 'km', done: 'terminé' },
  ar: { title: 'سباق مباشر', perm: 'إذن الموقع مطلوب للانضمام إلى السباق.', grant: 'السماح', dist: 'المسافة', time: 'الوقت', pace: 'الإيقاع', kcal: 'سعرات', start: 'ابدأ', pause: 'إيقاف', resume: 'استئناف', finish: 'إنهاء', saved: 'انتهى السباق', savedMsg: 'سعرة أُضيفت إلى نشاط اليوم.', waiting: 'جارٍ تحديد موقعك…', leaderboard: 'الترتيب', you: 'أنت', km: 'كم', done: 'منتهٍ' },
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

function buildHtml(center: LatLng): string {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>html,body,#map{height:100%;width:100%;margin:0;padding:0;background:#e8f0e8}
.lbl{font-family:sans-serif;font-size:11px;font-weight:700;color:#111;background:rgba(255,255,255,.9);padding:1px 5px;border-radius:6px;transform:translateY(-6px)}</style>
</head><body><div id="map"></div>
<script>
  var C = ${JSON.stringify(center)};
  var ME = ${JSON.stringify(ME_COLOR)};
  var OTHER = ${JSON.stringify(OTHER_COLOR)};
  function initMap(){
    window._map = new google.maps.Map(document.getElementById('map'), {
      center: C, zoom: 15, disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy'
    });
    window._markers = {};
    // Clear + redraw all participant markers from a JSON array.
    window.setParticipants = function(json){
      var list;
      try { list = JSON.parse(json); } catch(e){ return; }
      var seen = {};
      for (var i=0;i<list.length;i++){
        var p = list[i];
        if (p.lat == null || p.lng == null) continue;
        var key = p.id;
        seen[key] = true;
        var pos = { lat: p.lat, lng: p.lng };
        var color = p.me ? ME : OTHER;
        if (window._markers[key]) {
          window._markers[key].setPosition(pos);
          window._markers[key].setIcon(markerIcon(color));
        } else {
          window._markers[key] = new google.maps.Marker({
            position: pos, map: window._map, title: p.name || '',
            label: { text: (p.name || '').slice(0,14), className: 'lbl' },
            icon: markerIcon(color),
          });
        }
      }
      // Remove markers for participants that vanished.
      for (var k in window._markers){
        if (!seen[k]){ window._markers[k].setMap(null); delete window._markers[k]; }
      }
    };
    function markerIcon(color){
      return { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 };
    }
    window.recenter = function(lat,lng){ window._map.panTo({lat:lat,lng:lng}); };
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ready');
  }
  window.gm_authFailure=function(){ document.body.innerHTML='<div style="color:#b91c1c;font-family:sans-serif;padding:24px;text-align:center">Google Maps key error.</div>'; };
</script>
<script async defer src="https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&callback=initMap"></script>
</body></html>`;
}

export default function RaceLiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const raceId = String(id || '');
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const myName = user?.fullName || user?.firstName || (email ? email.split('@')[0] : t.you);

  const [perm, setPerm] = useState<'loading' | 'denied' | 'ok'>('loading');
  const [center, setCenter] = useState<LatLng | null>(null);
  const [meters, setMeters] = useState(0);
  const [secs, setSecs] = useState(0);
  const [status, setStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [weight, setWeight] = useState(70);
  const [participants, setParticipants] = useState<RaceParticipant[]>([]);

  const subRef = useRef<Location.LocationSubscription | null>(null);
  const lastPt = useRef<LatLng | null>(null);
  const timerRef = useRef<any>(null);
  const webRef = useRef<WebView | null>(null);
  const mapReady = useRef(false);
  const metersRef = useRef(0);

  // Permission + initial location + profile weight.
  useEffect(() => {
    (async () => {
      try {
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
    })();
    return () => { subRef.current?.remove(); if (timerRef.current) clearInterval(timerRef.current); };
  }, [email]);

  // Real-time race participants subscription.
  useEffect(() => {
    if (!raceId) return;
    const unsub = listenRaceParticipants(raceId, setParticipants);
    return () => { unsub && unsub(); };
  }, [raceId]);

  // Push the live participant markers into the map whenever the list changes.
  useEffect(() => {
    if (!mapReady.current) return;
    pushMarkers(participants);
  }, [participants]);

  const pushMarkers = (list: RaceParticipant[]) => {
    const payload = list
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({ id: emailToDocId(p.email), name: p.email === email ? t.you : p.name, lat: p.lat, lng: p.lng, me: p.email === email }));
    const json = JSON.stringify(payload);
    webRef.current?.injectJavaScript(`window.setParticipants && window.setParticipants(${JSON.stringify(json)}); true;`);
  };

  const startTracking = async () => {
    setStatus('running');
    timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
    subRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 2000 },
      (loc) => {
        const pt = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        if (lastPt.current) {
          const d = haversine(lastPt.current, pt);
          if (d < 80) {
            metersRef.current += d;
            setMeters(metersRef.current);
          }
        }
        lastPt.current = pt;
        if (mapReady.current) webRef.current?.injectJavaScript(`window.recenter && window.recenter(${pt.lat},${pt.lng}); true;`);
        // Broadcast my live progress so others see me move.
        if (raceId && email) updateRaceProgress(raceId, email, metersRef.current, pt.lat, pt.lng);
      }
    );
  };

  const pause = () => {
    setStatus('paused');
    subRef.current?.remove(); subRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const finish = async () => {
    pause();
    setStatus('idle');
    const km = metersRef.current / 1000;
    const kcal = Math.max(0, Math.round(weight * km * 1.036));
    if (email && kcal > 0) {
      try {
        const d = new Date();
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        await addNutritionLog({ userId: email, type: 'activity', name: `Race · ${km.toFixed(2)} km`, calories: kcal, protein: 0, carbs: 0, fat: 0, date, duration: Math.round(secs / 60), intensity: 'medium' } as any);
      } catch (e) { console.warn('[race-live] save failed', e); }
    }
    try {
      if (raceId && email) await finishMyRace(raceId, email);
      if (email && km > 0) await addDistanceToJoinedChallenges(email, km);
    } catch (e) { console.warn('[race-live] finish failed', e); }
    Alert.alert(t.saved, `${kcal} ${t.savedMsg}`, [{ text: 'OK', onPress: () => router.back() }]);
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

  const html = useMemo(() => (center ? buildHtml(center) : ''), [center]);

  const sorted = useMemo(
    () => [...participants].sort((a, b) => (b.distanceM || 0) - (a.distanceM || 0)),
    [participants]
  );
  const medals = ['🥇', '🥈', '🥉'];

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
      <BrandOverlay />
      {center ? (
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://localhost/' }}
          style={StyleSheet.absoluteFill}
          javaScriptEnabled
          domStorageEnabled
          onMessage={(e) => { if (e.nativeEvent.data === 'ready') { mapReady.current = true; pushMarkers(participants); } }}
          startInLoadingState
          renderLoading={() => <View style={[StyleSheet.absoluteFill, styles.center]}><ActivityIndicator size="large" color={PRIMARY} /></View>}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}><ActivityIndicator size="large" color={PRIMARY} /><Text style={{ color: sub, marginTop: 12 }}>{t.waiting}</Text></View>
      )}

      <TouchableOpacity style={[styles.back, { backgroundColor: card }]} onPress={() => router.back()}>
        <ArrowLeft size={22} color={text} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
      </TouchableOpacity>

      {/* Live leaderboard */}
      <View style={[styles.board, { backgroundColor: card }, isRTL && { left: undefined, right: 12 }]}>
        <Text style={[styles.boardTitle, { color: text, textAlign: isRTL ? 'right' : 'left' }]}>{t.leaderboard}</Text>
        <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
          {sorted.map((p, i) => {
            const mine = p.email === email;
            return (
              <View key={p.email || i} style={[styles.boardRow, mine && { backgroundColor: isDark ? '#14321f' : '#ecfdf3' }, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={styles.boardRank}>{medals[i] || `${i + 1}`}</Text>
                <Text numberOfLines={1} style={[styles.boardName, { color: mine ? ME_COLOR : text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {mine ? t.you : (p.name || '—')}{p.finished ? ` · ${t.done}` : ''}
                </Text>
                <Text style={[styles.boardKm, { color: sub }]}>{((p.distanceM || 0) / 1000).toFixed(2)} {t.km}</Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      <View style={[styles.panel, { backgroundColor: card }]}>
        <View style={styles.statsRow}>
          <Stat label={t.dist} value={km.toFixed(2)} unit="km" text={text} sub={sub} />
          <Stat label={t.time} value={mmss} unit="" text={text} sub={sub} />
          <Stat label={t.pace} value={paceStr} unit="/km" text={text} sub={sub} />
          <Stat label={t.kcal} value={`${kcal}`} unit="kcal" text={text} sub={sub} />
        </View>
        <View style={styles.controls}>
          {status === 'idle' && (
            <TouchableOpacity style={styles.bigBtn} onPress={startTracking}><Play size={26} color="#fff" fill="#fff" /><Text style={styles.bigBtnTxt}>{t.start}</Text></TouchableOpacity>
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
  board: { position: 'absolute', top: 50, left: 12, width: 220, borderRadius: 18, padding: 12, paddingBottom: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
  boardTitle: { fontSize: 14, fontWeight: '900', marginBottom: 8, marginLeft: 50 },
  boardRow: { alignItems: 'center', paddingVertical: 5, paddingHorizontal: 6, borderRadius: 10, gap: 8 },
  boardRank: { fontSize: 14, fontWeight: '800', width: 22, textAlign: 'center', color: '#888' },
  boardName: { flex: 1, fontSize: 13, fontWeight: '700' },
  boardKm: { fontSize: 12, fontWeight: '700' },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  stat: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 23, fontWeight: '900', letterSpacing: -1 },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  controls: { flexDirection: 'row', gap: 12 },
  bigBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: PRIMARY, paddingVertical: 18, borderRadius: 18 },
  bigBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
