'use client';
import { useEffect, useRef, useState } from 'react';
import { buildMedalSvg, SHAPES } from '../../lib/medalFrames';

const mchip = (a: boolean): any => ({ padding: '5px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, color: a ? '#fff' : '#64748b', background: a ? '#2E8B57' : '#eef2f7' });
// Clé via variable d'env (jamais en dur dans le code). Définir NEXT_PUBLIC_GMAP_KEY
// côté déploiement web pour activer la carte.
const GMAP_KEY = process.env.NEXT_PUBLIC_GMAP_KEY || '';

type WP = { name: string; lat: number; lng: number; atKm: string; mediaType: string };

export default function RaceForm({ onCreated }: { onCreated?: () => void }) {
  const [name, setName] = useState('');
  const [totalKm, setTotalKm] = useState('120');
  const [timeLimitDays, setTimeLimitDays] = useState('30');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [mShape, setMShape] = useState('circle');
  const [mColor, setMColor] = useState('#2e74b0');
  const [mMetal, setMMetal] = useState('or');
  const [mCenter, setMCenter] = useState<'photo' | 'geo'>('geo');
  const [wps, setWps] = useState<WP[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const lineRef = useRef<any>(null);
  const wpsRef = useRef<WP[]>([]);
  wpsRef.current = wps;

  // Charge Google Maps + clic sur la carte = ajoute un point.
  useEffect(() => {
    if (!GMAP_KEY) return; // clé non configurée → message affiché dans la carte
    const init = () => {
      const g = (window as any).google;
      if (!g || mapRef.current) return;
      mapRef.current = new g.maps.Map(document.getElementById('gmap'), { center: { lat: 31.79, lng: -7.09 }, zoom: 6, mapTypeControl: false, streetViewControl: false });
      mapRef.current.addListener('click', (e: any) => {
        const lat = +e.latLng.lat().toFixed(6), lng = +e.latLng.lng().toFixed(6);
        setWps((a) => [...a, { name: '', lat, lng, atKm: '', mediaType: 'streetview' }]);
      });
    };
    if ((window as any).google?.maps) { init(); return; }
    if (!document.getElementById('gmap-sdk')) {
      const sc = document.createElement('script'); sc.id = 'gmap-sdk';
      sc.src = `https://maps.googleapis.com/maps/api/js?key=${GMAP_KEY}`;
      sc.onload = init; document.body.appendChild(sc);
    } else { (document.getElementById('gmap-sdk') as any).addEventListener('load', init); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redessine marqueurs + tracé à chaque changement.
  useEffect(() => {
    const g = (window as any).google; const map = mapRef.current; if (!g || !map) return;
    markersRef.current.forEach((m) => m.setMap(null)); markersRef.current = [];
    if (lineRef.current) lineRef.current.setMap(null);
    const path: any[] = [];
    wps.forEach((w, i) => {
      const kind = i === 0 ? 'start' : i === wps.length - 1 ? 'end' : 'stop';
      const color = kind === 'start' ? '#2E8B57' : kind === 'end' ? '#e11d48' : '#2563eb';
      const mk = new g.maps.Marker({ position: { lat: w.lat, lng: w.lng }, map, label: { text: String(i + 1), color: '#fff', fontSize: '11px' },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 11, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } });
      markersRef.current.push(mk); path.push({ lat: w.lat, lng: w.lng });
    });
    if (path.length >= 2) lineRef.current = new g.maps.Polyline({ path, map, strokeColor: '#2E8B57', strokeWeight: 3, strokeOpacity: 0.9 });
  }, [wps]);

  const setWp = (i: number, k: keyof WP, v: any) => setWps((a) => a.map((w, idx) => idx === i ? { ...w, [k]: v } : w));
  const delWp = (i: number) => setWps((a) => a.filter((_, idx) => idx !== i));
  const kindLabel = (i: number, n: number) => i === 0 ? 'Départ' : i === n - 1 ? 'Arrivée' : 'Arrêt';

  const submit = async () => {
    setMsg(null);
    if (!name.trim()) { setMsg('⚠️ Nom requis.'); return; }
    if (wps.length < 2) { setMsg('⚠️ Clique au moins un départ et une arrivée sur la carte.'); return; }
    const payload = {
      name, totalKm: Number(totalKm), timeLimitDays: Number(timeLimitDays),
      startDate: startDate || undefined, endDate: endDate || undefined, medalFrame: 'custom',
      medalSpec: { shape: mShape, color: mColor, metal: mMetal, centerType: mCenter },
      waypoints: wps.map((w, i) => ({ kind: i === 0 ? 'start' : i === wps.length - 1 ? 'end' : 'stop', name: w.name, lat: w.lat, lng: w.lng, atKm: Number(w.atKm), mediaType: w.mediaType })),
    };
    setBusy(true);
    try {
      const r = await fetch('/api/races', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (j.error || j.message) setMsg('❌ ' + (j.message || j.error));
      else { setMsg(`✅ Course « ${j.name} » créée.`); setWps([]); onCreated?.(); }
    } catch (e: any) { setMsg('❌ ' + (e?.message || 'erreur')); }
    finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="grid-2col">
        <Field label="Nom de la course"><input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tour du Maroc" /></Field>
        <Field label="Distance totale (km) — 80 à 2000"><input style={inp} type="number" value={totalKm} onChange={(e) => setTotalKm(e.target.value)} /></Field>
        <Field label="Temps imparti (jours)"><input style={inp} type="number" value={timeLimitDays} onChange={(e) => setTimeLimitDays(e.target.value)} /></Field>
        <Field label="Date début"><input style={inp} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="Date fin"><input style={inp} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        <Field label="Forme de la médaille">
          <select style={inp} value={mShape} onChange={(e) => setMShape(e.target.value)}>{SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </Field>
        <Field label="Couleur de la médaille">
          <input type="color" value={mColor} onChange={(e) => setMColor(e.target.value)} style={{ ...inp, padding: 4, height: 42 }} />
        </Field>
      </div>

      <div style={{ textAlign: 'center', margin: '14px 0', padding: 12, background: '#f8fafc', borderRadius: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Aperçu médaille (modèle) — <a href="/medal-builder" style={{ color: '#2E8B57' }}>builder complet</a></div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          {['or', 'argent', 'bronze'].map((m) => <button key={m} type="button" onClick={() => setMMetal(m)} style={mchip(mMetal === m)}>{m}</button>)}
          <button type="button" onClick={() => setMCenter('geo')} style={mchip(mCenter === 'geo')}>motif</button>
          <button type="button" onClick={() => setMCenter('photo')} style={mchip(mCenter === 'photo')}>photo</button>
        </div>
        <div style={{ display: 'inline-block' }} dangerouslySetInnerHTML={{ __html: buildMedalSvg({ shape: mShape, color: mColor, metal: mMetal, centerType: mCenter, mode: 'template', title: name || 'Course', km: Number(totalKm) || 0 }).replace('width="264" height="384"', 'width="150" height="218"') }} />
      </div>

      <label style={lbl}>🗺️ Clique sur la carte pour poser tes points (1er = départ, dernier = arrivée, milieu = arrêts)</label>
      <div id="gmap" style={{ height: 320, borderRadius: 12, marginBottom: 12, border: '1px solid #e5e7eb', background: '#eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 16 }}>
        {!GMAP_KEY && <span>Carte indisponible : définis <code>NEXT_PUBLIC_GMAP_KEY</code> dans l'environnement du web pour activer la carte Google + le clic.</span>}
      </div>

      {wps.map((w, i) => (
        <div key={i} className="wp-grid">
          <span style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? '#2E8B57' : i === wps.length - 1 ? '#e11d48' : '#2563eb' }}>{i + 1}. {kindLabel(i, wps.length)}</span>
          <input style={inpSm} placeholder="Lieu" value={w.name} onChange={(e) => setWp(i, 'name', e.target.value)} />
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{w.lat.toFixed(3)}, {w.lng.toFixed(3)}</span>
          <input style={inpSm} placeholder="km" value={w.atKm} onChange={(e) => setWp(i, 'atKm', e.target.value)} />
          <select style={inpSm} value={w.mediaType} onChange={(e) => setWp(i, 'mediaType', e.target.value)}>
            <option value="streetview">Street View</option><option value="photo">Photo</option><option value="video">Vidéo</option><option value="both">Photo+Vidéo</option>
          </select>
          <button onClick={() => delWp(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#e11d48' }}>✕</button>
        </div>
      ))}
      {!wps.length && <p className="foot">Aucun point — clique sur la carte pour commencer.</p>}

      <button onClick={submit} disabled={busy} style={{ ...btnMain, marginTop: 16 }}>{busy ? 'Création…' : '🏁 Créer la course'}</button>
      {msg && <p style={{ marginTop: 12, fontWeight: 600, color: msg.startsWith('✅') ? '#2E8B57' : '#e11d48' }}>{msg}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) { return <div><label style={lbl}>{label}</label>{children}</div>; }
const lbl: any = { display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', margin: '10px 0 5px' };
const inp: any = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' };
const inpSm: any = { ...inp, padding: '7px 8px', fontSize: 13 };
const btnMain: any = { width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#2E8B57', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' };
