// <HeroImage> — POINT UNIQUE des héros/bannières photo (mutualise BrandBanner/coach/
// analytics/défis ; ne PAS créer de 5e conteneur d'image). Image + scrim dégradé pour
// lisibilité (light+dark) + texte optionnel (eyebrow / titre / valeur héro).
import React from 'react';
import { ImageBackground, View, Text, ImageSourcePropType, TextStyle, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from '../../lib/i18n';
import { radius, spacing, type, heroScrim } from '../../constants/theme';

/**
 * ⚠ QUI VA OU : l'inversion coute cher, et elle a deja eu lieu.
 *   `eyebrow` — la PHRASE descriptive. Petit corps, plusieurs mots admis.
 *   `title`   — le NOM COURT de l'ecran. Rendu en h1, borne a DEUX lignes :
 *               tout ce qui depasse est coupe, sans avertissement.
 * L'ecran Progres passait l'inverse — « Tendances, series et insights IA de ta
 * semaine. » en `title` — et le rendu arabe se terminait par « ورؤى ال. »,
 * tronque en plein mot. Corrige le 10/09/2026 ; `defis.tsx` est la reference.
 */
interface Props {
  source: ImageSourcePropType;
  height?: number;
  /** La phrase descriptive (petit corps). */
  eyebrow?: string;
  /** Le nom court de l'ecran (h1, DEUX lignes maximum). */
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
        {/* ⚠ UN SECOND VOILE, CALE SUR LE TEXTE — ET EN CALQUE, PAS DANS LE FLUX.
            `heroScrim` couvre toute la hauteur : presque transparent en haut
            (5 % de noir), opaque en bas (72 %). Or le bloc de texte est ancre EN
            BAS et grandit vers le HAUT — un titre sur deux lignes fait remonter
            l'eyebrow dans la zone claire. Mesure du 10/09/2026 sur l'ecran
            Progres, photo de brocoli : l'eyebrow blanc rendait 1,33:1, puis
            2,52:1 une fois l'ombre portee ajoutee. Toujours sous 4,5:1.

            Assombrir `heroScrim` davantage n'est pas la reponse : il faudrait
            environ 50 % de noir des le haut de l'IMAGE, et la photo ne se
            verrait plus.

            Deux erreurs avant d'arriver ici, toutes deux vues a l'ecran :
              un degrade a deux paliers ENVELOPPANT le texte — transparent
                exactement la ou se pose l'eyebrow, qui n'y gagnait que 0,2 point.
              trois paliers avec du `paddingTop` pour donner de la course — le
                degrade devenait juste, mais la marge poussait le bloc hors du
                bandeau, dont la hauteur est FIXE : la deuxieme ligne du titre se
                retrouvait coupee. Un defaut echange contre un autre.

            En calque absolu sur les 72 % du bas, il assombrit ce qu'il faut sans
            toucher a la mise en page. */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.52)', 'rgba(0,0,0,0.78)']}
          locations={[0, 0.45, 1]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '72%' }}
          pointerEvents="none"
        />
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: spacing.xl }}>
          {/* ⚠ L'EYEBROW PORTE UN HALO PLUS FRANC QUE LE RESTE, ET C'EST DELIBERE.
              Il est le PREMIER element d'un bloc ancre en bas : quand le titre
              prend deux lignes, il remonte jusqu'en haut du bandeau, hors de
              portee du voile. Et sur un hero de 150 px le bloc occupe presque
              toute la hauteur — il ne reste aucune zone claire a preserver, donc
              aucun degrade ne peut le couvrir sans noyer la photo entiere.
              Un halo serre, lui, ne depend pas de la position. */}
          {!!eyebrow && (
            <Text style={{
              ...(type.eyebrow as TextStyle),
              ...surPhoto,
              /* eslint-disable-next-line no-restricted-syntax -- meme raison que `surPhoto` */
              textShadowColor: 'rgba(0,0,0,0.95)',
              textShadowRadius: 6,
              ...align,
            }}>{eyebrow}</Text>
          )}
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
