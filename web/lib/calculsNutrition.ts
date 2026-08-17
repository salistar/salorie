// Calculs purs des écrans de nutrition.
// ---------------------------------------------------------------------------
// Ils vivaient d'abord dans les `page.tsx` correspondants ; Next.js l'a refusé,
// et il a eu raison : un fichier de page n'a le droit d'exporter que ce que le
// framework attend. Le bon endroit était de toute façon ici — ces deux règles
// décident de ce qui entre dans le journal de quelqu'un, donc elles se testent
// sans faire tourner de page.

export type Activite = 'sedentaire' | 'modere' | 'intense';

/**
 * Objectif d'hydratation quotidien, en ml. Même règle que `smart-hydration`
 * sur mobile : une base proportionnelle au poids, majorée par l'activité et la
 * chaleur, arrondie aux 50 ml.
 *
 * Le poids est borné à 300 kg et retombe sur 70 kg s'il est absent ou absurde :
 * un profil vide donnerait sinon un objectif de 0 ml, c'est-à-dire un écran qui
 * dit à quelqu'un qu'il n'a rien à boire.
 */
export function objectifEau(poidsKg: number, activite: Activite, chaleur: boolean): number {
  const poids = Number.isFinite(poidsKg) && poidsKg > 0 ? Math.min(300, poidsKg) : 70;
  const base = poids * 33;
  const sup = activite === 'intense' ? 750 : activite === 'modere' ? 350 : 0;
  return Math.round((base + sup + (chaleur ? 500 : 0)) / 50) * 50;
}

/**
 * Calories déduites des macros — règle d'Atwater, 4/4/9 kcal par gramme.
 *
 * Sert de filet quand le champ « kcal » est laissé vide : sans lui, un repas
 * dont on a rempli les macros entrerait au journal à 0 kcal et ne compterait
 * pour rien dans la journée.
 */
export function kcalDepuisMacros(proteines: number, glucides: number, lipides: number): number {
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  return Math.round(n(proteines) * 4 + n(glucides) * 4 + n(lipides) * 9);
}
