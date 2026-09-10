// <HeroImage> — POINT UNIQUE des héros/bannières photo (mutualise BrandBanner/coach/
// analytics/défis ; ne PAS créer de 5e conteneur d'image). Image + scrim dégradé pour
// lisibilité (light+dark) + texte optionnel (eyebrow / titre / valeur héro).
import React from 'react';
import { ImageBackground, View, Text, ImageSourcePropType, TextStyle, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from '../../lib/i18n';
import { radius, spacing, type, heroScrim } from '../../constants/theme';

interface Props {
  source: ImageSourcePropType;
  height?: number;
  eyebrow?: string;
  title?: string;
  value?: string;            // grosse valeur héro (ex: kcal)
  valueUnit?: string;
  rounded?: boolean;
  children?: React.ReactNode;
}

export default function HeroImage({ source, height = 150, eyebrow, title, value, valueUnit, rounded = true, children }: Props) {
  const { isRTL } = useTranslation() as any;
  const align: TextStyle = { textAlign: isRTL ? 'right' : 'left' };

  /**
   * ⚠ LE TEXTE D'UN HERO EST TOUJOURS BLANC, ET IL PORTE TOUJOURS UNE OMBRE.
   *
   * Le titre etait peint en `k.onAccent`. Ce jeton choisit entre blanc et
   * quasi-noir selon ce qui contraste avec l'ACCENT du theme — parfait pour du
   * texte pose SUR l'accent, faux ici : ce texte repose sur `heroScrim`, un
   * degrade noir fixe. Mesure du 10/09/2026 : les SIX themes donnent
   * `onAccent = #0B0B0B`. Le titre etait donc noir sur un voile noir, et n'etait
   * lisible que par accident, quand la photo dessous se trouvait claire.
   *
   * L'ombre repond a l'autre moitie du probleme, mesuree sur le meme ecran :
   * l'eyebrow, lui, etait blanc en dur — et rendait 1,33:1 sur la partie HAUTE
   * du voile, ou celui-ci ne pose que 5 % de noir. Blanc sur brocoli clair.
   * Aucune couleur unique ne peut convenir aux deux extremites d'un degrade sur
   * une photo quelconque ; une ombre portee, si.
   */
  // Le garde-fou « pas de couleur en dur » vise le texte pose sur une SURFACE
  // THEMEE, qui doit suivre les six palettes. Ici le fond n'est pas theme :
  // c'est `heroScrim`, un degrade noir FIXE pose sur une photo. Un jeton de
  // theme y serait le defaut, pas la solution — c'est exactement ce qui a casse
  // cet ecran. D'ou la levee, bornee a ces quatre lignes.
  /* eslint-disable no-restricted-syntax */
  const surPhoto: TextStyle = {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  };
  /* eslint-enable no-restricted-syntax */
  return (
    <View style={{ borderRadius: rounded ? radius.xl : 0, overflow: 'hidden', height }}>
      <ImageBackground source={source} resizeMode="cover" style={StyleSheet.absoluteFillObject as any}>
        <LinearGradient colors={heroScrim} style={StyleSheet.absoluteFillObject as any} />
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: spacing.xl }}>
          {!!eyebrow && <Text style={{ ...(type.eyebrow as TextStyle), ...surPhoto, ...align }}>{eyebrow}</Text>}
          {!!value && (
            <Text style={{ ...(type.hero as TextStyle), ...surPhoto, ...align }}>
              {value}{!!valueUnit && <Text style={{ ...(type.h2 as TextStyle), ...surPhoto }}> {valueUnit}</Text>}
            </Text>
          )}
          {!!title && <Text style={{ ...(type.h1 as TextStyle), ...surPhoto, ...align }} numberOfLines={2}>{title}</Text>}
          {children}
        </View>
      </ImageBackground>
    </View>
  );
}
