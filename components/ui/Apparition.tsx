// Entrée en scène d'un élément : léger fondu, léger déplacement vers le haut.
// ---------------------------------------------------------------------------
// Employé en série avec un `index` croissant, il produit un décalage de 40 ms d'un
// élément au suivant. L'effet raconte l'ORDRE de lecture — l'œil suit la cascade au
// lieu de recevoir six tuiles d'un bloc.
//
// Deux garde-fous : le décalage est plafonné (au-delà de six éléments, tout arrive
// ensemble, sinon le dernier se ferait attendre), et l'animation est entièrement
// désactivée quand l'utilisateur a demandé de réduire les mouvements.
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { DUREE, duree, useMouvementReduit } from '../../lib/mouvement';

/** Au-delà, le décalage cesse de croître : le dernier élément n'attend jamais plus. */
const RANG_MAX = 6;

export function Apparition({
  children,
  index = 0,
  style,
}: {
  children: ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduit = useMouvementReduit();
  const p = useSharedValue(reduit ? 1 : 0);

  useEffect(() => {
    if (reduit) {
      p.value = 1;
      return;
    }
    const retard = Math.min(index, RANG_MAX) * DUREE.decalage;
    p.value = withDelay(retard, withTiming(1, { duration: duree(DUREE.entree, reduit) }));
  }, [index, reduit, p]);

  const anim = useAnimatedStyle(() => ({
    opacity: p.value,
    // 10 points suffisent : un déplacement plus ample donnerait l'impression que la
    // page se réorganise, au lieu de simplement se révéler.
    transform: [{ translateY: (1 - p.value) * 10 }],
  }));

  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}
