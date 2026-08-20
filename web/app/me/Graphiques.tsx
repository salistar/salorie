'use client';
import { useState } from 'react';
// Deux graphiques en SVG, ecrits a la main.
// ---------------------------------------------------------------------------
// Pas de bibliotheque : recharts pese plus lourd que tout l'espace /me reuni, pour
// deux formes simples. Ecrire le SVG donne en prime la maitrise du sens de lecture
// (en arabe le graphique se lit de droite a gauche) et des couleurs, qui viennent
// des memes tokens que le reste du site — donc theme sombre gratuit.

type PointCourbe = { x: string; y: number };

export function Courbe({
  points,
  unite = '',
  inverse = false,
}: {
  points: PointCourbe[];
  unite?: string;
  /** Sens arabe : l'axe du temps va de droite a gauche. */
  inverse?: boolean;
}) {
  if (points.length < 2) {
    return <div className="graphe-vide">Pas encore assez de points.</div>;
  }
  const L = 640;
  const H = 180;
  const marge = { h: 34, b: 22, t: 12 };

  const ys = points.map((p) => p.y);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  // Une courbe plate collerait au bord : on ouvre l'echelle pour qu'elle reste lisible.
  if (max - min < 0.5) {
    min -= 1;
    max += 1;
  }
  const marge_y = (max - min) * 0.12;
  min -= marge_y;
  max += marge_y;

  const px = (i: number) => {
    const t = i / (points.length - 1);
    const u = inverse ? 1 - t : t;
    return marge.h + u * (L - marge.h - 12);
  };
  const py = (v: number) => marge.t + (1 - (v - min) / (max - min)) * (H - marge.t - marge.b);

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ');
  const aire = `${d} L ${px(points.length - 1).toFixed(1)} ${H - marge.b} L ${px(0).toFixed(1)} ${H - marge.b} Z`;
  const dernier = points[points.length - 1];

  return (
    <svg className="graphe" viewBox={`0 0 ${L} ${H}`} role="img" aria-label={`Évolution : ${dernier.y}${unite}`}>
      {[0, 0.5, 1].map((f) => {
        const v = min + f * (max - min);
        return (
          <g key={f}>
            <line x1={marge.h} y1={py(v)} x2={L - 12} y2={py(v)} className="g-grille" />
            <text x={4} y={py(v) + 4} className="g-axe">
              {Math.round(v)}
            </text>
          </g>
        );
      })}
      <path d={aire} className="g-aire" />
      <path d={d} className="g-ligne" />
      <circle cx={px(points.length - 1)} cy={py(dernier.y)} r={4} className="g-point" />
    </svg>
  );
}

export function Barres({
  points,
  cible,
  inverse = false,
}: {
  points: PointCourbe[];
  /** Trait d'objectif quotidien, s'il est defini. */
  cible?: number;
  inverse?: boolean;
}) {
  // Survol/focus : etiquettes SELECTIVES — la valeur ne s'affiche que sur le
  // jour pointe (et le dernier jour, qui est « aujourd'hui » dans ce graphe).
  const [survol, setSurvol] = useState<number | null>(null);
  if (!points.length) return <div className="graphe-vide">Pas encore de données.</div>;

  const L = 640;
  const H = 190;
  const marge = { h: 38, b: 26, t: 14 };
  const max = Math.max(...points.map((p) => p.y), cible || 0) * 1.1 || 1;
  const largeur = (L - marge.h - 12) / points.length;
  const py = (v: number) => marge.t + (1 - v / max) * (H - marge.t - marge.b);
  const base = H - marge.b;

  /** Barre a SOMMET arrondi seulement, ancree a la ligne de base. */
  const cheminBarre = (x: number, y: number, w: number) => {
    const r = Math.min(4, w / 2, Math.max(0, base - y));
    return `M ${x} ${base} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${base} Z`;
  };

  const fmt = (d: string) => {
    const t = Date.parse(d.length === 5 ? `${new Date().getFullYear()}-${d}` : d);
    return Number.isFinite(t)
      ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
      : d;
  };
  const mid = Math.floor((points.length - 1) / 2);
  const idx = (i: number) => (inverse ? points.length - 1 - i : i);

  return (
    <div className="g30-zone">
      <svg className="graphe" viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Calories par jour">
        {/* Grille recessive : trois lignes, etiquettes en encre discrete. */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={marge.h} y1={py(f * max)} x2={L - 12} y2={py(f * max)} className="g-grille" />
            <text x={4} y={py(f * max) + 4} className="g-axe">{Math.round(f * max)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const rang = idx(i);
          const x = marge.h + rang * largeur + largeur * 0.18;
          const w = largeur * 0.64;
          const depasse = Boolean(cible && p.y > cible);
          const dernier = i === points.length - 1;
          return (
            <g key={p.x}
               tabIndex={0}
               role="img"
               aria-label={`${fmt(p.x)} : ${Math.round(p.y)} kcal`}
               className="g30-jour"
               onMouseEnter={() => setSurvol(i)}
               onMouseLeave={() => setSurvol(null)}
               onFocus={() => setSurvol(i)}
               onBlur={() => setSurvol(null)}>
              {/* Zone de visee plus large que la barre : la cible de survol ne
                  doit pas exiger la precision d'un pixel. */}
              <rect x={marge.h + rang * largeur} y={marge.t} width={largeur} height={H - marge.t - marge.b}
                    fill="transparent" />
              {p.y > 0 ? (
                <path d={cheminBarre(x, py(p.y), w)}
                      className={`g30-barre${depasse ? ' depasse' : ''}${dernier ? ' actuel' : ''}${survol === i ? ' vise' : ''}`} />
              ) : (
                <rect x={x} y={base - 2} width={w} height={2} rx={1} className="g30-fantome" />
              )}
            </g>
          );
        })}
        {cible ? (
          <g>
            <line x1={marge.h} y1={py(cible)} x2={L - 12} y2={py(cible)} className="g-cible" />
            <text x={L - 14} y={py(cible) - 5} textAnchor="end" className="g30-cible-txt">
              objectif {Math.round(cible)}
            </text>
          </g>
        ) : null}
        {/* Trois reperes de dates : debut, milieu, fin. */}
        {[0, mid, points.length - 1].map((i, k) => (
          <text key={k}
                x={marge.h + idx(i) * largeur + largeur / 2}
                y={H - 8}
                textAnchor={k === 0 && !inverse ? 'start' : k === 2 && !inverse ? 'end' : 'middle'}
                className="g-axe">
            {fmt(points[i].x)}
          </text>
        ))}
      </svg>
      {survol != null ? (
        <div className="poids-bulle g30-bulle"
             style={{ left: `${((marge.h + idx(survol) * largeur + largeur / 2) / L) * 100}%` }}>
          <strong>{Math.round(points[survol].y)} kcal</strong>
          <span>{fmt(points[survol].x)}</span>
        </div>
      ) : null}
    </div>
  );
}
