/**
 * Valeur d'une macro, prête à afficher.
 *
 * L'écran d'analyse d'un scan interpolait directement le champ : `${aiResult.protein}`.
 * Quand la cascade rend un résultat sans valeurs nutritionnelles — photo qui n'est pas
 * un plat, tier qui n'a rien trouvé —, les quatre cartes affichaient littéralement
 * « undefined », sur la fonction centrale de l'application. Constaté sur appareil le
 * 4 août 2026 en scannant une image quelconque.
 *
 * Un tiret est honnête : il dit qu'on ne sait pas. Un zéro affirmerait qu'il n'y a ni
 * calorie ni protéine, ce qui serait faux — et, dans un compteur de calories, trompeur.
 */
export function macroTexte(v: any): string {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' && v !== null ? String(Math.round(n)) : '—';
}
