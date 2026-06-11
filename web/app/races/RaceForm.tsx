'use client';
import { useEffect, useRef, useState } from 'react';

const FRAMES = ['rabat','casablanca','marrakech','fes','meknes','tanger','chefchaouen','essaouira','ouarzazate','tetouan','agadir','oujda','safi','volubilis','dakhla','merzouga','ifrane','el-jadida','asilah','beni-mellal','couscous','tajine','caftan','zellige','gnaoua','the','henne','tapis','babouche','argan'];

type WP = { kind: string; name: string; lat: string; lng: string; atKm: string; mediaType: string };
const emptyWp = (kind: string, atKm = ''): WP => ({ kind, name: '', lat: '', lng: '', atKm, mediaType: 'streetview' });

export default function RaceForm({ onCreated }: { onCreated?: () => void }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏃');
  const [totalKm, setTotalKm] = useState('120');
  const [timeLimitDays, setTimeLimitDays] = useState('30');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [medalFrame, setMedalFrame] = useState('rabat');
  const [wps, setWps] = useState<WP[]>([emptyWp('start', '0'), emptyWp('stop'), emptyWp('end')]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);

  // Charge Leaflet (OSM, sans clé) une fois.
  useEffect(() => {
    if ((window as any).L) { initMap(); return; }
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
    const sc = document.createElement('script'); sc.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; sc.onload = initMap; document.body.appendChild(sc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function initMap() {
    const L = (window as any).L; if (!L || mapRef.current) return;
    mapRef.current = L.map('race-map').setView([31.79, -7.09], 5); // Maroc
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OSM' }).addTo(mapRef.current);
    redraw();
  }
  // Redessine marqueurs + tracé à chaque changement de waypoints.
  useEffect(() => { redraw(); /* eslint-disable-next-line */ }, [wps]);
  function redraw() {
    const L = (window as any).L; const map = mapRef.current; if (!L || !map) return;
    if (layerRef.current) map.removeLayer(layerRef.current);
    const grp = L.layerGroup(); const pts: [number, number][] = [];
    wps.forEach((w, i) => {
      const la = parseFloat(w.lat), ln = parseFloat(w.lng);
      if (isFinite(la) && isFinite(ln)) {
        pts.push([la, ln]);
        const color = w.kind === 'start' ? '#2E8B57' : w.kind === 'end' ? '#e11d48' : '#2563eb';
        L.circleMarker([la, ln], { radius: 8, color, fillColor: color, fillOpacity: 0.9 })
          .bindTooltip(`${i + 1}. ${w.name || w.kind} (${w.atKm || 0} km)`).addTo(grp);
      }
    });
    if (pts.length >= 2) L.polyline(pts, { color: '#2E8B57', weight: 3, dashArray: '6 6' }).addTo(grp);
    grp.addTo(map); layerRef.current = grp;
    if (pts.length) map.fitBounds(pts.length > 1 ? pts : [pts[0], pts[0]], { padding: [40, 40], maxZoom: 9 });
  }

  const setWp = (i: number, k: keyof WP, v: string) => setWps((a) => a.map((w, idx) => idx === i ? { ...w, [k]: v } : w));
  const addStop = () => setWps((a) => { const copy = [...a]; copy.splice(copy.length - 1, 0, emptyWp('stop')); return copy; });
  const delWp = (i: number) => setWps((a) => a.length > 2 ? a.filter((_, idx) => idx !== i) : a);

  const submit = async () => {
    setMsg(null);
    const payload = {
      name, emoji, totalKm: Number(totalKm), timeLimitDays: Number(timeLimitDays),
      startDate: startDate || undefined, endDate: endDate || undefined, medalFrame,
      waypoints: wps.map((w) => ({ kind: w.kind, name: w.name, lat: Number(w.lat), lng: Number(w.lng), atKm: Number(w.atKm), mediaType: w.mediaType })),
    };
    if (!name.trim()) { setMsg('⚠️ Nom requis.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/races', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (j.error || j.message) setMsg('❌ ' + (j.message || j.error));
      else { setMsg(`✅ Course « ${j.name} » créée (${j.totalKm} km, ${j.waypoints?.length} points).`); onCreated?.(); }
    } catch (e: any) { setMsg('❌ ' + (e?.message || 'erreur')); }
    finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Nom de la course"><input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tour du Maroc" /></Field>
        <Field label="Emoji"><input style={inp} value={emoji} onChange={(e) => setEmoji(e.target.value)} /></Field>
        <Field label="Distance totale (km) — 80 à 2000"><input style={inp} type="number" value={totalKm} onChange={(e) => setTotalKm(e.target.value)} /></Field>
        <Field label="Temps imparti (jours)"><input style={inp} type="number" value={timeLimitDays} onChange={(e) => setTimeLimitDays(e.target.value)} /></Field>
        <Field label="Date début"><input style={inp} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="Date fin"><input style={inp} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        <Field label="Cadre médaille">
          <select style={inp} value={medalFrame} onChange={(e) => setMedalFrame(e.target.value)}>
            {FRAMES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
      </div>

      <label style={lbl}>Points du parcours (départ → arrêts 20-100 km → arrivée)</label>
      <div id="race-map" style={{ height: 260, borderRadius: 12, marginBottom: 12, border: '1px solid #e5e7eb' }} />
      {wps.map((w, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px 90px 70px 110px 30px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: w.kind === 'start' ? '#2E8B57' : w.kind === 'end' ? '#e11d48' : '#2563eb' }}>{w.kind === 'start' ? 'Départ' : w.kind === 'end' ? 'Arrivée' : 'Arrêt'}</span>
          <input style={inpSm} placeholder="Lieu" value={w.name} onChange={(e) => setWp(i, 'name', e.target.value)} />
          <input style={inpSm} placeholder="lat" value={w.lat} onChange={(e) => setWp(i, 'lat', e.target.value)} />
          <input style={inpSm} placeholder="lng" value={w.lng} onChange={(e) => setWp(i, 'lng', e.target.value)} />
          <input style={inpSm} placeholder="km" value={w.atKm} onChange={(e) => setWp(i, 'atKm', e.target.value)} />
          <select style={inpSm} value={w.mediaType} onChange={(e) => setWp(i, 'mediaType', e.target.value)}>
            <option value="streetview">Street View</option><option value="photo">Photo</option><option value="video">Vidéo</option><option value="both">Photo+Vidéo</option>
          </select>
          {w.kind === 'stop' ? <button onClick={() => delWp(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#e11d48' }}>✕</button> : <span />}
        </div>
      ))}
      <button onClick={addStop} style={{ ...btnGhost, marginTop: 4 }}>+ Ajouter un arrêt</button>

      <button onClick={submit} disabled={busy} style={{ ...btnMain, marginTop: 16 }}>{busy ? 'Création…' : '🏁 Créer la course'}</button>
      {msg && <p style={{ marginTop: 12, fontWeight: 600, color: msg.startsWith('✅') ? '#2E8B57' : '#e11d48' }}>{msg}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return <div><label style={lbl}>{label}</label>{children}</div>;
}
const lbl: any = { display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', margin: '10px 0 5px' };
const inp: any = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' };
const inpSm: any = { ...inp, padding: '7px 8px', fontSize: 13 };
const btnMain: any = { width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#2E8B57', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' };
const btnGhost: any = { padding: '8px 14px', borderRadius: 10, border: '1.5px solid #2E8B57', background: 'none', color: '#2E8B57', fontWeight: 700, cursor: 'pointer' };
