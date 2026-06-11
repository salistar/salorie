'use client';
import { useState } from 'react';
import { buildMedalSvg, SHAPES } from '../../lib/medalFrames';

const COLORS = ['#d33329', '#e11d48', '#db2777', '#c0297a', '#9333ea', '#6d28d9', '#414a93', '#2e74b0', '#0ea5e9', '#15a99a', '#1c9d6b', '#2E8B57', '#65a30d', '#ca8a04', '#d99423', '#ea580c', '#b45309', '#0e7490', '#475569', '#1e293b'];
const METALS = [{ v: 'or', label: 'Or' }, { v: 'argent', label: 'Argent' }, { v: 'bronze', label: 'Bronze' }];

const svg = (p: any, w: number) => buildMedalSvg(p).replace('width="264" height="384"', `width="${w}" height="${Math.round((w * 384) / 264)}"`);

export default function MedalBuilder() {
  const [shape, setShape] = useState('circle');
  const [color, setColor] = useState('#2e74b0');
  const [metal, setMetal] = useState('or');
  const [centerType, setCenterType] = useState<'photo' | 'geo'>('geo');
  const [customPath, setCustomPath] = useState('');
  const [title, setTitle] = useState('SALORIE');
  const [km, setKm] = useState('120');

  const base: any = { color, metal, centerType, title, km: Number(km) || 0, time: '4h 28min', name: 'Participant', rank: 1, customPath: customPath.trim() || undefined };
  const spec = JSON.stringify({ shape: customPath.trim() ? 'custom' : shape, color, metal, centerType, ...(customPath.trim() ? { customPath: customPath.trim() } : {}) });

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Builder de médailles</h2>
      <p className="foot">Choisis une FORME, une COULEUR (toutes possibles), le métal, et le centre (photo ou motif géométrique). Aperçu en direct.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
        <div className="card" style={{ padding: 16, textAlign: 'center', position: 'sticky', top: 16 }}>
          <div dangerouslySetInnerHTML={{ __html: svg({ ...base, shape }, 230) }} />
          <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8', wordBreak: 'break-all' }}>spec : <code>{spec}</code></div>
        </div>

        <div>
          <label style={lbl}>Couleur (n'importe laquelle)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 46, height: 38, border: 'none', background: 'none', cursor: 'pointer' }} />
            {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} title={c} style={{ width: 26, height: 26, borderRadius: 7, background: c, border: color === c ? '3px solid #1e293b' : '1px solid #e5e7eb', cursor: 'pointer' }} />)}
          </div>

          <label style={lbl}>Métal de l'anneau</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {METALS.map((m) => <button key={m.v} onClick={() => setMetal(m.v)} style={chip(metal === m.v)}>{m.label}</button>)}
          </div>

          <label style={lbl}>Centre</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setCenterType('geo')} style={chip(centerType === 'geo')}>Motif géométrique</button>
            <button onClick={() => setCenterType('photo')} style={chip(centerType === 'photo')}>Photo (dans l'app)</button>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <div style={{ flex: 1 }}><label style={lbl}>Titre</label><input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div style={{ width: 110 }}><label style={lbl}>Km</label><input style={inp} type="number" value={km} onChange={(e) => setKm(e.target.value)} /></div>
          </div>

          <label style={lbl}>Forme ({SHAPES.length} disponibles — clique)</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 }}>
            {SHAPES.map((s) => (
              <button key={s} onClick={() => { setShape(s); setCustomPath(''); }} style={{ border: shape === s && !customPath ? '2px solid #2E8B57' : '1px solid #e5e7eb', borderRadius: 10, background: '#fff', cursor: 'pointer', padding: 4 }}>
                <div dangerouslySetInnerHTML={{ __html: svg({ ...base, shape: s, customPath: undefined }, 64) }} />
              </button>
            ))}
          </div>

          <label style={lbl}>Forme personnalisée (avancé — path SVG, viewBox 264×384, centre ~132,192)</label>
          <textarea style={{ ...inp, height: 64, fontFamily: 'monospace', fontSize: 12 }} value={customPath} onChange={(e) => setCustomPath(e.target.value)} placeholder="ex: M 40 96 H 224 V 240 Q 224 300 132 320 Q 40 300 40 240 Z" />
        </div>
      </div>
    </main>
  );
}
const lbl: any = { display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', margin: '16px 0 6px' };
const inp: any = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' };
const chip = (a: boolean): any => ({ padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: a ? '#fff' : '#64748b', background: a ? '#2E8B57' : '#eef2f7' });
