'use client';
import { useState } from 'react';
import { buildMedalSvg, PALETTES, SHAPES } from '../../lib/medalFrames';

const FRAMES = Object.keys(PALETTES);
const SHAPE_LABEL: Record<string, string> = { circle: 'Cercle', bobbles: 'Perles', cog: 'Engrenage', clover: 'Trèfle', octagon: 'Octogone', scallop: 'Festons' };

function svgAt(params: any, w: number) {
  return buildMedalSvg(params).replace('width="264" height="384"', `width="${w}" height="${Math.round((w * 384) / 264)}"`);
}

export default function MedalBuilder() {
  const [frame, setFrame] = useState('rabat');
  const [shape, setShape] = useState('circle');
  const [title, setTitle] = useState('Marrakech');
  const [km, setKm] = useState('120');
  const [name, setName] = useState('Champion');
  const [rank, setRank] = useState('1');

  const params = { frame, shape, title, km: Number(km) || 0, name, rank: Number(rank) || 1, time: '4h 28min', dates: '01.03.2025 — 28.05.2025' };

  // Toutes les combinaisons formes × thèmes = 100+ exemples.
  const examples: { frame: string; shape: string }[] = [];
  for (const s of SHAPES) for (const f of FRAMES) examples.push({ frame: f, shape: s });

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Builder de médailles</h2>
      <p className="foot">{SHAPES.length} formes × {FRAMES.length} thèmes = <b>{examples.length} exemples</b>. Personnalise, ou clique un exemple. Centre toujours rempli (la photo du lieu s'ajoute côté app).</p>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: 18, textAlign: 'center' }}>
          <div dangerouslySetInnerHTML={{ __html: svgAt(params, 220) }} />
        </div>
        <div className="card" style={{ padding: 18, flex: 1, minWidth: 280 }}>
          <Field label="Titre"><input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Distance (km)"><input style={inp} value={km} onChange={(e) => setKm(e.target.value)} /></Field>
          <Field label="Nom"><input style={inp} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Rang"><input style={inp} type="number" value={rank} onChange={(e) => setRank(e.target.value)} /></Field>
          <Field label="Thème (couleur)">
            <select style={inp} value={frame} onChange={(e) => setFrame(e.target.value)}>{FRAMES.map((f) => <option key={f} value={f}>{f}</option>)}</select>
          </Field>
          <Field label="Forme">
            <select style={inp} value={shape} onChange={(e) => setShape(e.target.value)}>{SHAPES.map((s) => <option key={s} value={s}>{SHAPE_LABEL[s] || s}</option>)}</select>
          </Field>
        </div>
      </div>

      <h3 style={{ marginTop: 26 }}>Exemples ({examples.length})</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginTop: 10 }}>
        {examples.map((ex, i) => (
          <button key={i} onClick={() => { setFrame(ex.frame); setShape(ex.shape); }}
            title={`${ex.frame} · ${SHAPE_LABEL[ex.shape] || ex.shape}`}
            style={{ border: frame === ex.frame && shape === ex.shape ? '2px solid #2E8B57' : '1px solid #e5e7eb', borderRadius: 12, background: '#fff', cursor: 'pointer', padding: 6 }}>
            <div dangerouslySetInnerHTML={{ __html: svgAt({ frame: ex.frame, shape: ex.shape, title: ex.frame, km: 100, name: '', rank: 1, time: '', dates: '' }, 92) }} />
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{ex.frame}·{SHAPE_LABEL[ex.shape] || ex.shape}</div>
          </button>
        ))}
      </div>
    </main>
  );
}
function Field({ label, children }: { label: string; children: any }) { return <div style={{ marginBottom: 10 }}><label style={lbl}>{label}</label>{children}</div>; }
const lbl: any = { display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 5 };
const inp: any = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' };
