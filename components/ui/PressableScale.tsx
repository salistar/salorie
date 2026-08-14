// Surface tactile qui s'enfonce légèrement sous le doigt.
// ---------------------------------------------------------------------------
// C'est la micro-interaction qui sépare une app soignée d'une app fonctionnelle :
// l'élément répond AVANT que l'action n'aboutisse, donc l'utilisateur sait
// immédiatement qu'il a touché la bonne chose. 0,97 est délibérément discret —
// une carte qui s'écrase à 0,90 fait jouet.
//
// Le retour est piloté sur le fil d'affichage par Reanimated : il reste fluide même
// quand le fil JavaScript est occupé à analyser un scan, précisément le moment où
// l'utilisateur appuie et attend une réponse.
//
// Accessibilité : la zone tactile fait au moins 44 × 44 points (`hitSlop` comble ce
// qui manque), et le mouvement disparaît si l'utilisateur a demandé de réduire les
// animations.
import { forwardRef } from 'react';
import { Pressable, type PressableProps, type ViewStyle, type StyleProp } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { DUREE, duree, useMouvementReduit } from '../../lib/mouvement';
import { haptique } from '../../lib/haptique';

const PressableAnime = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = PressableProps & {
  style?: StyleProp<ViewStyle>;
  /** Échelle atteinte au doigt. 0,97 par défaut. */
  echelle?: number;
  /** Vibration légère à l'appui. Activée par défaut sur les cartes. */
  haptic?: boolean;
};

export const PressableScale = forwardRef<any, PressableScaleProps>(function PressableScale(
  { style, echelle = 0.97, haptic = true, onPressIn, onPressOut, children, ...reste },
  ref,
) {
  const reduit = useMouvementReduit();
  const v = useSharedValue(1);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: v.value }] }));

  return (
    <PressableAnime
      ref={ref}
      // `hitSlop` plutôt qu'une taille minimale imposée : la cible tactile grandit
      // sans que la mise en page bouge, donc on peut l'appliquer partout.
      hitSlop={8}
      style={[style, anim]}
      onPressIn={(e) => {
        v.value = withTiming(reduit ? 1 : echelle, { duration: duree(DUREE.appui, reduit) });
        if (haptic) haptique.appui();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        v.value = withTiming(1, { duration: duree(DUREE.appui, reduit) });
        onPressOut?.(e);
      }}
      {...reste}
    >
      {children as any}
    </PressableAnime>
  );
});
