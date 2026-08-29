import React, { useEffect, useMemo, useRef, useState } from 'react';
import { a11y } from '../../lib/a11y';
import { recitTrajet } from '../../lib/partageTrajet';
import BoutonsPartage from '../../components/BoutonsPartage';
import { lienPartage } from '../../lib/partage';
import { useTokens, type Tokens } from '../../constants/tokens';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import BrandOverlay from '../../components/BrandOverlay';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { ArrowLeft, Play, Pause, Square, MapPin, Zap, Navigation, History } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { fetchRoutePolyline } from '../../lib/routes';
import { addNutritionLog, emailToDocId, logEvent } from '../../lib/firebase';
import { creditKm } from '../../lib/progressHooks';
import { publishActivity } from '../../lib/socialFeed';
import { sampleStops, labelStops, defaultRouteName, isRouteWorthy, type TrackPoint } from '../../lib/routeFromRun';
import { submitRoute } from '../../lib/communityRoutes';
import { addDistanceToJoinedChallenges } from '../../lib/races';
import { addActivitySteps } from '../../lib/steps';
import { refreshStepsNotification } from '../../lib/stepsNotif';
import { isPlausibleMove } from '../../lib/antiCheat';
import { PrimaryButton, SecondaryButton } from '../../components/ui';
import { useScreenGate } from '../../components/FeatureGate';

// Google Maps JS in a WebView — same approach as the Sally apps (the JS API key
// works in a WebView with a baseUrl; react-native-maps would need a Maps SDK for
// Android key instead).
// Clé Maps lue depuis l'env (EXPO_PUBLIC_GOOGLE_MAPS_KEY) — plus de clé en dur dans le
// bundle. Clé publiable côté client : DOIT être restreinte dans GCP (package + SHA-1 + API).
const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '';

const TXT: Record<string, any> = {
  en: { title: 'Solo Run', perm: 'Location permission is required to track your run.', grant: 'Grant access', dist: 'Distance', time: 'Time', pace: 'Pace', kcal: 'Calories', start: 'Start', pause: 'Pause', resume: 'Resume', finish: 'Finish', saved: 'Run saved', savedMsg: 'kcal added to your activity for today.', saveFailed: 'Save failed', saveFailedMsg: 'Your run could not be saved. Please check your connection and try again.', waiting: 'Getting your location…', gps: 'GPS', sim: 'Simulation', history: 'Recent runs', noHistory: 'No runs yet — start one above.', routeAskTitle: 'Share this route?', routeAskBody: 'Turn your {km} km run into a community route others can follow. Your track is simplified to a few points.', routeYes: 'Share it', routeNo: 'Not now', routeSentTitle: 'Sent for review', routeSentBody: 'Your route will appear in the community list once approved.', ghost: '👻 AR Ghost Mode', liveTwin: '🎧 Live Twin' },
  fr: { title: 'Course solo', perm: 'La permission de localisation est requise pour suivre ta course.', grant: 'Autoriser', dist: 'Distance', time: 'Temps', pace: 'Allure', kcal: 'Calories', start: 'Démarrer', pause: 'Pause', resume: 'Reprendre', finish: 'Terminer', saved: 'Course enregistrée', savedMsg: 'kcal ajoutées à ton activité du jour.', saveFailed: 'Échec de l’enregistrement', saveFailedMsg: 'Ta course n’a pas pu être enregistrée. Vérifie ta connexion et réessaie.', waiting: 'Localisation en cours…', gps: 'GPS', sim: 'Simulation', history: 'Courses récentes', noHistory: 'Aucune course — démarres-en une ci-dessus.', routeAskTitle: 'Partager ce parcours ?', routeAskBody: 'Transforme ta sortie de {km} km en parcours que la communauté pourra suivre. Ton tracé est simplifié en quelques étapes.', routeYes: 'Partager', routeNo: 'Pas maintenant', routeSentTitle: 'Envoyé pour validation', routeSentBody: 'Ton parcours apparaîtra dans la liste communautaire une fois approuvé.', ghost: '👻 Mode fantôme AR', liveTwin: '🎧 Jumeau live' },
  ar: { title: 'جري فردي', perm: 'إذن الموقع مطلوب لتتبّع جريك.', grant: 'السماح', dist: 'المسافة', time: 'الوقت', pace: 'الإيقاع', kcal: 'سعرات', start: 'ابدأ', pause: 'إيقاف', resume: 'استئناف', finish: 'إنهاء', saved: 'تم حفظ الجري', savedMsg: 'سعرة أُضيفت إلى نشاط اليوم.', saveFailed: 'فشل الحفظ', saveFailedMsg: 'تعذّر حفظ جريك. تحقّق من اتصالك وحاول مجددًا.', waiting: 'جارٍ تحديد موقعك…', gps: 'GPS', sim: 'محاكاة', history: 'الجريات الأخيرة', noHistory: 'لا جريات بعد — ابدأ واحدة بالأعلى.', routeAskTitle: 'مشاركة هذا المسار؟', routeAskBody: 'حوّل جريك ({km} كم) إلى مسار يتبعه الآخرون. يُبسَّط تتبعك إلى بضع محطات.', routeYes: 'شارك', routeNo: 'ليس الآن', routeSentTitle: 'أُرسل للمراجعة', routeSentBody: 'سيظهر مسارك في قائمة المجتمع بعد الموافقة.', ghost: '👻 وضع الشبح', liveTwin: '🎧 التوأم المباشر' },
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
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '${color}', fillOpacity: 1, strokeColor: k.onAccent, strokeWeight: 3 } });
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

// ── Simulation qui SUIT LES ROUTES (ne traverse plus bâtiments/mer) ──
function decodePolyline(enc: string): LatLng[] {
  let i = 0, lat = 0, lng = 0; const out: LatLng[] = [];
  while (i < enc.length) {
    let b, shift = 0, result = 0;
    do { b = enc.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = enc.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}
// Cherche un itinéraire piéton réel depuis l'origine (~3 km, plusieurs directions
// pour éviter la mer). Renvoie la polyline des routes, ou null.
async function fetchRoadLoop(origin: LatLng): Promise<LatLng[] | null> {
  for (const brg of [45, 135, 225, 315, 0, 90, 180, 270]) {
    const b = (brg * Math.PI) / 180;
    const dest = {
      lat: origin.lat + (3000 / 111111) * Math.cos(b),
      lng: origin.lng + (3000 / (111111 * Math.cos((origin.lat * Math.PI) / 180))) * Math.sin(b),
    };
    try {
      // `cle` retiree le 14 aout 2026 : l'appel Routes API part du backend, qui detient
      // la cle serveur. GOOGLE_MAPS_KEY ne sert plus qu'a la WebView Maps JS ci-dessous.
      const enc = await fetchRoutePolyline(origin, dest, { mode: 'WALK' });
      if (enc) {
        const p = decodePolyline(enc);
        if (p.length > 1) return p;
      }
    } catch { /* try next bearing */ }
  }
  return null;
}
function pathLen(p: LatLng[]): number { let t = 0; for (let i = 1; i < p.length; i++) t += haversine(p[i - 1], p[i]); return t; }
function pointAtDist(p: LatLng[], d: number): LatLng {
  if (p.length < 2) return p[0];
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const seg = haversine(p[i - 1], p[i]);
    if (acc + seg >= d) { const f = seg ? (d - acc) / seg : 0; return { lat: p[i - 1].lat + (p[i].lat - p[i - 1].lat) * f, lng: p[i - 1].lng + (p[i].lng - p[i - 1].lng) * f }; }
    acc += seg;
  }
  return p[p.length - 1];
}

export default function RunScreen() {
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  const __gate = useScreenGate('run');
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
  // Le recit de la DERNIERE sortie, garde apres la remise a zero des compteurs :
  // sinon la rangee de partage disparaitrait au moment meme ou elle sert.
  const [recit, setRecit] = useState('');

  const subRef = useRef<Location.LocationSubscription | null>(null);
  const lastPt = useRef<LatLng | null>(null);
  // Tracé complet de la sortie : nécessaire pour la publier en parcours communautaire.
  // Un ref et non un state — il grossit d'un point toutes les ~3 s et ne doit RIEN
  // re-rendre. Borné à 3000 points (~2 h 30 de course) pour ne pas enfler sans limite.
  const trackRef = useRef<TrackPoint[]>([]);
  const lastTs = useRef<number | null>(null); // anti-triche : horodatage du dernier point GPS retenu
  const timerRef = useRef<any>(null);
  const webRef = useRef<WebView | null>(null);
  const mapReady = useRef(false);
  const simTimer = useRef<any>(null);
  const simHeading = useRef(45);
  const simStep = useRef(0);
  const simPathRef = useRef<LatLng[] | null>(null);
  const simAlong = useRef(0);
  const simDir = useRef(1);

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
    // fix audit : start idempotent — nettoyer tout timer/abonnement existant avant d'en
    // recreer (le Resume rappelle startTracking → sinon timers/subscriptions en double).
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (simTimer.current) { clearInterval(simTimer.current); simTimer.current = null; }
    if (subRef.current) { try { subRef.current.remove(); } catch {} subRef.current = null; }
    setStatus('running');
    // Une reprise (Resume) rappelle startTracking : on ne remet le tracé à zéro que
    // s'il s'agit d'une nouvelle sortie, jamais au milieu d'une course en pause.
    if (meters === 0) trackRef.current = [];
    timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
    if (mode === 'sim') {
      // Simulation : on avance 10 m/s LE LONG D'UNE VRAIE ROUTE (Directions walking)
      // → ne traverse plus les bâtiments ni la mer. Demi-tour en bout pour boucler.
      const origin = lastPt.current || center;
      simAlong.current = 0; simDir.current = 1; simPathRef.current = null;
      if (origin) fetchRoadLoop(origin).then((p) => { simPathRef.current = p; }).catch(() => {});
      simTimer.current = setInterval(() => {
        const path = simPathRef.current;
        if (!path || path.length < 2) return; // attend l'itinéraire (1-2 s)
        const total = pathLen(path);
        simAlong.current += 10 * simDir.current;
        if (simAlong.current >= total) { simAlong.current = total; simDir.current = -1; }
        else if (simAlong.current <= 0) { simAlong.current = 0; simDir.current = 1; }
        const pt = pointAtDist(path, simAlong.current);
        lastPt.current = pt;
        setMeters((m) => m + 10);
        if (mapReady.current) webRef.current?.injectJavaScript(`window.addPoint && window.addPoint(${pt.lat},${pt.lng}); true;`);
      }, 1000);
      return;
    }
    subRef.current = await Location.watchPositionAsync(
      // Énergie : High (≈10m) suffit pour le suivi de course et consomme bien moins
      // que BestForNavigation (réservé au turn-by-turn). +intervalle espacé.
      { accuracy: Location.Accuracy.High, distanceInterval: 6, timeInterval: 3000 },
      (loc) => {
        const pt = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        const ts = loc.timestamp || Date.now();
        if (lastPt.current && lastTs.current != null) {
          // Anti-triche : on rejette le point si la vitesse implicite est
          // aberrante (téléport / Δt nul) AVANT de cumuler la distance — sinon
          // on gonflerait artificiellement le parcours. Le filtre jitter
          // existant (d < 80 m) est conservé et complété, pas remplacé.
          const plausible = isPlausibleMove(
            lastPt.current.lat, lastPt.current.lng, lastTs.current,
            pt.lat, pt.lng, ts, 'run',
          );
          if (!plausible) return; // point ignoré : ni distance, ni mise à jour du dernier point/horodatage
          const d = haversine(lastPt.current, pt);
          if (d < 80) setMeters((m) => m + d);
        }
        lastPt.current = pt;
        lastTs.current = ts;
        // Après les filtres (anti-triche + jitter) : seuls les points RETENUS forment
        // le tracé, sinon un parcours publié contiendrait les aberrations rejetées.
        if (trackRef.current.length < 3000) trackRef.current.push(pt);
        if (mapReady.current) webRef.current?.injectJavaScript(`window.addPoint && window.addPoint(${pt.lat},${pt.lng}); true;`);
      }
    );
  };
  const pause = () => { setStatus('paused'); subRef.current?.remove(); subRef.current = null; if (timerRef.current) clearInterval(timerRef.current); if (simTimer.current) { clearInterval(simTimer.current); simTimer.current = null; } };

  /**
   * Propose de transformer la sortie en parcours communautaire.
   *
   * Deux étapes volontaires : on DEMANDE d'abord (personne n'aime voir sa trace publiée
   * sans son accord — c'est de la donnée de localisation), puis on envoie en modération.
   * Le tracé brut est réduit à ~6 étapes : un parcours se lit, il ne se rejoue pas point
   * par point, et 1200 coordonnées seraient illisibles autant qu'inutiles.
   */
  const offerRouteShare = (track: TrackPoint[], km: number, email: string) => {
    Alert.alert(
      t.routeAskTitle,
      t.routeAskBody.replace('{km}', km.toFixed(1)),
      [
        { text: t.routeNo, style: 'cancel' },
        {
          text: t.routeYes,
          onPress: async () => {
            try {
              const stops = labelStops(sampleStops(track, 6), String(language));
              const id = await submitRoute(email, {
                name: defaultRouteName(km, String(language), new Date().toISOString()),
                totalKm: +km.toFixed(2),
                waypoints: stops,
              });
              Alert.alert(id ? t.routeSentTitle : t.saveFailed, id ? t.routeSentBody : t.saveFailedMsg);
            } catch {
              Alert.alert(t.saveFailed, t.saveFailedMsg);
            }
          },
        },
      ],
    );
  };

  const finish = async () => {
    pause();
    setStatus('idle');
    const km = meters / 1000;
    const kcal = Math.max(0, Math.round(weight * km * 1.036));
    const email = user?.primaryEmailAddress?.emailAddress || '';
    // Bug fix : n'afficher l'alerte de succès QUE si l'écriture Firestore a réussi.
    // `saved` reste false tant que addNutritionLog (l'écriture principale) n'a pas
    // résolu ; en cas d'échec on montre une alerte d'erreur au lieu d'un faux succès.
    let saved = false;
    if (email && kcal > 0) {
      try {
        const d = new Date();
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        await addNutritionLog({ userId: email, type: 'activity', name: `${t.title} · ${km.toFixed(2)} km`, calories: kcal, protein: 0, carbs: 0, fat: 0, date, duration: Math.round(secs / 60), intensity: 'medium' } as any);
        saved = true; // l'écriture principale a réussi
        logEvent(email, 'run_completed', { km: +km.toFixed(2), kcal, durationMin: Math.round(secs / 60) }); // Event Bus

        // Phase 3 sync: a solo run also advances every virtual challenge you joined.
        addDistanceToJoinedChallenges(email, km).catch(() => {});
        // Steps from this run are added to today's Home step count + notification.
        addActivitySteps(email, km).then(() => refreshStepsNotification()).catch(() => {});
        // Crédite les compteurs des nouvelles features : défi annuel, XP avatar, km Sadaqa/récompenses.
        creditKm(km).catch(() => {});
        // Publie un résumé NON sensible (type + km) dans le feed social des amis.
        publishActivity(email, { type: 'run_completed', km }).catch(() => {});
      } catch (e) { console.warn('[run] save failed', e); }
    }
    // PARTAGE SORTANT : le récit de la sortie part vers WhatsApp, un SMS, ou la
    // feuille du système. Proposé ICI, juste après l'enregistrement, parce que
    // c'est le seul moment où quelqu'un a envie de le montrer — trente minutes
    // plus tard, la sortie est déjà rangée.
    setRecit(recitTrajet({ km, minutes: Math.round(secs / 60), kcal }, String(language)));

    // PARCOURS COMMUNAUTAIRE : proposer de publier la sortie AVANT la remise à zéro —
    // c'est le seul instant où le tracé existe encore et où l'utilisateur a le contexte.
    // Uniquement en GPS réel : publier un parcours simulé polluerait la bibliothèque.
    const track = trackRef.current.slice();
    if (mode !== 'sim' && email && isRouteWorthy(track, km)) {
      offerRouteShare(track, km, email);
    }

    // Reset for the next run, refresh the history list, and stay on the screen.
    setMeters(0); setSecs(0); lastPt.current = null; lastTs.current = null; simStep.current = 0;
    trackRef.current = [];
    if (mapReady.current) webRef.current?.injectJavaScript(`window.resetPath && window.resetPath(); true;`);
    await loadHistory();
    if (saved) {
      Alert.alert(t.saved, `${kcal} ${t.savedMsg}`);
    } else if (email && kcal > 0) {
      // L'écriture a échoué : prévenir l'utilisateur au lieu de laisser croire que c'est sauvé.
      Alert.alert(t.saveFailed, t.saveFailedMsg);
    }
  };

  const km = meters / 1000;
  const paceMin = km > 0 ? secs / 60 / km : 0;
  const kcal = Math.round(weight * km * 1.036);
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const paceStr = paceMin > 0 ? `${Math.floor(paceMin)}'${String(Math.round((paceMin % 1) * 60)).padStart(2, '0')}"` : "--'--";

  const text = k.text;
  const sub = k.textMuted;
  const card = k.surface;
  const tok = useTokens();
  const bg = tok.bg;

  const html = useMemo(() => (center ? buildHtml(center, k.accent) : ''), [center]);

  if (perm === 'denied') {
    return (
      <View style={[styles.center, { backgroundColor: bg, padding: 32 }]}>
        <MapPin size={48} color={k.accent} />
        <Text style={[styles.permTxt, { color: text }]}>{t.perm}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => Location.requestForegroundPermissionsAsync().then((r) => r.status === 'granted' && setPerm('ok'))}>
          <Text style={styles.primaryBtnTxt}>{t.grant}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!__gate.ok) return __gate.node;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <BrandOverlay />
      {center ? (
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          // ⚠  EST LE REFERENT envoye a Google Maps. Il valait
          // 'https://localhost/', que la console GCP ne peut pas restreindre
          // utilement : n'importe qui peut se declarer localhost. La cle JS
          // partant dans l'APK, elle etait donc exploitable sans limite.
          // Aligne sur le domaine reel pour rendre la restriction par
          // referent possible. Le HTML injecte est autonome (scripts en URL
          // absolue) : changer la base ne casse aucune resolution relative.
          source={{ html, baseUrl: 'https://salorie.com' }}
          style={StyleSheet.absoluteFill}
          javaScriptEnabled
          domStorageEnabled
          onMessage={(e) => { if (e.nativeEvent.data === 'ready') mapReady.current = true; }}
          startInLoadingState
          renderLoading={() => <View style={[StyleSheet.absoluteFill, styles.center]}><ActivityIndicator size="large" color={k.accent} /></View>}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}><ActivityIndicator size="large" color={k.accent} /><Text style={{ color: sub, marginTop: 12 }}>{t.waiting}</Text></View>
      )}

      <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retour')} style={[styles.back, { backgroundColor: card }]} onPress={() => router.back()}>
        <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}><ArrowLeft size={22} color={text} /></View>
      </TouchableOpacity>

      <View style={[styles.panel, { backgroundColor: card }]}>
        {/* Mode switch (only before a run starts) */}
        {status === 'idle' && (
          <View style={[styles.modeRow, { backgroundColor: k.surface }]}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'gps' && { backgroundColor: card, shadowOpacity: 0.12 }]}
              onPress={() => setMode('gps')}
            >
              <Navigation size={16} color={mode === 'gps' ? k.accent : sub} />
              <Text style={[styles.modeTxt, { color: mode === 'gps' ? k.accent : sub }]}>{t.gps}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'sim' && { backgroundColor: card, shadowOpacity: 0.12 }]}
              onPress={() => setMode('sim')}
            >
              <Zap size={16} color={mode === 'sim' ? k.info : sub} />
              <Text style={[styles.modeTxt, { color: mode === 'sim' ? k.info : sub }]}>{t.sim}</Text>
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
            <PrimaryButton
              title={mode === 'sim' ? `${t.start} · ${t.sim}` : t.start}
              onPress={startTracking}
              icon={mode === 'sim' ? <Zap size={24} color={k.onAccent} fill={k.surface} /> : <Play size={26} color={k.onAccent} fill={k.surface} />}
              style={[styles.bigBtn, mode === 'sim' && { backgroundColor: k.info }] as any}
            />
          )}
          {status === 'running' && (
            <SecondaryButton
              title={t.pause}
              onPress={pause}
              icon={<Pause size={26} color={k.warning} fill={k.warning} />}
              style={[styles.bigBtn, { backgroundColor: 'transparent', borderColor: k.warning }] as any}
            />
          )}
          {status === 'paused' && (
            <>
              <SecondaryButton
                title={t.resume}
                onPress={startTracking}
                icon={<Play size={24} color={k.accent} fill={k.accent} />}
                style={[styles.bigBtn, { flex: 1, backgroundColor: 'transparent' }] as any}
              />
              <PrimaryButton
                title={t.finish}
                onPress={finish}
                icon={<Square size={22} color={k.onAccent} fill={k.surface} />}
                style={[styles.bigBtn, { flex: 1, backgroundColor: k.danger }] as any}
              />
            </>
          )}
        </View>

        {/* Mode fantôme AR + Live Twin — coureur virtuel / jumeau live (only when idle) */}
        {status === 'idle' && (
          <View style={[styles.idleBtnRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <TouchableOpacity
              style={[styles.ghostBtn, { flex: 1, marginTop: 0 }, { borderColor: k.border, backgroundColor: k.surface }]}
              onPress={() => router.push('/ar-ghost' as any)}
            >
              <Text style={[styles.ghostBtnTxt, { color: text }]} numberOfLines={1}>{t.ghost}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ghostBtn, { flex: 1, marginTop: 0 }, { borderColor: k.border, backgroundColor: k.surface }]}
              onPress={() => router.push('/live-twin' as any)}
            >
              <Text style={[styles.ghostBtnTxt, { color: text }]} numberOfLines={1}>{t.liveTwin}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Le récit de la sortie qu'on vient de terminer, avec de quoi le montrer.
            Il ne s'affiche qu'une fois la course finie, et disparaît au démarrage
            de la suivante : c'est un moment, pas un élément permanent de l'écran. */}
        {status === 'idle' && recit ? (
          <View style={styles.histWrap}>
            <Text style={[styles.histTitle, { color: text }]} numberOfLines={2}>
              {recit}
            </Text>
            <BoutonsPartage texte={recit} lien={lienPartage('course', 'course')} titre={t.title} />
          </View>
        ) : null}

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
                  <View key={i} style={[styles.histRow, { borderTopColor: k.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.histName, { color: text }]} numberOfLines={1}>{h.name}</Text>
                      <Text style={[styles.histDate, { color: sub }]}>{h.date}{h.duration ? ` · ${h.duration} min` : ''}</Text>
                    </View>
                    <Text style={[styles.histKcal, { color: k.accent }]}>{h.calories} kcal</Text>
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
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, { color: text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: sub }]}>{label}{unit ? ` (${unit})` : ''}</Text>
    </View>
  );
}

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeStyles = (k: Tokens) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  permTxt: { fontSize: 16, fontWeight: '600', textAlign: 'center', marginTop: 16, marginBottom: 20, lineHeight: 22 },
  primaryBtn: { backgroundColor: k.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  primaryBtnTxt: { color: k.onAccent, fontSize: 16, fontWeight: '800' },
  back: { position: 'absolute', top: 50, left: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: k.shadow, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34, shadowColor: k.shadow, shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  stat: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 23, fontWeight: '900', letterSpacing: -1 },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  controls: { flexDirection: 'row', gap: 12 },
  bigBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: k.accent, paddingVertical: 18, borderRadius: 18 },
  bigBtnTxt: { color: k.onAccent, fontSize: 17, fontWeight: '800' },
  modeRow: { flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: 16, gap: 4 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 11, shadowColor: k.shadow, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  modeTxt: { fontSize: 14, fontWeight: '800' },
  idleBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  ghostBtn: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
  ghostBtnTxt: { fontSize: 15, fontWeight: '800' },
  histWrap: { marginTop: 18 },
  histHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  histTitle: { fontSize: 15, fontWeight: '800' },
  histEmpty: { fontSize: 13, fontWeight: '500', paddingVertical: 8 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1 },
  histName: { fontSize: 14, fontWeight: '700' },
  histDate: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  histKcal: { fontSize: 14, fontWeight: '800' },
});
