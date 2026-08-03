// Garde-fou partagé contre le HANG du SDK Firestore admin.
// Symptôme observé en prod : au cold-start gRPC du conteneur, un `.get()` peut ne
// JAMAIS répondre — la page reste alors bloquée (skeleton infini / page « busy »),
// sans la moindre erreur dans les logs. Toute lecture Firestore d'une page ou d'une
// route API doit donc être bornée.
//
//   const flags = await withTimeout(getRichFlags(), 8000, 'Flags');       // throw
//   const rows  = await softTimeout(getUsers(), 8000, [] as User[]);      // valeur de repli

export const FIRESTORE_TIMEOUT_MS = 8000;

/** Rejette si la promesse dépasse `ms` (message explicite pour l'UI). */
export function withTimeout<T>(p: Promise<T>, ms = FIRESTORE_TIMEOUT_MS, label = 'Firestore'): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} : délai dépassé (${Math.round(ms / 1000)} s). Réessaie.`)), ms),
    ),
  ]);
}

/** Ne rejette jamais : renvoie `fallback` au bout de `ms` (pages qui doivent s'afficher). */
export function softTimeout<T>(p: Promise<T>, ms = FIRESTORE_TIMEOUT_MS, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}
