// Framework A/B minimal, 100 % CÔTÉ CLIENT (feature #191).
// But : router une fraction stable des utilisateurs vers une variante d'UI (ou de
// copie, d'algo…) et MESURER l'exposition, sans backend ni dépendance externe.
//
// Usage typique (flag UI -> mesure) :
//   const { variant } = useExperiment(user.uid, 'coach_cta_v1', ['control', 'bold']);
//   return variant === 'bold' ? <BoldCTA /> : <PlainCTA />;
// L'assignation est DÉTERMINISTE : un même (userId, experimentKey) tombe toujours
// dans la même variante — pas de flip-flop entre deux rendus ni entre deux sessions.
// L'exposition est loggée UNE SEULE FOIS par montage (stub télémétrie via console.log ;
// on branchera plus tard un vrai sink analytics — aucun appel réseau ici).
import { useRef, useEffect } from 'react';

/**
 * Hash déterministe FNV-1a 32 bits d'une chaîne → entier non signé.
 * Choisi pour sa bonne dispersion et son absence totale de dépendance.
 */
function fnv1a(str: string): number {
  let h = 0x811c9dc5; // offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // multiplication par le prime FNV (16777619), en restant en 32 bits non signés.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0; // force la valeur non signée
}

/**
 * Assigne DÉTERMINISTIQUEMENT une variante à un utilisateur pour une expérience.
 * Même (userId, experimentKey) → TOUJOURS la même variante.
 *
 * @param userId        identifiant stable de l'utilisateur (uid). Vide → fallback stable.
 * @param experimentKey clé de l'expérience (ex. 'coach_cta_v1').
 * @param variants      liste des variantes possibles (ex. ['control', 'bold']).
 * @returns la variante assignée ; '' si aucune variante n'est fournie.
 */
export function assignVariant(
  userId: string,
  experimentKey: string,
  variants: string[],
): string {
  // Aucune variante → rien à router (retourne '' plutôt que de jeter).
  if (!variants || variants.length === 0) return '';
  if (variants.length === 1) return variants[0];
  // userId vide : on route quand même de façon STABLE (fallback déterministe sur la clé
  // seule), plutôt que de forcer 'control' — évite un biais si beaucoup d'uid manquent.
  const seed = `${userId || 'anon'}:${experimentKey}`;
  const idx = fnv1a(seed) % variants.length;
  return variants[idx];
}

/**
 * Hook React : renvoie la variante assignée et logge l'exposition UNE fois.
 * `useRef` garde la variante figée pour la durée du montage (pas de recalcul si
 * la référence du tableau `variants` change) et `useEffect` garantit un seul log.
 */
export function useExperiment(
  userId: string,
  experimentKey: string,
  variants: string[],
): { variant: string } {
  // Fige la variante au premier rendu : stable tant que le composant est monté.
  const variantRef = useRef<string | null>(null);
  if (variantRef.current === null) {
    variantRef.current = assignVariant(userId, experimentKey, variants);
  }
  const variant = variantRef.current;

  const loggedRef = useRef(false);
  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    // Stub télémétrie : format structuré, aucun appel réseau.
    console.log(`[exp] key=${experimentKey} variant=${variant} user=${userId || 'anon'}`);
  }, [experimentKey, variant, userId]);

  return { variant };
}
