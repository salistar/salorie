import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView,
  Image, Modal, Dimensions, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import BrandOverlay from '../../components/BrandOverlay';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Flag, Play, Square, Camera, MapPin, X, Navigation2 } from 'lucide-react-native';
import { addNutritionLog, emailToDocId } from '../../lib/firebase';
import { addActivitySteps } from '../../lib/steps';
import { refreshStepsNotification } from '../../lib/stepsNotif';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import {
  getChallenge,
  getMyChallengeProgress,
  joinChallenge,
  listenChallengeBoard,
  setChallengeProgress,
  Challenge,
  ChallengeProgress,
  ChallengePOI,
  streetViewUrl,
} from '../../lib/races';
import { poiPhoto } from '../../assets/challenges/registry';
import Medal from '../../components/Medal';
import { getRace as apiGetRace, joinRace as apiJoinRace, raceProgress as apiProgress } from '../../lib/racesApi';

// Mappe un défi (id) vers un thème de cadre médaille (sinon défaut vert).
const CHALLENGE_FRAME: Record<string, string> = { 'casa-loop': 'casablanca' };

// Google Maps JS in a WebView — same approach as run.tsx (the JS API key works in a
// WebView with a baseUrl; react-native-maps would need a Maps SDK for Android key).
const GOOGLE_MAPS_KEY = 'AIzaSyAa1lBSroSXA-Om4mio84-SWAcmzQgYv8w';
const PRIMARY = Colors.light.primary;
const { width: SCREEN_W } = Dimensions.get('window');

const TXT: Record<string, any> = {
  en: {
    title: 'Challenge', join: 'Join challenge', joined: 'Joined!', joining: 'Joining…',
    leaderboard: 'Leaderboard', you: 'You', of: 'of', km: 'km', notFound: 'Challenge not found',
    hint: 'Your runs add to your progress automatically.', start: 'Start', finish: 'Finish',
    progress: 'Progress', participants: 'participants',
    startNav: 'Start navigation', stopNav: 'Stop', arMode: 'AR mode',
    stops: 'Landmarks on the route', youAreHere: 'You are here', reached: 'Reached',
    locked: 'Reach it to unlock', tapToView: 'Tap to view', viewLandmark: 'View this place',
    navHint: 'Follow the route — photos appear as you pass each landmark.',
    simMode: 'Simulation', realMode: 'Live (GPS)',
    simHint: 'Simulation — replaying the route.',
    realHint: 'Live GPS — move to advance. Stand still and nothing moves.',
    locNeeded: 'Enable location to use live GPS navigation.',
  },
  fr: {
    title: 'Défi', join: 'Rejoindre le défi', joined: 'Rejoint !', joining: 'Connexion…',
    leaderboard: 'Classement', you: 'Toi', of: 'sur', km: 'km', notFound: 'Défi introuvable',
    hint: 'Tes courses augmentent ta progression automatiquement.', start: 'Départ', finish: 'Arrivée',
    progress: 'Progression', participants: 'participants',
    startNav: 'Démarrer la navigation', stopNav: 'Arrêter', arMode: 'Mode AR',
    stops: 'Lieux sur le parcours', youAreHere: 'Vous êtes ici', reached: 'Atteint',
    locked: 'Atteins-le pour débloquer', tapToView: 'Toucher pour voir', viewLandmark: 'Voir ce lieu',
    navHint: 'Suis le parcours — les photos apparaissent à chaque lieu franchi.',
    simMode: 'Simulation', realMode: 'Réel (GPS)',
    simHint: 'Simulation — rejoue le parcours.',
    realHint: 'GPS réel — bouge pour avancer. Si tu ne bouges pas, rien ne bouge.',
    locNeeded: 'Active la localisation pour la navigation GPS réelle.',
  },
  ar: {
    title: 'التحدي', join: 'انضم إلى التحدي', joined: 'تم الانضمام!', joining: 'جارٍ الانضمام…',
    leaderboard: 'المتصدّرون', you: 'أنت', of: 'من', km: 'كم', notFound: 'التحدي غير موجود',
    hint: 'تُضاف جريك إلى تقدّمك تلقائيًا.', start: 'البداية', finish: 'النهاية',
    progress: 'التقدّم', participants: 'مشارك',
    startNav: 'بدء الملاحة', stopNav: 'إيقاف', arMode: 'الواقع المعزّز',
    stops: 'معالم على المسار', youAreHere: 'أنت هنا', reached: 'تم الوصول',
    locked: 'صِل إليه لفتحه', tapToView: 'اضغط للعرض', viewLandmark: 'عرض هذا المكان',
    navHint: 'اتبع المسار — تظهر الصور عند تجاوز كل معلم.',
    simMode: 'محاكاة', realMode: 'مباشر (GPS)',
    simHint: 'محاكاة — إعادة تشغيل المسار.',
    realHint: 'GPS مباشر — تحرّك للتقدّم. إن لم تتحرّك لا شيء يتحرّك.',
    locNeeded: 'فعّل الموقع لاستخدام ملاحة GPS المباشرة.',
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

// Decode a Google "encoded polyline" into LatLng[] (Directions overview_polyline).
function decodePolyline(enc: string): LatLng[] {
  let idx = 0, lat = 0, lng = 0;
  const pts: LatLng[] = [];
  while (idx < enc.length) {
    let b, shift = 0, result = 0;
    do { b = enc.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = enc.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}

// Interpolate a LatLng at a 0..1 fraction of the total distance along the route.
function pointAtFraction(route: LatLng[], fraction: number): LatLng {
  if (!route.length) return { lat: 0, lng: 0 };
  if (route.length === 1) return route[0];
  const f = Math.max(0, Math.min(1, fraction));
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
  let target = f * total;
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

// Point du tracé le plus proche d'un POI → place TOUS les arrêts SUR le trajet.
function nearestOnRoute(route: LatLng[], p: LatLng): LatLng {
  if (!route.length) return p;
  let best = route[0], bd = Infinity;
  for (const r of route) { const d = haversine(r, p); if (d < bd) { bd = d; best = r; } }
  return best;
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
  var POIS = [];        // [{name,lat,lng,frac}]
  var poiMarkers = [];
  var navRAF = null, navFired = {};
  var ARROW = 'M 0 -11 L 7 9 L 0 4 L -7 9 Z';

  function hav(a,b){var R=6371000,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,la1=a.lat*Math.PI/180,la2=b.lat*Math.PI/180;var h=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)*Math.sin(dLng/2);return 2*R*Math.asin(Math.sqrt(h));}
  function bearing(a,b){var y=Math.sin((b.lng-a.lng)*Math.PI/180)*Math.cos(b.lat*Math.PI/180);var x=Math.cos(a.lat*Math.PI/180)*Math.sin(b.lat*Math.PI/180)-Math.sin(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.cos((b.lng-a.lng)*Math.PI/180);return (Math.atan2(y,x)*180/Math.PI+360)%360;}
  function segInfo(path){var segs=[],total=0;for(var i=0;i<path.length-1;i++){var d=hav(path[i],path[i+1]);segs.push(d);total+=d;}return {segs:segs,total:total};}
  function ptAt(path,segs,total,f){if(f<=0)return {lat:path[0].lat,lng:path[0].lng,seg:0};if(f>=1)return {lat:path[path.length-1].lat,lng:path[path.length-1].lng,seg:path.length-2};var target=f*total;for(var i=0;i<segs.length;i++){if(target<=segs[i]||i===segs.length-1){var r=segs[i]>0?target/segs[i]:0;return {lat:path[i].lat+(path[i+1].lat-path[i].lat)*r,lng:path[i].lng+(path[i+1].lng-path[i].lng)*r,seg:i};}target-=segs[i];}return {lat:path[path.length-1].lat,lng:path[path.length-1].lng,seg:path.length-2};}

  function initMap(){
    var map = new google.maps.Map(document.getElementById('map'), {
      disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy', zoom: 13
    });
    window._map = map;
    window._poly = new google.maps.Polyline({ map: map, path: ROUTE, geodesic: false, strokeColor: '${color}', strokeOpacity: 1, strokeWeight: 6 });
    window._start = new google.maps.Marker({ position: START, map: map, title: 'Start',
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } });
    window._end = new google.maps.Marker({ position: END, map: map, title: 'Finish',
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#ef4444', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } });
    window._me = new google.maps.Marker({ position: ME, map: map, title: 'You', zIndex: 999,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '${color}', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 4 } });
    function fit(path){ var b = new google.maps.LatLngBounds(); path.forEach(function(p){ b.extend(p); }); map.fitBounds(b, 60); }
    window._fit = fit; fit(ROUTE);

    window.setRoute = function(path){ if(!path||!path.length) return; window._poly.setPath(path); window._start.setPosition(path[0]); window._end.setPosition(path[path.length-1]); fit(path); };
    window.moveMe = function(lat,lng){ window._me.setPosition({lat:lat,lng:lng}); };

    // Drop numbered landmark pins.
    window.setPois = function(list){
      POIS = list || [];
      poiMarkers.forEach(function(m){ m.setMap(null); }); poiMarkers = [];
      POIS.forEach(function(p,i){
        var m = new google.maps.Marker({ position:{lat:p.lat,lng:p.lng}, map:map, title:p.name, zIndex:500,
          label:{ text:String(i+1), color:'#fff', fontSize:'12px', fontWeight:'700' },
          icon:{ path: google.maps.SymbolPath.CIRCLE, scale:13, fillColor:'#0ea5e9', fillOpacity:1, strokeColor:'#fff', strokeWeight:3 } });
        m.addListener('click', function(){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('poiTap:'+i); });
        poiMarkers.push(m);
      });
    };

    window.focusPoi = function(i){ if(!POIS[i]) return; map.panTo({lat:POIS[i].lat,lng:POIS[i].lng}); map.setZoom(17); };

    // Navigation that mirrors your REAL progress: fly the arrow from fromFrac ->
    // toFrac (your current distance) over durationMs, following with the camera and
    // firing poi events only for landmarks you have actually reached.
    window.startNav = function(fromFrac, toFrac, durationMs){
      if(navRAF){ cancelAnimationFrame(navRAF); navRAF=null; }
      navFired = {};
      var path = window._poly.getPath().getArray().map(function(p){return {lat:p.lat(),lng:p.lng()};});
      if(path.length<2){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('navdone'); return; }
      var info = segInfo(path);
      // arrow icon
      window._me.setIcon({ path: ARROW, scale: 1.7, fillColor:'${color}', fillOpacity:1, strokeColor:'#fff', strokeWeight:1.5, rotation:0, anchor:new google.maps.Point(0,0) });
      window._me.setZIndex(9999);
      map.setZoom(17);
      var t0 = null, navLastSent = -1;
      function frame(ts){
        if(t0===null) t0=ts;
        var lin = Math.min(1,(ts-t0)/durationMs);
        var frac = fromFrac + lin*(toFrac-fromFrac);
        var pos = ptAt(path, info.segs, info.total, frac);
        var nextI = Math.min(pos.seg+1, path.length-1);
        var hdg = bearing(path[pos.seg], path[nextI]);
        window._me.setPosition({lat:pos.lat,lng:pos.lng});
        window._me.setIcon({ path: ARROW, scale: 1.7, fillColor:'${color}', fillOpacity:1, strokeColor:'#fff', strokeWeight:1.5, rotation:hdg, anchor:new google.maps.Point(0,0) });
        map.panTo({lat:pos.lat,lng:pos.lng});
        // fire poi events
        for(var i=0;i<POIS.length;i++){ if(!navFired[i] && POIS[i].frac<=frac){ navFired[i]=1; if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('poi:'+i); } }
        // report progress fraction (throttled to ~1% steps) so RN can advance distance.
        if(frac - navLastSent >= 0.01 || lin>=1){ navLastSent=frac; if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('frac:'+frac.toFixed(4)); }
        if(lin<1){ navRAF=requestAnimationFrame(frame); } else { navRAF=null; if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('navdone'); }
      }
      navRAF = requestAnimationFrame(frame);
    };

    window.stopNav = function(){
      if(navRAF){ cancelAnimationFrame(navRAF); navRAF=null; }
      window._me.setIcon({ path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor:'${color}', fillOpacity:1, strokeColor:'#fff', strokeWeight:4 });
      window._fit(window._poly.getPath().getArray().map(function(p){return {lat:p.lat(),lng:p.lng()};}));
    };

    // Real-GPS navigation: switch to the arrow + street-level zoom and wait for
    // positions. Nothing moves until navReal() is called with a new location.
    window.enterReal = function(){
      if(navRAF){ cancelAnimationFrame(navRAF); navRAF=null; }
      window._me.setIcon({ path: ARROW, scale: 1.7, fillColor:'${color}', fillOpacity:1, strokeColor:'#fff', strokeWeight:1.5, rotation:0, anchor:new google.maps.Point(0,0) });
      window._me.setZIndex(9999);
      map.setZoom(17);
    };
    window.navReal = function(lat,lng,heading){
      window._me.setPosition({lat:lat,lng:lng});
      window._me.setIcon({ path: ARROW, scale: 1.7, fillColor:'${color}', fillOpacity:1, strokeColor:'#fff', strokeWeight:1.5, rotation:(heading||0), anchor:new google.maps.Point(0,0) });
      map.panTo({lat:lat,lng:lng});
      if(map.getZoom()<16) map.setZoom(17);
    };

    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ready');
  }
  window.gm_authFailure=function(){ document.body.innerHTML='<div style="color:#b91c1c;font-family:sans-serif;padding:24px;text-align:center">Google Maps key error.</div>'; };
</script>
<script async defer src="https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&callback=initMap"></script>
</body></html>`;
}

// Photo d'un arrêt : bundlée (défis hardcodés, offline) OU URL distante (Street View
// auto pour les courses Mongo, calculée depuis les coords).
function PoiPhoto({ challengeId, index, style, photoUrl }: { challengeId: string; index: number; style?: any; photoUrl?: string }) {
  if (photoUrl) return <Image source={{ uri: photoUrl }} style={style} resizeMode="cover" />;
  const src = poiPhoto(challengeId, index);
  if (!src) return <View style={[style, { backgroundColor: '#cbd5e1' }]} />;
  return <Image source={src} style={style} resizeMode="cover" />;
}

export default function ChallengeScreen() {
  const { id, src } = useLocalSearchParams<{ id: string; src?: string }>();
  const challengeId = String(id || '');
  // Course admin (Mongo) vs défi hardcodé (Firestore). Mongo = id ObjectId 24 hex OU src=mongo.
  const isMongo = String(src) === 'mongo' || /^[a-f0-9]{24}$/i.test(challengeId);
  const [mongoChallenge, setMongoChallenge] = useState<Challenge | undefined>(undefined);
  const [mongoSpec, setMongoSpec] = useState<any>(null);
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

  const challenge: Challenge | undefined = isMongo ? mongoChallenge : getChallenge(challengeId);

  // Charge la course Mongo (admin) et la convertit au format Challenge (route + POIs).
  useEffect(() => {
    if (!isMongo || !challengeId) return;
    let alive = true;
    apiGetRace(challengeId).then((r: any) => {
      if (!alive || !r) return;
      const wps = (r.waypoints || []) as any[];
      // Coercition numérique : ces valeurs (saisies admin) partent dans des
      // template strings injectJavaScript/URL — on n'injecte QUE des nombres.
      const num = (v: any) => Number(v) || 0;
      setMongoChallenge({
        id: String(r._id || challengeId), name: String(r.name || ''), totalKm: num(r.totalKm), emoji: r.emoji || '🏃',
        route: wps.map((w) => ({ lat: num(w.lat), lng: num(w.lng) })),
        pois: wps.map((w) => ({ name: String(w.name || ''), lat: num(w.lat), lng: num(w.lng), atKm: num(w.atKm) })),
      } as Challenge);
      setMongoSpec(r.medalSpec || null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [isMongo, challengeId]);

  const [board, setBoard] = useState<ChallengeProgress[]>([]);
  const [myKm, setMyKm] = useState<number | null>(null);
  const [joining, setJoining] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [roadPath, setRoadPath] = useState<LatLng[]>([]);
  const [navMode, setNavMode] = useState(false);
  const [navKind, setNavKind] = useState<'sim' | 'real'>('sim');
  const [reached, setReached] = useState<Record<number, boolean>>({});
  const [activePoi, setActivePoi] = useState<number | null>(null); // photo card during nav
  const [viewerPoi, setViewerPoi] = useState<number | null>(null); // fullscreen viewer
  const webRef = useRef<WebView | null>(null);
  const locWatch = useRef<Location.LocationSubscription | null>(null);
  const [liveKm, setLiveKm] = useState<number | null>(null); // distance shown live during nav
  const sessionBaseKm = useRef(0);     // progress at the moment real-nav started
  const sessionKm = useRef(0);         // distance moved this real-nav session
  const lastReal = useRef<LatLng | null>(null);
  const lastWrite = useRef(0);         // throttle Firestore writes (ms)
  const navStartKm = useRef(0);        // progress when this nav session started
  const segmentLogged = useRef(false); // guard so a segment is logged to activity once
  const [weight, setWeight] = useState(70);

  const pois: ChallengePOI[] = (challenge?.pois as ChallengePOI[]) || [];

  // Fetch a real road-following route (Google Directions, walking).
  useEffect(() => {
    if (!challenge) return;
    let alive = true;
    (async () => {
      try {
        const r = challenge.route as LatLng[];
        if (r.length < 2) return;
        const origin = `${r[0].lat},${r[0].lng}`;
        const dest = `${r[r.length - 1].lat},${r[r.length - 1].lng}`;
        const wp = r.slice(1, -1).map((p) => `${p.lat},${p.lng}`).join('|');
        // driving = suit les routes même sur longue distance (walking échoue > ~100 km).
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${dest}${wp ? `&waypoints=${wp}` : ''}&mode=driving&key=${GOOGLE_MAPS_KEY}`;
        const res = await fetch(url);
        const j = await res.json();
        if (alive && j.status === 'OK' && j.routes?.[0]?.overview_polyline?.points) {
          setRoadPath(decodePolyline(j.routes[0].overview_polyline.points));
        }
      } catch (e) { console.warn('[challenge] directions failed', e); }
    })();
    return () => { alive = false; };
  }, [challengeId, challenge?.id]); // challenge?.id : relance quand la course Mongo (async) se charge

  // Load body weight (for the calorie estimate when a segment is logged).
  useEffect(() => {
    (async () => {
      if (!email) return;
      try {
        const raw = await AsyncStorage.getItem(`profile_${emailToDocId(email)}`);
        const p = raw ? JSON.parse(raw) : null;
        if (p?.weight) setWeight(Number(p.weight) || 70);
      } catch {}
    })();
  }, [email]);

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
  const baseKm = myKm ?? 0;
  // While navigating, show the live distance (sim or GPS); otherwise the saved value.
  const myCumulativeKm = navMode && liveKm != null ? liveKm : baseKm;
  const fraction = totalKm > 0 ? Math.min(1, myCumulativeKm / totalKm) : 0;
  const pct = Math.round(fraction * 100);
  const joined = myKm !== null;

  // ── Style Conqueror : prochain arrêt + position réelle + jalons ──
  const nextPoi = pois.find((p) => (p.atKm || 0) > myCumulativeKm) || null;
  const [realPos, setRealPos] = useState<LatLng | null>(null);
  const [showMyView, setShowMyView] = useState(false);
  useEffect(() => {
    if (!joined) return;
    let alive = true;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) return; // pas de demande intrusive ici — affichage best-effort
        const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (alive) setRealPos({ lat: cur.coords.latitude, lng: cur.coords.longitude });
      } catch {}
    })();
    return () => { alive = false; };
  }, [joined]);

  // Célébration aux jalons 25/50/75/100 % (cartes postales débloquées en route).
  const prevPctRef = useRef(-1);
  useEffect(() => {
    const prev = prevPctRef.current;
    prevPctRef.current = pct;
    if (prev < 0 || pct <= prev) return;
    const crossed = [25, 50, 75, 100].find((m) => prev < m && pct >= m);
    if (crossed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const msg = language === 'fr' ? `🎉 ${crossed}% du défi ! Continue, ta médaille approche.`
        : language === 'ar' ? `🎉 ${crossed}% من التحدي! واصل، ميداليتك تقترب.`
        : `🎉 ${crossed}% of the challenge! Keep going — your medal is getting closer.`;
      Alert.alert(challenge?.name || '', msg);
    }
  }, [pct]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveRoute = roadPath.length > 1 ? roadPath : ((challenge?.route as LatLng[]) || []);
  const mePoint = useMemo<LatLng>(() => {
    if (!challenge || !effectiveRoute.length) return { lat: 0, lng: 0 };
    return pointAtFraction(effectiveRoute, fraction);
  }, [challenge, effectiveRoute, fraction]);

  const html = useMemo(
    () => (challenge ? buildHtml(challenge.route as LatLng[], mePoint, PRIMARY) : ''),
    [challengeId, challenge?.id] // inclut challenge?.id : recalcule quand la course Mongo (async) se charge
  );

  // Draw the real road-following route once it's loaded + the map is ready.
  useEffect(() => {
    if (mapReady && roadPath.length > 1) {
      webRef.current?.injectJavaScript(`window.setRoute && window.setRoute(${JSON.stringify(roadPath)}); true;`);
    }
  }, [mapReady, roadPath]);

  // Push POIs (with their fraction along the route) to the map.
  useEffect(() => {
    if (mapReady && pois.length) {
      const payload = pois.map((p) => {
        // Snap chaque arrêt sur le tracé routier (sinon certains POIs tombent à côté).
        const sn = nearestOnRoute(effectiveRoute, { lat: p.lat, lng: p.lng });
        return { name: p.name, lat: sn.lat, lng: sn.lng, frac: totalKm > 0 ? Math.min(1, p.atKm / totalKm) : 0 };
      });
      webRef.current?.injectJavaScript(`window.setPois && window.setPois(${JSON.stringify(payload)}); true;`);
    }
  }, [mapReady, challengeId, totalKm, roadPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move the "you" marker when my progress changes (when not navigating).
  useEffect(() => {
    if (mapReady && challenge && !navMode) {
      webRef.current?.injectJavaScript(`window.moveMe && window.moveMe(${mePoint.lat},${mePoint.lng}); true;`);
    }
  }, [mePoint, mapReady, challenge, navMode]);

  const onJoin = async () => {
    if (!challengeId || !email || joining) return;
    setJoining(true);
    try {
      if (isMongo) { const p: any = await apiJoinRace(challengeId, displayName); setMyKm(p?.cumulativeKm || 0); }
      else { await joinChallenge(challengeId, email, displayName); setMyKm(0); }
    } catch (e) {
      console.warn('[challenge] join failed', e);
    } finally {
      setJoining(false);
    }
  };

  // Push progress to Firestore, throttled, never below the saved value, capped at total.
  const maybeWrite = (km: number, force = false) => {
    const now = Date.now();
    if (!force && now - lastWrite.current < 1500) return;
    lastWrite.current = now;
    const clamped = Math.min(totalKm || km, Math.max(baseKm, km));
    if (isMongo) apiProgress(challengeId, clamped).catch(() => {}); // backend auto-finit + génère la médaille au total
    else setChallengeProgress(challengeId, email, clamped);
  };

  // Finishing a navigation segment → log the distance covered to recent activity
  // (calories + Firestore), once per session.
  const logSegment = (currentKm: number) => {
    if (segmentLogged.current || !challenge || !email) return;
    const covered = Math.max(0, currentKm - navStartKm.current);
    if (covered < 0.05) return;
    segmentLogged.current = true;
    const kcal = Math.max(1, Math.round(weight * covered * 1.036));
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    addNutritionLog({
      userId: email, type: 'activity',
      name: `${challenge.name} · ${covered.toFixed(1)} km`,
      calories: kcal, protein: 0, carbs: 0, fat: 0, date,
      duration: Math.round(covered * 6), intensity: 'medium',
    } as any).catch((e) => console.warn('[challenge] log segment failed', e));
    // Steps from this race segment are added to today's Home step count + notification.
    addActivitySteps(email, covered).then(() => refreshStepsNotification()).catch(() => {});
  };

  // SIMULATION: replays the full route as a guided fly-through. Advances the
  // distance/progression live as the arrow moves. Stays open until you tap Stop.
  const startSim = () => {
    if (!mapReady) return;
    setReached({});
    setActivePoi(null);
    if (locWatch.current) { locWatch.current.remove(); locWatch.current = null; }
    setNavKind('sim');
    setLiveKm(baseKm);
    lastWrite.current = 0;
    navStartKm.current = baseKm;
    segmentLogged.current = false;
    setNavMode(true);
    // Simulation advances at 10 m/s (≈100 s per km) — the standard sim pace.
    const duration = Math.max(2000, Math.round(Math.max(0.1, totalKm) * 100000));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    webRef.current?.injectJavaScript(`window.startNav && window.startNav(0, 1, ${duration}); true;`);
  };

  // REAL (GPS): follows your true position and adds the distance you actually
  // move to your progression. While you don't move, nothing changes.
  const startReal = async () => {
    if (!mapReady) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert(t.realMode, t.locNeeded); return; }
      setReached({});
      setActivePoi(null);
      setNavKind('real');
      sessionBaseKm.current = baseKm;
      sessionKm.current = 0;
      lastReal.current = null;
      lastWrite.current = 0;
      navStartKm.current = baseKm;
      segmentLogged.current = false;
      setLiveKm(baseKm);
      setNavMode(true);
      webRef.current?.injectJavaScript(`window.enterReal && window.enterReal(); true;`);
      // Seed with the current position immediately, then watch for movement.
      try {
        const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        lastReal.current = { lat: cur.coords.latitude, lng: cur.coords.longitude };
        const h = cur.coords.heading != null && cur.coords.heading >= 0 ? cur.coords.heading : 0;
        // Le marqueur démarre SUR le trajet (à la progression actuelle), pas à ta position brute.
        const fr0 = totalKm > 0 ? Math.min(1, sessionBaseKm.current / totalKm) : 0;
        const rp0 = pointAtFraction(effectiveRoute, fr0);
        webRef.current?.injectJavaScript(`window.navReal && window.navReal(${rp0.lat}, ${rp0.lng}, ${h}); true;`);
      } catch {}
      locWatch.current = await Location.watchPositionAsync(
        // Énergie : on espace les relevés (2s/4m au lieu de 1s/2m) hors sprint.
        { accuracy: Location.Accuracy.High, distanceInterval: 4, timeInterval: 2000 },
        (pos) => {
          const { latitude, longitude, heading } = pos.coords;
          const cur = { lat: latitude, lng: longitude };
          if (lastReal.current) {
            const dKm = haversine(lastReal.current, cur) / 1000;
            if (dKm > 0.0008) sessionKm.current += dKm; // ignore GPS jitter < ~0.8m
          }
          lastReal.current = cur;
          const total = sessionBaseKm.current + sessionKm.current;
          setLiveKm(total);
          const h = heading != null && heading >= 0 ? heading : 0;
          // Défi VIRTUEL : ta distance réelle (parcourue n'importe où) fait avancer
          // le marqueur LE LONG DU TRAJET — pas besoin d'être à l'emplacement exact.
          const frac = totalKm > 0 ? Math.min(1, total / totalKm) : 0;
          const rp = pointAtFraction(effectiveRoute, frac);
          webRef.current?.injectJavaScript(`window.navReal && window.navReal(${rp.lat}, ${rp.lng}, ${h}); true;`);
          maybeWrite(total);
        }
      );
    } catch (e) {
      console.warn('[challenge] real nav failed', e);
      Alert.alert(t.realMode, t.locNeeded);
      setNavMode(false);
    }
  };

  const stopNav = () => {
    if (liveKm != null) { maybeWrite(liveKm, true); logSegment(liveKm); } // persist + log to activity
    setNavMode(false);
    setActivePoi(null);
    setLiveKm(null);
    if (locWatch.current) { locWatch.current.remove(); locWatch.current = null; }
    webRef.current?.injectJavaScript(`window.stopNav && window.stopNav(); true;`);
  };

  // Clean up the GPS watch if we leave the screen mid-navigation.
  useEffect(() => () => { if (locWatch.current) { locWatch.current.remove(); locWatch.current = null; } }, []);

  const onMessage = (e: any) => {
    const d = String(e.nativeEvent.data || '');
    if (d === 'ready') { setMapReady(true); return; }
    if (d === 'navdone') {
      // Simulation reached the finish — record full progress and stay in nav view
      // (do NOT auto-close); the arrow rests at the end until the user taps Stop.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (navKind === 'sim') { setLiveKm(totalKm); maybeWrite(totalKm, true); logSegment(totalKm); }
      return;
    }
    if (d.startsWith('frac:')) {
      const f = parseFloat(d.slice(5));
      if (!Number.isNaN(f) && navKind === 'sim') {
        const km = f * totalKm;
        setLiveKm(km);
        maybeWrite(km);
      }
      return;
    }
    if (d.startsWith('poi:')) {
      const i = parseInt(d.slice(4), 10);
      if (!Number.isNaN(i)) {
        setReached((r) => ({ ...r, [i]: true }));
        setActivePoi(i);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      return;
    }
    if (d.startsWith('poiTap:')) {
      const i = parseInt(d.slice(7), 10);
      if (!Number.isNaN(i)) setViewerPoi(i);
      return;
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
  const mapH = navMode ? 460 : 280;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <BrandOverlay />
      <View style={[styles.mapWrap, { height: mapH }]}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://localhost/' }}
          style={StyleSheet.absoluteFill}
          javaScriptEnabled
          domStorageEnabled
          onMessage={onMessage}
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

        {/* Street View de MA position sur le parcours (style Conqueror) */}
        {joined && (
          <TouchableOpacity style={styles.myViewBtn} onPress={() => setShowMyView(true)}>
            <MapPin size={13} color="#fff" />
            <Text style={styles.myViewTxt}>Street View</Text>
          </TouchableOpacity>
        )}

        {/* Navigation banner + active landmark photo card */}
        {navMode && (
          <>
            <View style={styles.navBanner} pointerEvents="none">
              {navKind === 'real' ? <Navigation2 size={15} color="#fff" /> : <MapPin size={15} color="#fff" />}
              <Text style={styles.navBannerTxt} numberOfLines={2}>{navKind === 'real' ? t.realHint : t.simHint}</Text>
            </View>
            {activePoi !== null && pois[activePoi] && (
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.navCard}
                onPress={() => setViewerPoi(activePoi)}
              >
                <PoiPhoto challengeId={challengeId} index={activePoi} style={styles.navCardImg} photoUrl={isMongo ? streetViewUrl(pois[activePoi].lat, pois[activePoi].lng) : undefined} />
                <View style={styles.navCardBody}>
                  <Text style={styles.navCardKicker}>📍 {t.youAreHere}</Text>
                  <Text style={styles.navCardName} numberOfLines={1}>{pois[activePoi].name}</Text>
                  <Text style={styles.navCardView}>{t.viewLandmark} ›</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Progress header */}
        <View style={[styles.header, { backgroundColor: card }, rtlRow]}>
          {/* Badge = la médaille du défi (plus d'émoji) */}
          <Medal width={44} frame={isMongo ? undefined : CHALLENGE_FRAME[challengeId]} {...(isMongo && mongoSpec ? mongoSpec : {})} title={challenge.name} km={totalKm} mode="template" />
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

        {/* 📍 Prochain arrêt (style Conqueror) : km de parcours restants + distance réelle */}
        {joined && nextPoi && (
          <View style={[styles.nextStopCard, { backgroundColor: card }]}>
            <Text style={[styles.nextStopKicker, { color: PRIMARY }, align]}>📍 {language === 'fr' ? 'Prochain arrêt' : language === 'ar' ? 'المحطة التالية' : 'Next stop'}</Text>
            <Text style={[styles.nextStopName, { color: text }, align]} numberOfLines={1}>{nextPoi.name}</Text>
            <Text style={[styles.nextStopMeta, { color: sub }, align]}>
              {(nextPoi.atKm - myCumulativeKm).toFixed(1)} {t.km} {language === 'fr' ? 'de parcours restants' : language === 'ar' ? 'متبقية في المسار' : 'left on the route'}
              {realPos ? ` · ${(haversine(realPos, { lat: nextPoi.lat, lng: nextPoi.lng }) / 1000).toFixed(1)} ${t.km} ${language === 'fr' ? 'de ta position réelle' : language === 'ar' ? 'من موقعك الحقيقي' : 'from your real position'}` : ''}
            </Text>
          </View>
        )}

        {/* Médaille de la course — centre = image (Street View) du lieu d'arrivée (connectée) */}
        {totalKm > 0 && (() => {
          const completed = myCumulativeKm >= totalKm;
          const myRank = completed ? ((board.findIndex((b) => b.email === email) + 1) || 1) : 0;
          return (
            <View style={{ alignItems: 'center', marginTop: 14 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', marginBottom: 6, color: completed ? PRIMARY : sub }}>
                {completed ? '🎉 Médaille gagnée !' : 'Ta médaille à débloquer'}
              </Text>
              <View style={completed ? undefined : { opacity: 0.5 }}>
                <Medal width={190} frame={isMongo ? undefined : CHALLENGE_FRAME[challengeId]} {...(isMongo && mongoSpec ? mongoSpec : {})} title={challenge.name}
                  km={totalKm} rank={myRank || undefined} name={user?.fullName || t.you} photoSource={isMongo ? undefined : poiPhoto(challengeId, 0)} />
              </View>
              {completed && <Text style={{ fontSize: 14, fontWeight: '700', marginTop: 6, color: text }}>{t.leaderboard} : {myRank}{language === 'fr' ? 'ᵉ' : ''}</Text>}
            </View>
          );
        })()}

        {/* Join button (only when not joined) */}
        {!joined && (
          <TouchableOpacity style={[styles.joinBtn, joining && { opacity: 0.7 }]} onPress={onJoin} disabled={joining}>
            <Text style={styles.joinBtnTxt}>{joining ? t.joining : t.join}</Text>
          </TouchableOpacity>
        )}

        {/* Navigation modes + AR (after joining) */}
        {joined && (
          <View style={{ marginHorizontal: 16, marginTop: 16 }}>
            {!navMode ? (
              <>
                <View style={[styles.actionRow, rtlRow, { marginHorizontal: 0, marginTop: 0 }]}>
                  <TouchableOpacity style={[styles.navBtn, { backgroundColor: PRIMARY }]} onPress={startSim}>
                    <Play size={17} color="#fff" fill="#fff" />
                    <Text style={styles.navBtnTxt}>{t.simMode}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.navBtn, { backgroundColor: '#0ea5e9' }]} onPress={startReal}>
                    <Navigation2 size={17} color="#fff" />
                    <Text style={styles.navBtnTxt}>{t.realMode}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.arBtnWide, { borderColor: PRIMARY }]}
                  onPress={() => router.push(`/challenge-ar?id=${challengeId}` as any)}
                >
                  <Camera size={18} color={PRIMARY} />
                  <Text style={[styles.arBtnTxt, { color: PRIMARY }]}>{t.arMode}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={[styles.navBtn, { backgroundColor: '#ef4444', marginTop: 0 }]} onPress={stopNav}>
                <Square size={16} color="#fff" fill="#fff" />
                <Text style={styles.navBtnTxt}>{t.stopNav} · {navKind === 'sim' ? t.simMode : t.realMode}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Hint */}
        <Text style={[styles.hint, { color: sub }, align]}>{t.hint}</Text>

        {/* Landmarks along the route */}
        {pois.length > 0 && (
          <>
            <View style={[styles.lbHeader, rtlRow]}>
              <Text style={[styles.lbTitle, { color: text }]}>{t.stops}</Text>
              <Text style={[styles.lbCount, { color: sub }]}>{pois.length}</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
              style={{ marginBottom: 6 }}
            >
              {pois.map((p, i) => {
                const isReached = reached[i] || fraction >= (totalKm > 0 ? p.atKm / totalKm : 0);
                return (
                  <TouchableOpacity
                    key={i}
                    activeOpacity={0.9}
                    style={[styles.poiCard, { backgroundColor: card }]}
                    onPress={() => setViewerPoi(i)}
                  >
                    <View style={styles.poiImgWrap}>
                      <PoiPhoto challengeId={challengeId} index={i} style={styles.poiImg} photoUrl={isMongo && pois[i] ? streetViewUrl(pois[i].lat, pois[i].lng) : undefined} />
                      {!isReached && (
                        <View style={styles.poiLock}>
                          <Text style={styles.poiLockTxt}>{t.locked}</Text>
                        </View>
                      )}
                      <View style={styles.poiBadge}>
                        <Text style={styles.poiBadgeTxt}>{i + 1}</Text>
                      </View>
                    </View>
                    <View style={{ padding: 10 }}>
                      <Text style={[styles.poiName, { color: text }]} numberOfLines={1}>{p.name}</Text>
                      <Text style={[styles.poiKm, { color: isReached ? PRIMARY : sub }]}>
                        {isReached ? `✓ ${t.reached}` : `${p.atKm} ${t.km}`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

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

      {/* Fullscreen landmark viewer (Street View photo) */}
      <Modal visible={viewerPoi !== null} animationType="slide" transparent onRequestClose={() => setViewerPoi(null)}>
        <View style={styles.viewerWrap}>
          {viewerPoi !== null && pois[viewerPoi] && (
            <>
              <PoiPhoto challengeId={challengeId} index={viewerPoi} style={styles.viewerImg} photoUrl={isMongo ? streetViewUrl(pois[viewerPoi].lat, pois[viewerPoi].lng) : undefined} />
              <View style={styles.viewerInfo}>
                <Text style={styles.viewerName}>{pois[viewerPoi].name}</Text>
                <Text style={styles.viewerKm}>{challenge.name} · {pois[viewerPoi].atKm} {t.km}</Text>
              </View>
              <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerPoi(null)}>
                <X size={26} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>

      {/* Street View de MA position virtuelle sur le parcours */}
      <Modal visible={showMyView} animationType="slide" transparent onRequestClose={() => setShowMyView(false)}>
        <View style={styles.viewerWrap}>
          <Image source={{ uri: streetViewUrl(mePoint.lat, mePoint.lng, 640, 640) }} style={styles.viewerImg} resizeMode="cover" />
          <View style={styles.viewerInfo}>
            <Text style={styles.viewerName}>📍 {t.youAreHere}</Text>
            <Text style={styles.viewerKm}>{challenge?.name} · {myCumulativeKm.toFixed(1)} {t.km}</Text>
          </View>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setShowMyView(false)}>
            <X size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 17, fontWeight: '700', textAlign: 'center', marginTop: 16, marginBottom: 20 },
  primaryBtn: { backgroundColor: PRIMARY, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  primaryBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  mapWrap: { width: '100%' },
  back: { position: 'absolute', top: 50, left: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },

  navBanner: { position: 'absolute', top: 50, left: 72, right: 16, backgroundColor: 'rgba(15,23,42,0.85)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBannerTxt: { color: '#fff', fontSize: 12, fontWeight: '600', flex: 1 },
  navCard: { position: 'absolute', bottom: 14, left: 14, right: 14, backgroundColor: '#fff', borderRadius: 16, flexDirection: 'row', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, elevation: 10 },
  navCardImg: { width: 120, height: 92 },
  navCardBody: { flex: 1, padding: 12, justifyContent: 'center' },
  navCardKicker: { fontSize: 11, fontWeight: '800', color: '#0ea5e9' },
  navCardName: { fontSize: 16, fontWeight: '900', color: '#111', marginTop: 2 },
  navCardView: { fontSize: 12, fontWeight: '700', color: PRIMARY, marginTop: 4 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, marginHorizontal: 16, marginTop: -20, borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  emoji: { fontSize: 40 },
  chName: { fontSize: 17, fontWeight: '800' },
  bigKm: { fontSize: 30, fontWeight: '900', letterSpacing: -1, marginTop: 2 },
  bigKmSub: { fontSize: 15, fontWeight: '700', letterSpacing: 0 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 10 },
  fill: { height: 10, borderRadius: 5, backgroundColor: PRIMARY },
  pctTxt: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  nextStopCard: { marginHorizontal: 16, marginTop: 10, borderRadius: 16, padding: 14 },
  nextStopKicker: { fontSize: 11.5, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  nextStopName: { fontSize: 16, fontWeight: '800', marginTop: 3 },
  nextStopMeta: { fontSize: 12.5, marginTop: 4, lineHeight: 18 },
  myViewBtn: { position: 'absolute', right: 12, bottom: 14, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  myViewTxt: { color: '#fff', fontSize: 11.5, fontWeight: '800' },

  joinBtn: { backgroundColor: PRIMARY, marginHorizontal: 16, marginTop: 16, paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  joinBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },

  actionRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 16 },
  navBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 14 },
  navBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  arBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 15, paddingHorizontal: 16, borderRadius: 14, borderWidth: 2 },
  arBtnWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 2, marginTop: 10 },
  arBtnTxt: { fontSize: 15, fontWeight: '800' },

  hint: { fontSize: 13, fontWeight: '500', marginHorizontal: 16, marginTop: 14, lineHeight: 18 },

  lbHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 22, marginBottom: 10 },
  lbTitle: { fontSize: 18, fontWeight: '800' },
  lbCount: { fontSize: 13, fontWeight: '600' },

  poiCard: { width: 200, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  poiImgWrap: { width: '100%', height: 112, backgroundColor: '#e5e7eb' },
  poiImg: { width: '100%', height: '100%' },
  poiLock: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,24,39,0.55)', alignItems: 'center', justifyContent: 'center' },
  poiLockTxt: { color: '#fff', fontSize: 12, fontWeight: '700', paddingHorizontal: 10, textAlign: 'center' },
  poiBadge: { position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: '#0ea5e9', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  poiBadgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  poiName: { fontSize: 14, fontWeight: '800' },
  poiKm: { fontSize: 12, fontWeight: '700', marginTop: 2 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, marginHorizontal: 16, marginBottom: 8, borderRadius: 16 },
  rank: { fontSize: 18, fontWeight: '800', width: 30, textAlign: 'center', color: '#888' },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowKm: { fontSize: 15, fontWeight: '800' },
  rowKmSub: { fontSize: 12, fontWeight: '600' },

  viewerWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '70%' },
  viewerInfo: { position: 'absolute', bottom: 60, left: 24, right: 24 },
  viewerName: { color: '#fff', fontSize: 24, fontWeight: '900' },
  viewerKm: { color: '#cbd5e1', fontSize: 14, fontWeight: '600', marginTop: 6 },
  viewerClose: { position: 'absolute', top: 54, right: 20, width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
});
