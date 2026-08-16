import React, { useEffect, useMemo, useRef, useState } from 'react';
import { a11y } from '../../lib/a11y';
import { useTokens } from '../../constants/tokens';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import BrandOverlay from '../../components/BrandOverlay';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { ArrowLeft, Play, Pause, Square, MapPin, Trophy, Users } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { addNutritionLog, emailToDocId, logEvent } from '../../lib/firebase';
import { creditKm } from '../../lib/progressHooks';
import { publishActivity } from '../../lib/socialFeed';
import {
  listenRaceParticipants, updateRaceProgress, finishMyRace,
  addDistanceToJoinedChallenges, RaceParticipant,
} from '../../lib/races';
import { groupByTeam, hasTeams, setMyTeamName, normalizeTeamName, TeamMember } from '../../lib/raceTeam';
import { Card, PrimaryButton, SecondaryButton } from '../../components/ui';
import { spacing, radius } from '../../constants/theme';

// Google Maps JS in a WebView — same approach as run.tsx (the JS API key works in a
// WebView with a baseUrl; react-native-maps would need a Maps SDK for Android key).
// Clé Maps lue depuis l'env (EXPO_PUBLIC_GOOGLE_MAPS_KEY) — plus de clé en dur dans le
// bundle. Clé publiable côté client : DOIT être restreinte dans GCP (package + SHA-1 + API).
const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '';
const PRIMARY = Colors.light.primary;
const ME_COLOR = '#22c55e';   // current user — green
const OTHER_COLOR = '#3b82f6'; // others — blue

const TXT: Record<string, any> = {
  en: { title: 'Live Race', perm: 'Location permission is required to join the race.', grant: 'Grant access', dist: 'Distance', time: 'Time', pace: 'Pace', kcal: 'Calories', start: 'Start', pause: 'Pause', resume: 'Resume', finish: 'Finish', saved: 'Race finished', savedMsg: 'kcal added to your activity for today.', waiting: 'Getting your location…', leaderboard: 'Leaderboard', you: 'You', km: 'km', done: 'finished',
    gps: 'Real (GPS)', sim: 'Simulation', mode: 'Choose your mode', gpsHint: 'Moves only when you move', simHint: 'Auto-advances for you', avgPace: 'Avg pace', rank: 'Rank', savedToActivity: 'Saved to your activity', great: 'Great job!', viewActivity: 'View activity', close: 'Close',
    teamMode: 'Team mode (relay)', teamPlaceholder: 'Team name (optional)', teamSave: 'Join team', teamMine: 'Your team', teamBoard: 'Teams', indivBoard: 'Players', teamHint: 'Add a team name to compete by team — distances add up.', teamSaved: 'Team set' },
  fr: { title: 'Course en direct', perm: 'La permission de localisation est requise pour rejoindre la course.', grant: 'Autoriser', dist: 'Distance', time: 'Temps', pace: 'Allure', kcal: 'Calories', start: 'Démarrer', pause: 'Pause', resume: 'Reprendre', finish: 'Terminer', saved: 'Course terminée', savedMsg: 'kcal ajoutées à ton activité du jour.', waiting: 'Localisation en cours…', leaderboard: 'Classement', you: 'Toi', km: 'km', done: 'terminé',
    gps: 'Réel (GPS)', sim: 'Simulation', mode: 'Choisis ton mode', gpsHint: "N'avance que si tu bouges", simHint: 'Avance toute seule', avgPace: 'Allure moy.', rank: 'Rang', savedToActivity: 'Enregistré dans ton activité', great: 'Bravo !', viewActivity: "Voir l'activité", close: 'Fermer',
    teamMode: 'Mode équipe (relais)', teamPlaceholder: "Nom d'équipe (optionnel)", teamSave: "Rejoindre l'équipe", teamMine: 'Ton équipe', teamBoard: 'Équipes', indivBoard: 'Joueurs', teamHint: 'Ajoute un nom d\'équipe pour jouer en équipe — les distances s\'additionnent.', teamSaved: 'Équipe définie' },
  ar: { title: 'سباق مباشر', perm: 'إذن الموقع مطلوب للانضمام إلى السباق.', grant: 'السماح', dist: 'المسافة', time: 'الوقت', pace: 'الإيقاع', kcal: 'سعرات', start: 'ابدأ', pause: 'إيقاف', resume: 'استئناف', finish: 'إنهاء', saved: 'انتهى السباق', savedMsg: 'سعرة أُضيفت إلى نشاط اليوم.', waiting: 'جارٍ تحديد موقعك…', leaderboard: 'الترتيب', you: 'أنت', km: 'كم', done: 'منتهٍ',
    gps: 'حقيقي (GPS)', sim: 'محاكاة', mode: 'اختر الوضع', gpsHint: 'يتقدّم فقط عند الحركة', simHint: 'يتقدّم تلقائياً', avgPace: 'متوسط الإيقاع', rank: 'الترتيب', savedToActivity: 'حُفظ في نشاطك', great: 'أحسنت!', viewActivity: 'عرض النشاط', close: 'إغلاق',
    teamMode: 'وضع الفريق (تتابع)', teamPlaceholder: 'اسم الفريق (اختياري)', teamSave: 'انضم إلى الفريق', teamMine: 'فريقك', teamBoard: 'الفرق', indivBoard: 'اللاعبون', teamHint: 'أضف اسم فريق للتنافس بالفرق — تُجمع المسافات.', teamSaved: 'تم تحديد الفريق' },
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
  const [mode, setMode] = useState<'gps' | 'sim'>('gps'); // réel (GPS, bouge si on bouge) ou simulation (avance auto)
  const [summary, setSummary] = useState<{ km: string; kcal: number; mmss: string; pace: string; rank: number } | null>(null);
  const [teamInput, setTeamInput] = useState('');        // saisie locale du nom d'équipe (optionnel)
  const [teamSaved, setTeamSaved] = useState(false);     // ack visuel après enregistrement
  const [boardTab, setBoardTab] = useState<'players' | 'teams'>('players'); // onglet du classement

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

  const startTracking = async (selected?: 'gps' | 'sim') => {
    const m = selected || mode;
    setMode(m);
    setStatus('running');
    if (m === 'sim') {
      // SIMULATION : la course avance toute seule (~10,8 km/h) sans GPS. À l'arrêt,
      // on enregistre quand même dans l'historique/activité (comme le mode réel).
      const c = center || { lat: 33.5731, lng: -7.5898 };
      timerRef.current = setInterval(() => {
        setSecs((s) => s + 1);
        metersRef.current += 3; // 3 m/s
        setMeters(metersRef.current);
        if (raceId && email) updateRaceProgress(raceId, email, metersRef.current, c.lat, c.lng);
      }, 1000);
      return;
    }
    // RÉEL (GPS) : n'avance QUE si la position bouge réellement.
    timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
    subRef.current = await Location.watchPositionAsync(
      // Énergie : High suffit pour la course/race et consomme bien moins que BestForNavigation.
      { accuracy: Location.Accuracy.High, distanceInterval: 6, timeInterval: 3000 },
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
        logEvent(email, 'race_completed', { km: +km.toFixed(2), kcal, raceId }); // Event Bus
      } catch (e) { console.warn('[race-live] save failed', e); }
    }
    try {
      if (raceId && email) await finishMyRace(raceId, email);
      if (email && km > 0) await addDistanceToJoinedChallenges(email, km);
      // Course de groupe LIVE = effort GPS réel → crédite les compteurs comme un run solo
      // (défi annuel / XP avatar / Sadaqa / O2O) + feed social. addDistanceToJoinedChallenges
      // ne fait PAS creditKm → aucun double-comptage. Best-effort.
      if (email && km > 0) {
        creditKm(km).catch(() => {});
        publishActivity(email, { type: 'race_finished', km }).catch(() => {});
      }
    } catch (e) { console.warn('[race-live] finish failed', e); }
    // Résumé designé (remplace l'Alert basique)
    const myRank = (sorted.findIndex((p) => p.email === email) + 1) || 1;
    const paceMinF = km > 0 ? secs / 60 / km : 0;
    setSummary({
      km: km.toFixed(2),
      kcal,
      mmss,
      pace: paceMinF > 0 ? `${Math.floor(paceMinF)}'${String(Math.round((paceMinF % 1) * 60)).padStart(2, '0')}"` : "--'--",
      rank: myRank,
    });
  };

  const km = meters / 1000;
  const paceMin = km > 0 ? secs / 60 / km : 0;
  const kcal = Math.round(weight * km * 1.036);
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const paceStr = paceMin > 0 ? `${Math.floor(paceMin)}'${String(Math.round((paceMin % 1) * 60)).padStart(2, '0')}"` : "--'--";

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const tok = useTokens();
  const bg = tok.bg;

  const html = useMemo(() => (center ? buildHtml(center) : ''), [center]);

  const sorted = useMemo(
    () => [...participants].sort((a, b) => (b.distanceM || 0) - (a.distanceM || 0)),
    [participants]
  );
  const medals = ['🥇', '🥈', '🥉'];

  // ── Mode équipe (relais) ──
  // teamName est porté par le doc participant (champ optionnel) ; on dérive donc
  // tout depuis le snapshot live, pour rester cohérent avec le suivi individuel.
  const teamGroups = useMemo(() => groupByTeam(participants as TeamMember[]), [participants]);
  const anyTeams = useMemo(() => hasTeams(participants as TeamMember[]), [participants]);
  const myTeam = useMemo(() => {
    const me = (participants as TeamMember[]).find((p) => p.email === email);
    return normalizeTeamName(me?.teamName);
  }, [participants, email]);

  // Pré-remplit l'input avec mon équipe serveur (si je l'ai déjà rejointe).
  useEffect(() => {
    if (myTeam && !teamInput) setTeamInput(myTeam);
  }, [myTeam]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTeam = async () => {
    const clean = normalizeTeamName(teamInput);
    if (!clean || !raceId || !email) return;
    await setMyTeamName(raceId, email, clean);
    setTeamSaved(true);
    setBoardTab('teams');
    setTimeout(() => setTeamSaved(false), 2000);
  };

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

      <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retour')} style={[styles.back, { backgroundColor: card }]} onPress={() => router.back()}>
        <ArrowLeft size={22} color={text} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
      </TouchableOpacity>

      {/* Live leaderboard */}
      <View style={[styles.board, { backgroundColor: card }, isRTL && { left: undefined, right: 12 }]}>
        <Text style={[styles.boardTitle, { color: text, textAlign: isRTL ? 'right' : 'left' }]}>{t.leaderboard}</Text>
        {/* Onglets Joueurs / Équipes — l'onglet Équipes n'apparaît que s'il y a au moins une équipe. */}
        {anyTeams && (
          <View style={[styles.tabRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {(['players', 'teams'] as const).map((tab) => {
              const active = boardTab === tab;
              return (
                <TouchableOpacity key={tab} activeOpacity={0.85} onPress={() => setBoardTab(tab)}
                  style={[styles.tab, { backgroundColor: active ? PRIMARY : (isDark ? '#1f2937' : '#f1f5f9') }]}>
                  <Text style={[styles.tabTxt, { color: active ? '#fff' : sub }]} numberOfLines={1}>
                    {tab === 'players' ? t.indivBoard : t.teamBoard}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
          {boardTab === 'teams' && anyTeams
            ? teamGroups.map((g, i) => {
                const mine = !!myTeam && g.team.toLowerCase() === myTeam.toLowerCase();
                return (
                  <View key={g.team || i} style={[styles.boardRow, mine && { backgroundColor: isDark ? '#14321f' : '#ecfdf3' }, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text style={styles.boardRank}>{medals[i] || `${i + 1}`}</Text>
                    <Text numberOfLines={1} style={[styles.boardName, { color: mine ? ME_COLOR : text, textAlign: isRTL ? 'right' : 'left' }]}>
                      {g.team} · {g.members.length}👥
                    </Text>
                    <Text style={[styles.boardKm, { color: sub }]}>{g.totalKm.toFixed(2)} {t.km}</Text>
                  </View>
                );
              })
            : sorted.map((p, i) => {
                const mine = p.email === email;
                const tn = normalizeTeamName((p as TeamMember).teamName);
                return (
                  <View key={p.email || i} style={[styles.boardRow, mine && { backgroundColor: isDark ? '#14321f' : '#ecfdf3' }, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text style={styles.boardRank}>{medals[i] || `${i + 1}`}</Text>
                    <Text numberOfLines={1} style={[styles.boardName, { color: mine ? ME_COLOR : text, textAlign: isRTL ? 'right' : 'left' }]}>
                      {mine ? t.you : (p.name || '—')}{tn ? ` · ${tn}` : ''}{p.finished ? ` · ${t.done}` : ''}
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
        {/* Mode équipe (relais) — nom d'équipe optionnel, avant départ. */}
        {status === 'idle' && (
          <View style={styles.teamWrap}>
            <View style={[styles.teamLabelRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Users size={15} color={PRIMARY} />
              <Text style={[styles.teamLabel, { color: text, textAlign: isRTL ? 'right' : 'left' }]}>{t.teamMode}</Text>
            </View>
            <View style={[styles.teamRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <TextInput
                value={teamInput}
                onChangeText={setTeamInput}
                placeholder={t.teamPlaceholder}
                placeholderTextColor={sub}
                maxLength={24}
                style={[styles.teamInput, { color: text, borderColor: isDark ? '#334155' : '#e2e8f0', backgroundColor: isDark ? '#0f1419' : '#f8fafc', textAlign: isRTL ? 'right' : 'left' }]}
              />
              <TouchableOpacity activeOpacity={0.85} onPress={saveTeam} disabled={!normalizeTeamName(teamInput)}
                style={[styles.teamBtn, { opacity: normalizeTeamName(teamInput) ? 1 : 0.5 }]}>
                <Text style={styles.teamBtnTxt} numberOfLines={1}>{teamSaved ? t.teamSaved : t.teamSave}</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.teamHint, { color: sub, textAlign: isRTL ? 'right' : 'left' }]}>{t.teamHint}</Text>
          </View>
        )}
        {/* Sélecteur de mode (avant départ) : Réel GPS vs Simulation — segmented control (Card + SecondaryButton row) */}
        {status === 'idle' && (
          <Card variant="outline" padded={false} style={styles.modeCard}>
            <View style={styles.modeSegRow}>
              {(['gps', 'sim'] as const).map((m) => {
                const active = mode === m;
                return (
                  <SecondaryButton
                    key={m}
                    title={m === 'gps' ? t.gps : t.sim}
                    onPress={() => setMode(m)}
                    size="sm"
                    style={[
                      styles.modeSeg,
                      active
                        ? { backgroundColor: isDark ? '#14321f' : '#ecfdf3', borderColor: PRIMARY }
                        : { borderColor: 'transparent' },
                    ]}
                  />
                );
              })}
            </View>
            <Text style={[styles.modeSegHint, { color: sub, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
              {mode === 'gps' ? t.gpsHint : t.simHint}
            </Text>
          </Card>
        )}
        <View style={styles.controls}>
          {/* Action principale (Start → Pause/Resume) en PrimaryButton ; actions secondaires (Finish) en SecondaryButton row dessous. */}
          {status === 'idle' && (
            <PrimaryButton title={t.start} onPress={() => startTracking(mode)} icon={<Play size={22} color="#fff" fill="#fff" />} />
          )}
          {status === 'running' && (
            <PrimaryButton title={t.pause} onPress={pause} icon={<Pause size={22} color="#fff" fill="#fff" />} style={{ backgroundColor: '#f59e0b' }} />
          )}
          {status === 'paused' && (
            <>
              <PrimaryButton title={t.resume} onPress={() => startTracking(mode)} icon={<Play size={22} color="#fff" fill="#fff" />} />
              <View style={styles.controlsSecondary}>
                <SecondaryButton title={t.finish} onPress={finish} icon={<Square size={18} color="#ef4444" fill="#ef4444" />} style={{ borderColor: '#ef4444' }} />
              </View>
            </>
          )}
        </View>
      </View>

      {/* Résumé de fin — designé (remplace l'Alert basique) */}
      {summary && (
        <View style={styles.sumOverlay}>
          <View style={[styles.sumCard, { backgroundColor: card }]}>
            <View style={styles.sumIcon}><Trophy size={38} color="#F59E0B" /></View>
            <Text style={[styles.sumTitle, { color: text }]}>{t.great}</Text>
            <Text style={[styles.sumSub, { color: sub }]}>{summary.kcal} kcal · {t.savedToActivity}</Text>
            <View style={styles.sumStatsRow}>
              <SumStat v={summary.km} u="km" l={t.dist} text={text} sub={sub} />
              <SumStat v={summary.mmss} u="" l={t.time} text={text} sub={sub} />
              <SumStat v={`${summary.kcal}`} u="kcal" l={t.kcal} text={text} sub={sub} />
            </View>
            <View style={styles.sumStatsRow}>
              <SumStat v={summary.pace} u="/km" l={t.avgPace} text={text} sub={sub} />
              <SumStat v={`#${summary.rank}`} u="" l={t.rank} text={text} sub={sub} />
            </View>
            <TouchableOpacity style={styles.sumBtn} onPress={() => { setSummary(null); router.replace('/activity' as any); }}>
              <Text style={styles.sumBtnTxt}>{t.viewActivity}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setSummary(null); router.back(); }} style={{ paddingVertical: 10 }}>
              <Text style={{ color: sub, fontWeight: '700', fontSize: 14 }}>{t.close}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function SumStat({ v, u, l, text, sub }: any) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 22, fontWeight: '900', color: text, letterSpacing: -0.5 }}>{v}</Text>
      <Text style={{ fontSize: 11, fontWeight: '700', color: sub, marginTop: 2 }}>{l}{u ? ` (${u})` : ''}</Text>
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
  tabRow: { gap: 6, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 5, borderRadius: 9, alignItems: 'center' },
  tabTxt: { fontSize: 11.5, fontWeight: '800' },
  boardRow: { alignItems: 'center', paddingVertical: 5, paddingHorizontal: 6, borderRadius: 10, gap: 8 },
  boardRank: { fontSize: 14, fontWeight: '800', width: 22, textAlign: 'center', color: '#888' },
  boardName: { flex: 1, fontSize: 13, fontWeight: '700' },
  boardKm: { fontSize: 12, fontWeight: '700' },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  stat: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 23, fontWeight: '900', letterSpacing: -1 },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  controls: { gap: spacing.sm },
  controlsSecondary: { flexDirection: 'row', gap: spacing.sm },
  bigBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: PRIMARY, paddingVertical: 18, borderRadius: 18 },
  bigBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
  teamWrap: { marginBottom: 14 },
  teamLabelRow: { alignItems: 'center', gap: 6, marginBottom: 8 },
  teamLabel: { fontSize: 14, fontWeight: '800', flex: 1 },
  teamRow: { gap: 8, alignItems: 'center' },
  teamInput: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600' },
  teamBtn: { backgroundColor: PRIMARY, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  teamBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  teamHint: { fontSize: 11, fontWeight: '600', marginTop: 6, lineHeight: 15 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  modeChip: { flex: 1, borderRadius: 16, borderWidth: 2, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', gap: 2 },
  modeChipTitle: { fontSize: 15, fontWeight: '900' },
  modeChipHint: { fontSize: 11, fontWeight: '600' },
  modeCard: { marginBottom: 14, padding: spacing.xs },
  modeSegRow: { flexDirection: 'row', gap: spacing.xs },
  modeSeg: { flex: 1, borderRadius: radius.md },
  modeSegHint: { fontSize: 11, fontWeight: '600', marginTop: spacing.sm, marginHorizontal: spacing.xs, marginBottom: spacing.xs },
  sumOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  sumCard: { width: '100%', maxWidth: 380, borderRadius: 28, padding: 26, alignItems: 'center', gap: 6 },
  sumIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#FEF3E0', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  sumTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  sumSub: { fontSize: 13.5, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  sumStatsRow: { flexDirection: 'row', width: '100%', marginBottom: 6 },
  sumBtn: { backgroundColor: PRIMARY, alignSelf: 'stretch', height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  sumBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
