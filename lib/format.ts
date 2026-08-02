// Helpers de formatage PARTAGÉS — dédupliqués depuis ~10 écrans qui réécrivaient les
// mêmes fonctions (numLocale ×7, formatteur de date 'YYYY-MM-DD' ×3). Source unique ici.

/**
 * Locale Intl (pour toLocaleString / Intl.NumberFormat) selon la langue de l'app.
 * NB : 'ar-MA' (Maroc) rend les CHIFFRES OCCIDENTAUX (0-9), contrairement à 'ar'
 * (chiffres arabo-indiens ٠-٩). On standardise sur 'ar-MA' — cible MENA/Maroc — pour
 * un rendu numérique COHÉRENT sur tous les écrans.
 */
export function numLocaleFor(language?: string): string {
  return language === 'ar' ? 'ar-MA' : language === 'fr' ? 'fr-FR' : 'en-US';
}

/** Date → 'YYYY-MM-DD' en fuseau LOCAL. Sert de clé de date pour les logs / séries. */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
