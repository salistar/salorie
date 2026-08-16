import BrandOverlay from '../../components/BrandOverlay';
import { a11y } from '../../lib/a11y';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, X, Navigation2, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useTranslation } from '../../lib/i18n';
import { getChallenge, Challenge, ChallengePOI } from '../../lib/races';
import { poiPhoto } from '../../assets/challenges/registry';
import { Dimensions } from 'react-native';
import Card from '../../components/ui/Card';
import { PrimaryButton, SecondaryButton } from '../../components/ui/Button';
import { spacing, type as typeTokens } from '../../constants/theme';

const PRIMARY = Colors.light.primary;
const { width: W, height: H } = Dimensions.get('window');
const FOV = 42; // half horizontal field of view (deg) a label is considered "in front"

const TXT: Record<string, any> = {
  en: {
    title: 'AR Explorer', perm: 'Camera access is needed for the AR view.', grant: 'Allow camera',
    locPerm: 'Enable location to point at landmarks.', away: 'away', turnLeft: 'Turn left',
    turnRight: 'Turn right', point: 'Point your phone around to find the landmarks',
    noLoc: 'Getting your position…', km: 'km',
  },
  fr: {
    title: 'Explorateur AR', perm: 'L’accès caméra est nécessaire pour la vue AR.', grant: 'Autoriser la caméra',
    locPerm: 'Active la localisation pour viser les lieux.', away: 'de distance', turnLeft: 'Tourne à gauche',
    turnRight: 'Tourne à droite', point: 'Balaie autour de toi pour trouver les lieux',
    noLoc: 'Localisation en cours…', km: 'km',
  },
  ar: {
    title: 'مستكشف AR', perm: 'يلزم إذن الكاميرا لعرض الواقع المعزّز.', grant: 'السماح بالكاميرا',
    locPerm: 'فعّل الموقع لتوجيه نحو المعالم.', away: 'المسافة', turnLeft: 'انعطف يسارًا',
    turnRight: 'انعطف يمينًا', point: 'حرّك هاتفك حولك للعثور على المعالم',
    noLoc: 'جارٍ تحديد موقعك…', km: 'كم',
  },
};

type LatLng = { lat: number; lng: number };

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearingTo(a: LatLng, b: LatLng): number {
  const y = Math.sin(((b.lng - a.lng) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  const x =
    Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
    Math.sin((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.cos(((b.lng - a.lng) * Math.PI) / 180);
  return (Math.atan2(y, x) * 180) / Math.PI;
}
function norm180(d: number): number {
  let x = ((d + 180) % 360 + 360) % 360 - 180;
  return x;
}
function fmtDist(km: number, kmLabel: string): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 1000) return `${km.toFixed(1)} ${kmLabel}`;
  return `${Math.round(km).toLocaleString()} ${kmLabel}`;
}

function ArThumb({ challengeId, index }: { challengeId: string; index: number }) {
  const src = poiPhoto(challengeId, index);
  if (!src) return <View style={[styles.thumb, { backgroundColor: '#334155' }]} />;
  return <Image source={src} style={styles.thumb} />;
}

export default function ChallengeARScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const challenge: Challenge | undefined = getChallenge(String(id || ''));
  const { language } = useTranslation() as any;
  const t = TXT[language] || TXT.en;

  const [permission, requestPermission] = useCameraPermissions();
  const [heading, setHeading] = useState(0);
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [locDenied, setLocDenied] = useState(false);
  const lastHaptic = useRef<Record<number, number>>({});

  const pois: ChallengePOI[] = (challenge?.pois as ChallengePOI[]) || [];

  // Compass heading (device-magnetic). watchHeadingAsync is smoother than raw magnetometer.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setLocDenied(true); return; }
        const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLoc({ lat: cur.coords.latitude, lng: cur.coords.longitude });
        sub = await Location.watchHeadingAsync((h) => {
          const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          setHeading(deg);
        });
      } catch {
        setLocDenied(true);
      }
    })();
    return () => { sub && sub.remove(); };
  }, []);

  if (!challenge) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: '#000' }]}>
        <Text style={{ color: '#fff' }}>—</Text>
      </View>
    );
  }

  // Camera permission gate
  if (!permission) {
    return <View style={[styles.fill, { backgroundColor: '#000' }]} />;
  }
  if (!permission.granted) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: '#000', padding: spacing.xl }]}>
        <Card variant="flat" style={styles.permCard}>
          <Navigation2 size={48} color={PRIMARY} />
          <Text style={styles.permTitle}>{t.title}</Text>
          <Text style={styles.permTxt}>{t.perm}</Text>
          <PrimaryButton title={t.grant} onPress={requestPermission} style={styles.permAction} />
          <SecondaryButton title={t.title} onPress={() => router.back()} style={styles.permAction} />
        </Card>
      </View>
    );
  }

  // Compute on-screen placement for each landmark from heading + bearing.
  const items = pois.map((p, i) => {
    if (!loc) return { p, i, visible: false, x: 0, dist: 0, angle: 0 };
    const dist = haversineKm(loc, { lat: p.lat, lng: p.lng });
    const brg = bearingTo(loc, { lat: p.lat, lng: p.lng });
    const angle = norm180(brg - heading); // -180..180, 0 = straight ahead
    const visible = Math.abs(angle) <= FOV;
    const x = W / 2 + (angle / FOV) * (W / 2 - 70);
    return { p, i, visible, x, dist, angle };
  });

  // nearest landmark for the bottom hint / off-screen arrow
  const sorted = [...items].sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle));
  const nearest = sorted[0];

  // gentle haptic when a landmark enters the crosshair
  items.forEach((it) => {
    if (it.visible && Math.abs(it.angle) < 6) {
      const now = Date.now();
      if (!lastHaptic.current[it.i] || now - lastHaptic.current[it.i] > 2500) {
        lastHaptic.current[it.i] = now;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    }
  });

  const compassLetter = (() => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(heading / 45) % 8];
  })();

  return (
    <View style={styles.fill}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />

      {/* dim overlay for legibility */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.08)' }]} pointerEvents="none" />
      <BrandOverlay />

      {/* center reticle */}
      <View style={styles.reticle} pointerEvents="none">
        <View style={styles.reticleRing} />
        <View style={styles.reticleDot} />
      </View>

      {/* floating landmark labels */}
      {loc && items.filter((it) => it.visible).map((it) => {
        const top = 150 + (it.i % 3) * 96 + (it.dist > 1000 ? 0 : 30);
        return (
          <View key={it.i} style={[styles.tag, { left: Math.max(8, Math.min(W - 188, it.x - 90)), top }]} pointerEvents="none">
            <View style={styles.tagInner}>
              <ArThumb challengeId={String(id || '')} index={it.i} />
              <View style={{ flex: 1, paddingHorizontal: 8 }}>
                <Text style={styles.tagName} numberOfLines={1}>{it.p.name}</Text>
                <Text style={styles.tagDist}>↗ {fmtDist(it.dist, t.km)}</Text>
              </View>
            </View>
            <View style={styles.tagStem} />
          </View>
        );
      })}

      {/* off-screen arrow toward nearest landmark */}
      {loc && nearest && !nearest.visible && (
        <View style={[styles.offArrow, nearest.angle < 0 ? { left: 16 } : { right: 16 }]} pointerEvents="none">
          {nearest.angle < 0 ? <ChevronLeft size={30} color="#fff" /> : <ChevronRight size={30} color="#fff" />}
          <Text style={styles.offArrowTxt} numberOfLines={1}>{nearest.p.name}</Text>
          <Text style={styles.offArrowSub}>{nearest.angle < 0 ? t.turnLeft : t.turnRight}</Text>
        </View>
      )}

      {/* top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retour')} style={styles.iconBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.titlePill}>
          <Text style={styles.titleTxt}>{challenge.emoji} {challenge.name}</Text>
        </View>
        <View style={styles.compass}>
          <Text style={styles.compassDeg}>{Math.round(heading)}°</Text>
          <Text style={styles.compassDir}>{compassLetter}</Text>
        </View>
      </View>

      {/* bottom hint */}
      <View style={styles.bottomHint}>
        <Text style={styles.bottomHintTxt}>
          {!loc ? (locDenied ? t.locPerm : t.noLoc) : t.point}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  permCard: { alignItems: 'center', alignSelf: 'stretch', paddingVertical: spacing.xl, paddingHorizontal: spacing.xl, gap: spacing.md, backgroundColor: 'rgba(15,23,42,0.72)' },
  permTitle: { ...(typeTokens.h2 as any), color: '#fff', textAlign: 'center', marginTop: spacing.sm },
  permTxt: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', lineHeight: 22 },
  permAction: { marginTop: spacing.sm },

  reticle: { position: 'absolute', left: W / 2 - 26, top: H / 2 - 26, width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  reticleRing: { position: 'absolute', width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  reticleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },

  tag: { position: 'absolute', width: 180, alignItems: 'center' },
  tagInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.88)', borderRadius: 14, padding: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' },
  tagStem: { width: 2, height: 18, backgroundColor: 'rgba(255,255,255,0.6)' },
  thumb: { width: 42, height: 42, borderRadius: 9, backgroundColor: '#334155' },
  tagName: { color: '#fff', fontSize: 13, fontWeight: '800' },
  tagDist: { color: '#7dd3fc', fontSize: 11, fontWeight: '700', marginTop: 1 },

  offArrow: { position: 'absolute', top: H / 2 - 40, alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.8)', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10, maxWidth: 130 },
  offArrowTxt: { color: '#fff', fontSize: 12, fontWeight: '800', marginTop: 2 },
  offArrowSub: { color: '#7dd3fc', fontSize: 10, fontWeight: '700' },

  topBar: { position: 'absolute', top: 50, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  titlePill: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  titleTxt: { color: '#fff', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  compass: { width: 56, height: 44, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  compassDeg: { color: '#fff', fontSize: 13, fontWeight: '900' },
  compassDir: { color: '#7dd3fc', fontSize: 10, fontWeight: '800' },

  bottomHint: { position: 'absolute', bottom: 40, left: 24, right: 24, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16 },
  bottomHintTxt: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
