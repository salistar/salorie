import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { WebView } from 'react-native-webview';
import { ArrowLeft, Flag } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import {
  getChallenge,
  getMyChallengeProgress,
  joinChallenge,
  listenChallengeBoard,
  Challenge,
  ChallengeProgress,
} from '../lib/races';

// Google Maps JS in a WebView — same approach as run.tsx (the JS API key works in a
// WebView with a baseUrl; react-native-maps would need a Maps SDK for Android key).
const GOOGLE_MAPS_KEY = 'AIzaSyAa1lBSroSXA-Om4mio84-SWAcmzQgYv8w';
const PRIMARY = Colors.light.primary;

const TXT: Record<string, any> = {
  en: {
    title: 'Challenge', join: 'Join challenge', joined: 'Joined!', joining: 'Joining…',
    leaderboard: 'Leaderboard', you: 'You', of: 'of', km: 'km', notFound: 'Challenge not found',
    hint: 'Your runs add to your progress automatically.', start: 'Start', finish: 'Finish',
    progress: 'Progress', participants: 'participants',
  },
  fr: {
    title: 'Défi', join: 'Rejoindre le défi', joined: 'Rejoint !', joining: 'Connexion…',
    leaderboard: 'Classement', you: 'Toi', of: 'sur', km: 'km', notFound: 'Défi introuvable',
    hint: 'Tes courses augmentent ta progression automatiquement.', start: 'Départ', finish: 'Arrivée',
    progress: 'Progression', participants: 'participants',
  },
  ar: {
    title: 'التحدي', join: 'انضم إلى التحدي', joined: 'تم الانضمام!', joining: 'جارٍ الانضمام…',
    leaderboard: 'المتصدّرون', you: 'أنت', of: 'من', km: 'كم', notFound: 'التحدي غير موجود',
    hint: 'تُضاف جريك إلى تقدّمك تلقائيًا.', start: 'البداية', finish: 'النهاية',
    progress: 'التقدّم', participants: 'مشارك',
  },
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

// Interpolate a LatLng at a 0..1 fraction of the total distance along the route.
// Walks the route segment by segment (cumulative segment length via haversine).
function pointAtFraction(route: LatLng[], fraction: number): LatLng {
  if (!route.length) return { lat: 0, lng: 0 };
  if (route.length === 1) return route[0];
  const f = Math.max(0, Math.min(1, fraction));
  // total length + per-segment lengths
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const d = haversine(route[i], route[i + 1]);
    segs.push(d);
    total += d;
  }
  if (total === 0) return route[0];
  if (f <= 0) return route[0];
  if (f >= 1) return route[route.length - 1];
  let target = f * total; // meters to walk
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const r = segs[i] > 0 ? target / segs[i] : 0;
      const a = route[i];
      const b = route[i + 1];
      return { lat: a.lat + (b.lat - a.lat) * r, lng: a.lng + (b.lng - a.lng) * r };
    }
    target -= segs[i];
  }
  return route[route.length - 1];
}

function buildHtml(route: LatLng[], me: LatLng, color: string): string {
  const start = route[0];
  const end = route[route.length - 1];
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>html,body,#map{height:100%;width:100%;margin:0;padding:0;background:#e8f0e8}</style>
</head><body><div id="map"></div>
<script>
  var ROUTE = ${JSON.stringify(route)};
  var ME = ${JSON.stringify(me)};
  var START = ${JSON.stringify(start)};
  var END = ${JSON.stringify(end)};
  function initMap(){
    var map = new google.maps.Map(document.getElementById('map'), {
      disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy'
    });
    window._map = map;
    new google.maps.Polyline({ map: map, path: ROUTE, geodesic: true, strokeColor: '${color}', strokeOpacity: 1, strokeWeight: 7 });
    new google.maps.Marker({ position: START, map: map, title: 'Start',
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } });
    new google.maps.Marker({ position: END, map: map, title: 'Finish',
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#ef4444', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } });
    window._me = new google.maps.Marker({ position: ME, map: map, title: 'You', zIndex: 999,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '${color}', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 4 } });
    var bounds = new google.maps.LatLngBounds();
    ROUTE.forEach(function(p){ bounds.extend(p); });
    map.fitBounds(bounds, 60);
    window.moveMe = function(lat,lng){ window._me.setPosition({lat:lat,lng:lng}); };
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ready');
  }
  window.gm_authFailure=function(){ document.body.innerHTML='<div style="color:#b91c1c;font-family:sans-serif;padding:24px;text-align:center">Google Maps key error.</div>'; };
</script>
<script async defer src="https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&callback=initMap"></script>
</body></html>`;
}

export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const challengeId = String(id || '');
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.fullName ||
    (email ? email.split('@')[0] : 'Runner');

  const challenge: Challenge | undefined = getChallenge(challengeId);

  const [board, setBoard] = useState<ChallengeProgress[]>([]);
  const [myKm, setMyKm] = useState<number | null>(null);
  const [joining, setJoining] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const webRef = useRef<WebView | null>(null);

  // Initial progress fetch.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!challengeId || !email) return;
      try {
        const p = await getMyChallengeProgress(challengeId, email);
        if (alive) setMyKm(p);
      } catch {}
    })();
    return () => { alive = false; };
  }, [challengeId, email]);

  // Live leaderboard subscription.
  useEffect(() => {
    if (!challengeId) return;
    const unsub = listenChallengeBoard(challengeId, setBoard);
    return () => { unsub && unsub(); };
  }, [challengeId]);

  // Prefer the live board value for my progress when present.
  useEffect(() => {
    if (!email) return;
    const mine = board.find((b) => b.email === email);
    if (mine) setMyKm(mine.cumulativeKm || 0);
  }, [board, email]);

  const totalKm = challenge?.totalKm || 0;
  const myCumulativeKm = myKm ?? 0;
  const fraction = totalKm > 0 ? Math.min(1, myCumulativeKm / totalKm) : 0;
  const pct = Math.round(fraction * 100);
  const joined = myKm !== null;

  const mePoint = useMemo<LatLng>(() => {
    if (!challenge) return { lat: 0, lng: 0 };
    return pointAtFraction(challenge.route as LatLng[], fraction);
  }, [challenge, fraction]);

  // Build HTML once for the route + initial me position.
  const html = useMemo(
    () => (challenge ? buildHtml(challenge.route as LatLng[], mePoint, PRIMARY) : ''),
    // route is static per challenge; initial me position only.
    [challengeId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Move the "you" marker when my progress changes (after the map is ready).
  useEffect(() => {
    if (mapReady && challenge) {
      webRef.current?.injectJavaScript(`window.moveMe && window.moveMe(${mePoint.lat},${mePoint.lng}); true;`);
    }
  }, [mePoint, mapReady, challenge]);

  const onJoin = async () => {
    if (!challengeId || !email || joining) return;
    setJoining(true);
    try {
      await joinChallenge(challengeId, email, displayName);
      setMyKm(0);
    } catch (e) {
      console.warn('[challenge] join failed', e);
    } finally {
      setJoining(false);
    }
  };

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#000' : '#fff';
  const trackBg = isDark ? '#2a2a2a' : Colors.light.gray[200];
  const rtlRow = isRTL ? { flexDirection: 'row-reverse' as const } : undefined;
  const align = isRTL ? ({ textAlign: 'right' } as const) : ({ textAlign: 'left' } as const);

  if (!challenge) {
    return (
      <View style={[styles.center, { backgroundColor: bg, padding: 32 }]}>
        <Flag size={48} color={PRIMARY} />
        <Text style={[styles.notFound, { color: text }]}>{t.notFound}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnTxt}>{t.title}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <View style={styles.mapWrap}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://localhost/' }}
          style={StyleSheet.absoluteFill}
          javaScriptEnabled
          domStorageEnabled
          onMessage={(e) => { if (e.nativeEvent.data === 'ready') setMapReady(true); }}
          startInLoadingState
          renderLoading={() => (
            <View style={[StyleSheet.absoluteFill, styles.center]}>
              <ActivityIndicator size="large" color={PRIMARY} />
            </View>
          )}
        />
        <TouchableOpacity style={[styles.back, { backgroundColor: card }]} onPress={() => router.back()}>
          <ArrowLeft size={22} color={text} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Progress header */}
        <View style={[styles.header, { backgroundColor: card }, rtlRow]}>
          <Text style={styles.emoji}>{challenge.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.chName, { color: text }, align]} numberOfLines={1}>{challenge.name}</Text>
            <Text style={[styles.bigKm, { color: PRIMARY }, align]}>
              {myCumulativeKm.toFixed(1)}{' '}
              <Text style={[styles.bigKmSub, { color: sub }]}>/ {totalKm} {t.km}</Text>
            </Text>
            <View style={[styles.track, { backgroundColor: trackBg }]}>
              <View style={[styles.fill, { width: `${pct}%` }]} />
            </View>
            <Text style={[styles.pctTxt, { color: sub }, align]}>{pct}% · {t.progress}</Text>
          </View>
        </View>

        {/* Join button (only when not joined) */}
        {!joined && (
          <TouchableOpacity style={[styles.joinBtn, joining && { opacity: 0.7 }]} onPress={onJoin} disabled={joining}>
            <Text style={styles.joinBtnTxt}>{joining ? t.joining : t.join}</Text>
          </TouchableOpacity>
        )}

        {/* Hint */}
        <Text style={[styles.hint, { color: sub }, align]}>{t.hint}</Text>

        {/* Leaderboard */}
        <View style={[styles.lbHeader, rtlRow]}>
          <Text style={[styles.lbTitle, { color: text }]}>{t.leaderboard}</Text>
          <Text style={[styles.lbCount, { color: sub }]}>{board.length} {t.participants}</Text>
        </View>

        {board.map((p, i) => {
          const isMe = p.email === email;
          return (
            <View
              key={p.email || i}
              style={[
                styles.row,
                rtlRow,
                { backgroundColor: card },
                isMe && { borderColor: PRIMARY, borderWidth: 2 },
              ]}
            >
              <Text style={styles.rank}>{i < 3 ? medals[i] : `${i + 1}`}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, { color: text }, align]} numberOfLines={1}>
                  {isMe ? t.you : (p.name || (p.email ? p.email.split('@')[0] : '—'))}
                </Text>
              </View>
              <Text style={[styles.rowKm, { color: isMe ? PRIMARY : text }]}>
                {(p.cumulativeKm || 0).toFixed(1)}
                <Text style={[styles.rowKmSub, { color: sub }]}> / {totalKm} {t.km}</Text>
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 17, fontWeight: '700', textAlign: 'center', marginTop: 16, marginBottom: 20 },
  primaryBtn: { backgroundColor: PRIMARY, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  primaryBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  mapWrap: { height: 280, width: '100%' },
  back: { position: 'absolute', top: 50, left: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, marginHorizontal: 16, marginTop: -20, borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  emoji: { fontSize: 40 },
  chName: { fontSize: 17, fontWeight: '800' },
  bigKm: { fontSize: 30, fontWeight: '900', letterSpacing: -1, marginTop: 2 },
  bigKmSub: { fontSize: 15, fontWeight: '700', letterSpacing: 0 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 10 },
  fill: { height: 10, borderRadius: 5, backgroundColor: PRIMARY },
  pctTxt: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  joinBtn: { backgroundColor: PRIMARY, marginHorizontal: 16, marginTop: 16, paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  joinBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  hint: { fontSize: 13, fontWeight: '500', marginHorizontal: 16, marginTop: 14, lineHeight: 18 },
  lbHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 22, marginBottom: 10 },
  lbTitle: { fontSize: 18, fontWeight: '800' },
  lbCount: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, marginHorizontal: 16, marginBottom: 8, borderRadius: 16 },
  rank: { fontSize: 18, fontWeight: '800', width: 30, textAlign: 'center', color: '#888' },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowKm: { fontSize: 15, fontWeight: '800' },
  rowKmSub: { fontSize: 12, fontWeight: '600' },
});
