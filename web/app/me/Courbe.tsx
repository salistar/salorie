'use client';
// Une courbe de tendance, en SVG a la main.
// ---------------------------------------------------------------------------
// Extraite de la page « Constantes » quand les mensurations ont eu besoin de la
// meme chose. Pas de bibliotheque : tracer une ligne ne justifie pas une
// dependance de plusieurs centaines de kilo-octets sur toutes les pages.
//
// Deux copies auraient diverge sur le garde-fou qui compte : une plage nulle
// (toutes les valeurs identiques) donne une division par zero et une courbe
// invisible. C'est le cas le PLUS courant au debut, quand on n'a que deux
// mesures egales — exactement le moment ou un graphique vide fait croire a un
// bug.

export type PointCourbe = { ts: number; v: number };

export function Courbe({
  points,
  couleur,
  hauteur = 110,
}: {
  points: PointCourbe[];
  couleur: string;
  hauteur?: number;
}) {
  // Un seul point ne fait pas une tendance : on n'affiche rien plutot qu'un
  // segment de longueur nulle, qui ressemble a une poussiere sur l'ecran.
  if (points.length < 2) return null;

  const L = 600;
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const plage = Math.max(1, max - min);
  const pas = L / Math.max(1, points.length - 1);
  const d = points
    .map((p, i) => {
      const x = (i * pas).toFixed(1);
      const y = (hauteur - ((p.v - min) / plage) * (hauteur - 16) - 8).toFixed(1);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${L} ${hauteur}`} className="courbe" role="img" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={couleur}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Les chiffres qui accompagnent une courbe. `null` si la serie est vide. */
export function statsSerie(points: PointCourbe[]) {
  if (!points.length) return null;
  const v = points.map((p) => p.v);
  return {
    n: v.length,
    moy: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10,
    min: Math.min(...v),
    max: Math.max(...v),
    dernier: points[points.length - 1].v,
    // L'ecart entre la premiere et la derniere mesure : c'est la seule valeur
    // qui repond a « est-ce que ca bouge ? », la question qu'on vient poser.
    delta: Math.round((points[points.length - 1].v - points[0].v) * 10) / 10,
  };
}
