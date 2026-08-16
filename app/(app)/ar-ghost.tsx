// app/(app)/ar-ghost.tsx
// ─────────────────────────────────────────────────────────────────────────────
// MODE FANTÔME AR ("AR Ghost Route")
//
// Un coureur fantôme virtuel court à une allure cible constante, superposé au flux
// CAMÉRA. AR par CAPTEURS/GPS (pas de SLAM/3D natif) : on réutilise EXACTEMENT la
// technique de challenge-ar.tsx — CameraView (expo-camera) en absoluteFill,
// watchHeadingAsync (boussole) pour le cap de l'appareil, watchPositionAsync pour
// la distance réelle. Le placement à l'écran : angle = norm180(bearing - heading),
// visible si |angle| <= FOV, x = W/2 + (angle/FOV)*(W/2 - marge).
//
// Toute la trigo/maths du fantôme vit dans lib/ghostRoute.ts (pur, testable).
// Les points GPS aberrants sont filtrés via lib/antiCheat.ts (isPlausibleMove),
// comme run.tsx. En fin de course on crédite creditKm + publishActivity.
// ─────────────────────────────────────────────────────────────────────────────
import BrandOverlay from '../../components/BrandOverlay';
import { a11y } from '../../lib/a11y';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Ghost, ChevronLeft, ChevronRight, Play, RotateCcw } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useTranslation } from '../../lib/i18n';
import { txtAlign, flipForRTL } from '../../lib/rtl';
import { isPlausibleMove } from '../../lib/antiCheat';
import { creditKm } from '../../lib/progressHooks';
import { publishActivity } from '../../lib/socialFeed';
import {
  ghostDistanceM,
  gapM,
  ghostScreenAngle,
  ghostSize,
  bearingDeg,
} from '../../lib/ghostRoute';

const PRIMARY = Colors.light.primary;
const { width: W, height: H } = Dimensions.get('window');
const FOV = 42; // demi-champ horizontal (deg) où le fantôme est "devant" — comme challenge-ar
const LAST_PACE_KEY = 'ghost_last_pace_sec'; // s/km du dernier run fantôme (preset "mon dernier run")

type LatLng = { lat: number; lng: number };

// Presets d'allure (secondes / km).
const PACE_PRESETS = [
  { sec: 420, label: "7:00" },
  { sec: 390, label: "6:30" },
  { sec: 360, label: "6:00" },
  { sec: 330, label: "5:30" },
];
const DIST_PRESETS = [1000, 2000, 5000]; // mètres

const TXT: Record<string, any> = {
  en: {
    title: 'AR Ghost Run', perm: 'Camera access is needed for the AR ghost.', grant: 'Allow camera',
    locPerm: 'Enable location to chase the ghost.', back: 'Back',
    setup: 'Set up your ghost', pace: 'Ghost pace', dist: 'Target distance',
    lastRun: 'My last run', launch: 'Launch chase', perKm: '/km', km: 'km',
    chasing: 'Chase the ghost!', getLoc: 'Getting your position…',
    ahead: (m: number) => `The ghost leads by ${m} m — speed up!`,
    behind: (m: number) => `You lead by ${m} m 🔥`,
    neck: 'Neck and neck!',
    turnLeft: 'Turn left to the ghost', turnRight: 'Turn right to the ghost',
    finishTitle: 'Finish!', youWin: (s: number) => `You beat the ghost by ${s}s 🏆`,
    youLose: (s: number) => `The ghost wins by ${s}s`, tie: 'A perfect tie!',
    yourTime: 'Your time', ghostTime: 'Ghost time', again: 'Run again', done: 'Done',
    distLabel: 'Distance', timeLabel: 'Time',
  },
  fr: {
    title: 'Course Fantôme AR', perm: 'L’accès caméra est nécessaire pour le fantôme AR.', grant: 'Autoriser la caméra',
    locPerm: 'Active la localisation pour chasser le fantôme.', back: 'Retour',
    setup: 'Configure ton fantôme', pace: 'Allure du fantôme', dist: 'Distance cible',
    lastRun: 'Mon dernier run', launch: 'Lancer la chasse', perKm: '/km', km: 'km',
    chasing: 'Chasse le fantôme !', getLoc: 'Localisation en cours…',
    ahead: (m: number) => `Le fantôme te devance de ${m} m — accélère !`,
    behind: (m: number) => `Tu mènes de ${m} m 🔥`,
    neck: 'Coude à coude !',
    turnLeft: 'Tourne à gauche vers le fantôme', turnRight: 'Tourne à droite vers le fantôme',
    finishTitle: 'Arrivée !', youWin: (s: number) => `Tu as battu le fantôme de ${s}s 🏆`,
    youLose: (s: number) => `Le fantôme gagne de ${s}s`, tie: 'Égalité parfaite !',
    yourTime: 'Ton temps', ghostTime: 'Temps fantôme', again: 'Recourir', done: 'Terminé',
    distLabel: 'Distance', timeLabel: 'Temps',
  },
  ar: {
    title: 'سباق الشبح AR', perm: 'يلزم إذن الكاميرا لعرض الشبح المعزّز.', grant: 'السماح بالكاميرا',
    locPerm: 'فعّل الموقع لمطاردة الشبح.', back: 'رجوع',
    setup: 'اضبط شبحك', pace: 'إيقاع الشبح', dist: 'المسافة المستهدفة',
    lastRun: 'جريي الأخير', launch: 'ابدأ المطاردة', perKm: '/كم', km: 'كم',
    chasing: 'طارد الشبح!', getLoc: 'جارٍ تحديد موقعك…',
    ahead: (m: number) => `الشبح يتقدّمك بـ ${m} م — أسرع!`,
    behind: (m: number) => `أنت متقدّم بـ ${m} م 🔥`,
    neck: 'كتفًا بكتف!',
    turnLeft: 'انعطف يسارًا نحو الشبح', turnRight: 'انعطف يمينًا نحو الشبح',
    finishTitle: 'النهاية!', youWin: (s: number) => `هزمت الشبح بـ ${s} ثانية 🏆`,
    youLose: (s: number) => `فاز الشبح بـ ${s} ثانية`, tie: 'تعادل تام!',
    yourTime: 'وقتك', ghostTime: 'وقت الشبح', again: 'اجرِ مجددًا', done: 'تم',
    distLabel: 'المسافة', timeLabel: 'الوقت',
  },
};

function mmss(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function ARGhostScreen() {
  const { user } = useUser();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;

  const [permission, requestPermission] = useCameraPermissions();
  const [locDenied, setLocDenied] = useState(false);

  // phase: setup → running → result
  const [phase, setPhase] = useState<'setup' | 'running' | 'result'>('setup');
  const [paceSec, setPaceSec] = useState(360); // 6:00/km par défaut
  const [lastPace, setLastPace] = useState<number | null>(null);
  const [targetM, setTargetM] = useState(1000);

  // live state
  const [heading, setHeading] = useState(0);
  const [travelBearing, setTravelBearing] = useState(0);
  const [userDistM, setUserDistM] = useState(0);
  const [secs, setSecs] = useState(0);
  const [hasLoc, setHasLoc] = useState(false);
  const [result, setResult] = useState<{ userSecs: number; ghostSecs: number } | null>(null);

  const headSub = useRef<Location.LocationSubscription | null>(null);
  const posSub = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<any>(null);
  const lastPt = useRef<LatLng | null>(null);
  const lastTs = useRef<number | null>(null); // anti-triche : horodatage du dernier point retenu
  const lastGapSign = useRef<number>(1); // pour l'haptique au franchissement gap=0
  const finishedRef = useRef(false);
  const aliveRef = useRef(true); // false dès le démontage : annule les abonnements résolus en retard

  // Charge l'allure du dernier run fantôme (preset "mon dernier run" si dispo).
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LAST_PACE_KEY);
        const v = raw ? parseInt(raw, 10) : NaN;
        if (Number.isFinite(v) && v > 0) setLastPace(v);
      } catch {}
    })();
  }, []);

  // Boussole (cap appareil) — actif dès l'écran setup pour viser, et pendant la course.
  useEffect(() => {
    let mounted = true;
    let local: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { if (mounted) setLocDenied(true); return; }
        local = await Location.watchHeadingAsync((h) => {
          const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          setHeading(deg);
        });
        if (!mounted) { local.remove(); return; } // démonté pendant l'await → on retire tout de suite
        headSub.current = local;
      } catch {
        if (mounted) setLocDenied(true);
      }
    })();
    return () => { mounted = false; local?.remove(); };
  }, []);

  // Nettoyage global au démontage : marque l'écran mort (annule les abonnements résolus en retard).
  useEffect(() => () => {
    aliveRef.current = false;
    posSub.current?.remove();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startChase = async () => {
    // Idempotent : coupe tout abonnement/timer préexistant avant de (re)lancer (cf. run.tsx).
    posSub.current?.remove(); posSub.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setPhase('running');
    setUserDistM(0); setSecs(0); setResult(null);
    lastPt.current = null; lastTs.current = null; lastGapSign.current = 1; finishedRef.current = false;
    setHasLoc(false);

    timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
    try {
      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      lastPt.current = { lat: cur.coords.latitude, lng: cur.coords.longitude };
      lastTs.current = cur.timestamp || Date.now();
      setHasLoc(true);
    } catch { /* watch fournira la position */ }

    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 2000 },
      (loc) => {
        const pt = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        const ts = loc.timestamp || Date.now();
        setHasLoc(true);
        if (lastPt.current && lastTs.current != null) {
          // Anti-triche : on rejette les points GPS aberrants (téléport/Δt nul)
          // AVANT de cumuler la distance — même filtre que run.tsx.
          const plausible = isPlausibleMove(
            lastPt.current.lat, lastPt.current.lng, lastTs.current,
            pt.lat, pt.lng, ts, 'run',
          );
          if (!plausible) return;
          const seg = hav(lastPt.current, pt);
          if (seg < 80 && seg > 0.5) {
            setUserDistM((m) => m + seg);
            // Cap de course = des 2 derniers points retenus ; garde le dernier si immobile.
            setTravelBearing(bearingDeg(lastPt.current!, pt));
          }
        }
        lastPt.current = pt;
        lastTs.current = ts;
      }
    );
    // Si l'écran a été démonté pendant l'await ci-dessus, on retire immédiatement
    // l'abonnement résolu en retard (sinon watcher GPS orphelin = batterie + setState fantôme).
    if (!aliveRef.current) { sub.remove(); return; }
    posSub.current = sub;
  };

  const stopSubs = () => {
    posSub.current?.remove(); posSub.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // Fin de course quand on atteint la cible : fige le résultat, crédite, publie.
  const finishRun = (finalUserSecs: number) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    stopSubs();
    const ghostSecs = paceSec * (targetM / 1000); // temps qu'aurait mis le fantôme sur la cible
    setResult({ userSecs: Math.round(finalUserSecs), ghostSecs: Math.round(ghostSecs) });
    setPhase('result');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    const km = targetM / 1000;
    AsyncStorage.setItem(LAST_PACE_KEY, String(paceSec)).catch(() => {});
    creditKm(km).catch(() => {});
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (email) publishActivity(email, { type: 'run_completed', km }).catch(() => {});
  };

  // Surveille l'atteinte de la cible.
  useEffect(() => {
    if (phase === 'running' && userDistM >= targetM && targetM > 0) {
      finishRun(secs);
    }
  }, [userDistM, phase, targetM, secs]);

  // ── Camera permission gate (comme challenge-ar) ──
  if (!permission) {
    return <View style={[styles.fill, { backgroundColor: '#000' }]} />;
  }
  if (!permission.granted) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: '#000', padding: 32 }]}>
        <Ghost size={48} color={PRIMARY} />
        <Text style={styles.permTxt}>{t.perm}</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnTxt}>{t.grant}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 18 }} onPress={() => router.back()}>
          <Text style={{ color: '#9ca3af', fontWeight: '700' }}>← {t.back}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── SETUP : choix allure + distance avant départ ──
  if (phase === 'setup') {
    return (
      <View style={[styles.fill, { backgroundColor: '#0b1220' }]}>
        <BrandOverlay />
        <View style={styles.setupTop}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retour')} style={styles.iconBtn} onPress={() => router.back()}>
            <ArrowLeft size={22} color="#fff" style={flipForRTL(isRTL)} />
          </TouchableOpacity>
          <Text style={styles.setupTitle}>{t.title}</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.setupBody}>
          <View style={styles.ghostHero}>
            <View style={styles.ghostGlow}>
              <Text style={styles.ghostEmoji}>👻</Text>
            </View>
            <Text style={[styles.setupHeading, { textAlign: 'center' }]}>{t.setup}</Text>
          </View>

          {/* Allure */}
          <Text style={[styles.sectionLabel, { textAlign: txtAlign(isRTL) }]}>{t.pace}</Text>
          <View style={styles.chipRow}>
            {lastPace != null && (
              <TouchableOpacity
                style={[styles.chip, paceSec === lastPace && styles.chipActive]}
                onPress={() => setPaceSec(lastPace)}
              >
                <RotateCcw size={13} color={paceSec === lastPace ? '#fff' : '#cbd5e1'} />
                <Text style={[styles.chipTxt, paceSec === lastPace && styles.chipTxtActive]}>{t.lastRun}</Text>
              </TouchableOpacity>
            )}
            {PACE_PRESETS.map((p) => (
              <TouchableOpacity
                key={p.sec}
                style={[styles.chip, paceSec === p.sec && styles.chipActive]}
                onPress={() => setPaceSec(p.sec)}
              >
                <Text style={[styles.chipTxt, paceSec === p.sec && styles.chipTxtActive]}>{p.label}{t.perKm}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Distance */}
          <Text style={[styles.sectionLabel, { textAlign: txtAlign(isRTL), marginTop: 22 }]}>{t.dist}</Text>
          <View style={styles.chipRow}>
            {DIST_PRESETS.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.chip, targetM === d && styles.chipActive]}
                onPress={() => setTargetM(d)}
              >
                <Text style={[styles.chipTxt, targetM === d && styles.chipTxtActive]}>{d / 1000} {t.km}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.launchBtn} onPress={startChase}>
            <Play size={22} color="#fff" fill="#fff" />
            <Text style={styles.launchTxt}>{t.launch}</Text>
          </TouchableOpacity>
          {locDenied && <Text style={styles.locWarn}>{t.locPerm}</Text>}
        </View>
      </View>
    );
  }

  // ── RESULT ──
  if (phase === 'result' && result) {
    const diff = result.ghostSecs - result.userSecs; // >0 : user plus rapide → gagne
    const won = diff > 0;
    const tie = diff === 0;
    return (
      <View style={[styles.fill, { backgroundColor: '#0b1220' }]}>
        <BrandOverlay />
        <View style={styles.resultBody}>
          <View style={[styles.ghostGlow, won && { backgroundColor: 'rgba(46,139,87,0.25)', borderColor: PRIMARY }]}>
            <Text style={styles.ghostEmoji}>{won ? '🏆' : '👻'}</Text>
          </View>
          <Text style={styles.resultTitle}>{t.finishTitle}</Text>
          <Text style={[styles.resultVerdict, { color: won ? PRIMARY : '#f87171' }]}>
            {tie ? t.tie : won ? t.youWin(Math.abs(diff)) : t.youLose(Math.abs(diff))}
          </Text>
          <View style={styles.resultRow}>
            <View style={styles.resultCell}>
              <Text style={styles.resultCellLabel}>{t.yourTime}</Text>
              <Text style={styles.resultCellVal}>{mmss(result.userSecs)}</Text>
            </View>
            <View style={styles.resultCell}>
              <Text style={styles.resultCellLabel}>{t.ghostTime}</Text>
              <Text style={styles.resultCellVal}>{mmss(result.ghostSecs)}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.launchBtn} onPress={() => setPhase('setup')}>
            <RotateCcw size={20} color="#fff" />
            <Text style={styles.launchTxt}>{t.again}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 16 }} onPress={() => router.back()}>
            <Text style={{ color: '#9ca3af', fontWeight: '800', fontSize: 15 }}>{t.done}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── RUNNING (AR overlay) ──
  const ghostDistM = ghostDistanceM(paceSec, secs);
  const gap = gapM(ghostDistM, userDistM);
  const angle = ghostScreenAngle(travelBearing, heading, gap);
  const inView = Math.abs(angle) <= FOV;
  const ghostX = W / 2 + (angle / FOV) * (W / 2 - 60);
  const size = ghostSize(Math.abs(gap));
  const ghostTop = H / 2 - size / 2 + (gap < 0 ? 24 : -8); // derrière = un poil plus bas

  // Haptique au franchissement gap=0 (on passe devant / derrière).
  const sign = gap >= 0 ? 1 : -1;
  if (sign !== lastGapSign.current) {
    lastGapSign.current = sign;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  const absGap = Math.round(Math.abs(gap));
  const hud = gap > 2 ? t.ahead(absGap) : gap < -2 ? t.behind(absGap) : t.neck;
  const progress = Math.min(1, userDistM / targetM);

  return (
    <View style={styles.fill}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.10)' }]} pointerEvents="none" />
      <BrandOverlay />

      {/* réticule central */}
      <View style={styles.reticle} pointerEvents="none">
        <View style={styles.reticleRing} />
        <View style={styles.reticleDot} />
      </View>

      {/* SPRITE FANTÔME (visible si dans le champ) */}
      {hasLoc && inView && (
        <View
          style={[
            styles.ghostSprite,
            {
              left: Math.max(8, Math.min(W - size - 8, ghostX - size / 2)),
              top: ghostTop,
              width: size,
              height: size,
              borderRadius: size / 2,
            },
          ]}
          pointerEvents="none"
        >
          <Text style={{ fontSize: size * 0.46, opacity: 0.7 }}>🏃</Text>
        </View>
      )}

      {/* flèche "tourne vers le fantôme" si hors champ */}
      {hasLoc && !inView && (
        <View style={[styles.offArrow, angle < 0 ? { left: 16 } : { right: 16 }]} pointerEvents="none">
          {angle < 0 ? <ChevronLeft size={32} color="#fff" /> : <ChevronRight size={32} color="#fff" />}
          <Text style={styles.offArrowTxt} numberOfLines={2}>
            {angle < 0 ? t.turnLeft : t.turnRight}
          </Text>
        </View>
      )}

      {/* top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retour')} style={styles.iconBtn} onPress={() => { stopSubs(); router.back(); }}>
          <ArrowLeft size={22} color="#fff" style={flipForRTL(isRTL)} />
        </TouchableOpacity>
        <View style={styles.titlePill}>
          <Text style={styles.titleTxt}>👻 {mmss(secs)}</Text>
        </View>
        <View style={styles.compass}>
          <Text style={styles.compassDeg}>{(userDistM / 1000).toFixed(2)}</Text>
          <Text style={styles.compassDir}>{t.km}</Text>
        </View>
      </View>

      {/* HUD écart + barre de progression */}
      <View style={styles.hud}>
        <Text style={[styles.hudTxt, { textAlign: 'center', writingDirection: isRTL ? 'rtl' : 'ltr' }]}>
          {!hasLoc ? (locDenied ? t.locPerm : t.getLoc) : hud}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressLabel}>
          {(userDistM / 1000).toFixed(2)} / {(targetM / 1000).toFixed(targetM % 1000 === 0 ? 0 : 1)} {t.km}
        </Text>
      </View>
    </View>
  );
}

// Distance haversine locale (mètres) — même formule que run.tsx, évite un import croisé.
function hav(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  permTxt: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 18, marginBottom: 22, lineHeight: 22 },
  permBtn: { backgroundColor: PRIMARY, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  permBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // setup
  setupTop: { position: 'absolute', top: 50, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  setupTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  setupBody: { flex: 1, paddingHorizontal: 24, paddingTop: 120, paddingBottom: 40, justifyContent: 'center' },
  ghostHero: { alignItems: 'center', marginBottom: 30 },
  ghostGlow: { width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(125,211,252,0.16)', borderWidth: 2, borderColor: 'rgba(125,211,252,0.5)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  ghostEmoji: { fontSize: 56 },
  setupHeading: { color: '#fff', fontSize: 22, fontWeight: '900' },
  sectionLabel: { color: '#94a3b8', fontSize: 13, fontWeight: '800', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e293b', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16, borderWidth: 1.5, borderColor: 'transparent' },
  chipActive: { backgroundColor: PRIMARY, borderColor: '#7dd3fc' },
  chipTxt: { color: '#cbd5e1', fontSize: 15, fontWeight: '800' },
  chipTxtActive: { color: '#fff' },
  launchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: PRIMARY, paddingVertical: 17, borderRadius: 16, marginTop: 34 },
  launchTxt: { color: '#fff', fontSize: 17, fontWeight: '900' },
  locWarn: { color: '#fbbf24', fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 14 },

  // reticle
  reticle: { position: 'absolute', left: W / 2 - 26, top: H / 2 - 26, width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  reticleRing: { position: 'absolute', width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)' },
  reticleDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },

  // ghost sprite
  ghostSprite: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(125,211,252,0.22)', borderWidth: 2, borderColor: 'rgba(125,211,252,0.7)', shadowColor: '#7dd3fc', shadowOpacity: 0.8, shadowRadius: 16, elevation: 8 },

  // off-screen arrow
  offArrow: { position: 'absolute', top: H / 2 - 44, alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.82)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, maxWidth: 140 },
  offArrowTxt: { color: '#7dd3fc', fontSize: 12, fontWeight: '800', textAlign: 'center', marginTop: 4 },

  // top bar
  topBar: { position: 'absolute', top: 50, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  titlePill: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  titleTxt: { color: '#fff', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  compass: { minWidth: 56, height: 44, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  compassDeg: { color: '#fff', fontSize: 13, fontWeight: '900' },
  compassDir: { color: '#7dd3fc', fontSize: 10, fontWeight: '800' },

  // HUD bottom
  hud: { position: 'absolute', bottom: 40, left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18 },
  hudTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)', marginTop: 12, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: PRIMARY },
  progressLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 7 },

  // result
  resultBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  resultTitle: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 18 },
  resultVerdict: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 12, lineHeight: 25 },
  resultRow: { flexDirection: 'row', gap: 16, marginTop: 30 },
  resultCell: { backgroundColor: '#1e293b', borderRadius: 16, paddingVertical: 18, paddingHorizontal: 28, alignItems: 'center', minWidth: 120 },
  resultCellLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '800', marginBottom: 6 },
  resultCellVal: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -1 },
});
