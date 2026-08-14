'use client';
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
  if (!points.length) return <div className="graphe-vide">Pas encore de données.</div>;
  const L = 640;
  const H = 180;
  const marge = { h: 34, b: 22, t: 12 };
  const max = Math.max(...points.map((p) => p.y), cible || 0) * 1.1 || 1;
  const largeur = (L - marge.h - 12) / points.length;
  const py = (v: number) => marge.t + (1 - v / max) * (H - marge.t - marge.b);

  return (
    <svg className="graphe" viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Calories par jour">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={marge.h} y1={py(f * max)} x2={L - 12} y2={py(f * max)} className="g-grille" />
          <text x={4} y={py(f * max) + 4} className="g-axe">
            {Math.round(f * max)}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const rang = inverse ? points.length - 1 - i : i;
        const x = marge.h + rang * largeur;
        const h = Math.max(0, H - marge.b - py(p.y));
        return (
          <rect
            key={p.x}
            x={x + largeur * 0.16}
            y={py(p.y)}
            width={largeur * 0.68}
            height={h}
            rx={2}
            className={cible && p.y > cible ? 'g-barre depasse' : 'g-barre'}
          >
            <title>{`${p.x} — ${Math.round(p.y)} kcal`}</title>
          </rect>
        );
      })}
      {cible ? <line x1={marge.h} y1={py(cible)} x2={L - 12} y2={py(cible)} className="g-cible" /> : null}
    </svg>
  );
}
