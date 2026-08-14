// Politique de mouvement de l'app.
// ---------------------------------------------------------------------------
// Deux règles, tenues ici plutôt que rappelées dans chaque écran :
//
//   1. AUCUNE animation ne dépasse 300 ms. Au-delà, une interface cesse d'être
//      vive et devient lente — l'animation n'accompagne plus le geste, elle
//      l'attend. Les durées ci-dessous sont donc plafonnées par construction.
//
//   2. Le réglage système « réduire les animations » est RESPECTÉ. Ce n'est pas
//      une préférence esthétique : les mouvements d'interface déclenchent des
//      vertiges et des nausées chez les personnes sujettes au mal des transports
//      ou à des troubles vestibulaires. Quand il est actif, toutes les durées
//      tombent à zéro — les états changent instantanément, sans transition.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Durées, en millisecondes. Aucune ne dépasse 300 ms. */
export const DUREE = {
  /** Retour tactile d'un appui : doit paraître instantané. */
  appui: 90,
  /** Changement d'état courant (couleur, opacité). */
  transition: 180,
  /** Entrée d'un élément à l'écran. */
  entree: 260,
  /** Décalage entre deux éléments d'une même série. */
  decalage: 40,
} as const;

/**
 * Vrai si l'utilisateur a demandé de réduire les animations.
 * Écoute le réglage en continu : il peut changer pendant que l'app est ouverte.
 */
export function useMouvementReduit(): boolean {
  const [reduit, setReduit] = useState(false);

  useEffect(() => {
    let vivant = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (vivant) setReduit(v);
      })
      .catch(() => {
        /* réglage indisponible : on garde les animations */
      });
    const abo = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduit(Boolean(v)));
    return () => {
      vivant = false;
      abo?.remove?.();
    };
  }, []);

  return reduit;
}

/** Durée effective : zéro quand le mouvement est réduit. */
export const duree = (ms: number, reduit: boolean): number => (reduit ? 0 : ms);
