import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useUser } from '@clerk/clerk-expo';
import { Trophy, MapPin, ChevronLeft, Plus } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import Medal from '../../components/Medal';
import { getActiveRaces, joinRace, raceProgress, finishRace } from '../../lib/racesApi';

const GREEN = '#2E8B57';

// Carte Leaflet (keyless) des waypoints dans une WebView.
function mapHtml(wps: any[]): string {
  const pts = wps.filter((w) => isFinite(w.lat) && isFinite(w.lng));
  const markers = pts.map((w) => {
    const color = w.kind === 'start' ? '#2E8B57' : w.kind === 'end' ? '#e11d48' : '#2563eb';
    return `L.circleMarker([${w.lat},${w.lng}],{radius:8,color:'${color}',fillColor:'${color}',fillOpacity:.9}).bindTooltip(${JSON.stringify(`${w.name || w.kind} · ${w.atKm || 0} km`)}).addTo(g);`;
  }).join('');
  const line = pts.length >= 2 ? `L.polyline([${pts.map((w) => `[${w.lat},${w.lng}]`).join(',')}],{color:'#2E8B57',weight:3,dashArray:'6 6'}).addTo(g);` : '';
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><style>html,body,#m{height:100%;margin:0}</style></head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
var map=L.map('m',{attributionControl:false}).setView([31.79,-7.09],5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18}).addTo(map);
var g=L.layerGroup().addTo(map);${markers}${line}
var p=[${pts.map((w) => `[${w.lat},${w.lng}]`).join(',')}];if(p.length)map.fitBounds(p.length>1?p:[p[0],p[0]],{padding:[30,30],maxZoom:9});
</script></body></html>`;
}

export default function VirtualRaces() {
  const { user } = useUser();
  const uname = user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || 'Coureur';
  const [loading, setLoading] = useState(true);
  const [races, setRaces] = useState<any[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [part, setPart] = useState<any | null>(null); // ma participation
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try { setRaces(await getActiveRaces()); }
    catch { setErr('Serveur injoignable.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = async (race: any) => {
    setSel(race); setPart(null);
    try { setPart(await joinRace(race._id, uname)); } catch {}
  };
  const advance = async (km: number) => {
    if (!sel || busy) return;
    setBusy(true);
    try {
      const cur = part?.cumulativeKm || 0;
      const next = Math.min(cur + km, sel.totalKm);
      let p = await raceProgress(sel._id, next);
      if (next >= sel.totalKm && !p.finishedAt) p = await finishRace(sel._id);
      setPart(p);
    } catch {} finally { setBusy(false); }
  };

  if (sel) {
    const cum = part?.cumulativeKm || 0;
    const pct = Math.min(100, Math.round((cum / sel.totalKm) * 100));
    const done = !!part?.finishedAt;
    return (
      <SafeAreaView style={s.safe}>
        <ScreenTopBar />
        <ScrollView contentContainerStyle={s.body}>
          <TouchableOpacity style={s.back} onPress={() => { setSel(null); load(); }}><ChevronLeft size={18} color={GREEN} /><Text style={s.backTxt}>Toutes les courses</Text></TouchableOpacity>
          <Text style={s.title}>{sel.emoji || '🏃'} {sel.name}</Text>
          <Text style={s.sub}>{sel.totalKm} km · {sel.waypoints?.length || 0} points</Text>

          <View style={s.mapBox}><WebView source={{ html: mapHtml(sel.waypoints || []) }} style={{ flex: 1 }} /></View>

          {done ? (
            <View style={{ alignItems: 'center', marginTop: 10 }}>
              <Text style={s.win}>🎉 Course terminée — médaille gagnée !</Text>
              <Medal width={200} frame={sel.medalFrame} title={sel.name} km={sel.totalKm} rank={part.rank} name={uname}
                dates={sel.startDate ? '' : ''} />
              <Text style={s.rank}>Classement : {part.rank}ᵉ</Text>
            </View>
          ) : (
            <>
              <View style={s.progRow}><Text style={s.progTxt}>{cum} / {sel.totalKm} km</Text><Text style={s.progPct}>{pct}%</Text></View>
              <View style={s.bar}><View style={[s.barFill, { width: `${pct}%` }]} /></View>
              <Text style={s.hint}>Avance ta distance (tes courses GPS l'alimenteront automatiquement bientôt) :</Text>
              <View style={s.btns}>
                {[5, 25, 100].map((k) => (
                  <TouchableOpacity key={k} style={s.advBtn} onPress={() => advance(k)} disabled={busy}><Plus size={14} color="#fff" /><Text style={s.advTxt}>{k} km</Text></TouchableOpacity>
                ))}
              </View>
              {busy && <ActivityIndicator color={GREEN} style={{ marginTop: 10 }} />}
            </>
          )}

          <Text style={s.section}>Étapes</Text>
          {(sel.waypoints || []).map((w: any, i: number) => (
            <View key={i} style={s.wp}>
              <MapPin size={15} color={w.kind === 'start' ? GREEN : w.kind === 'end' ? '#e11d48' : '#2563eb'} />
              <Text style={s.wpName}>{w.name || w.kind}</Text>
              <Text style={s.wpKm}>{w.atKm || 0} km</Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScreenTopBar />
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.head}><Trophy size={26} color={GREEN} /><Text style={s.title}>Courses virtuelles</Text></View>
        <Text style={s.sub}>Parcours géolocalisés avec étapes. Termine-les pour gagner des médailles avec classement.</Text>
        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} />
          : err ? <Text style={s.err}>{err}</Text>
          : races.length ? races.map((r) => (
            <TouchableOpacity key={r._id} style={s.card} onPress={() => open(r)}>
              <Text style={s.cardEmoji}>{r.emoji || '🏃'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.cardName}>{r.name}</Text>
                <Text style={s.cardMeta}>{r.totalKm} km · {r.waypoints?.length || 0} points · cadre {r.medalFrame}</Text>
              </View>
              <ChevronLeft size={20} color="#cbd5e1" style={{ transform: [{ rotate: '180deg' }] }} />
            </TouchableOpacity>
          )) : <Text style={s.hint}>Aucune course active. L'admin en crée depuis le back-office.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f6f4' },
  body: { padding: 18, paddingBottom: 90 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 24, fontWeight: '800', color: '#1B2A33', marginTop: 6 },
  sub: { fontSize: 13, color: '#667085', marginTop: 4 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  backTxt: { color: GREEN, fontWeight: '700', fontSize: 13 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#e6ece8' },
  cardEmoji: { fontSize: 26 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#1B2A33' },
  cardMeta: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  mapBox: { height: 200, borderRadius: 14, overflow: 'hidden', marginTop: 12, borderWidth: 1, borderColor: '#e6ece8' },
  progRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  progTxt: { fontWeight: '700', color: '#1B2A33' }, progPct: { fontWeight: '800', color: GREEN },
  bar: { height: 12, backgroundColor: '#e6ece8', borderRadius: 6, marginTop: 6, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: GREEN, borderRadius: 6 },
  hint: { fontSize: 12, color: '#94a3b8', marginTop: 12 },
  btns: { flexDirection: 'row', gap: 10, marginTop: 10 },
  advBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 12 },
  advTxt: { color: '#fff', fontWeight: '800' },
  win: { fontSize: 16, fontWeight: '800', color: GREEN, marginBottom: 10 },
  rank: { fontSize: 15, fontWeight: '700', color: '#1B2A33', marginTop: 10 },
  section: { fontSize: 13, fontWeight: '700', color: '#64748b', marginTop: 22, marginBottom: 6 },
  wp: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  wpName: { flex: 1, fontSize: 14, color: '#1B2A33' }, wpKm: { fontSize: 12, color: '#94a3b8' },
  err: { color: '#e11d48', marginTop: 20, textAlign: 'center' },
});
