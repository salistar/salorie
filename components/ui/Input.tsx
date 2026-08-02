// <Input> / <FormField> — champ de formulaire PREMIUM, theme-aware. Remplace les TextInput
// plats/neutres partout (auth, vitals, match-create, personal-details…). Icône, label,
// état focus (bordure primary), erreur, taille confortable (min 54px).
// #49 premium : micro-animation de focus (bordure primary + épaisseur + léger scale/glow)
// via l'API Animated de react-native (toujours dispo, pas de nouvelle dep, useNativeDriver:false
// car on anime couleur/bordure/ombre). Rétro-compatible : mêmes props, mêmes handlers.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TextInputProps, TextStyle, ViewStyle, Pressable, Animated } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { radius, spacing, type } from '../../constants/theme';

interface Props extends TextInputProps {
  label?: string;
  icon?: React.ReactNode;
  error?: string;
  right?: React.ReactNode;
  containerStyle?: ViewStyle;
}

// forwardRef : permet le chaînage entre champs (returnKeyType="next" → focus le suivant),
// impossible tant que <Input> était un composant simple sans ref.
export const Input = React.forwardRef<TextInput, Props>(function Input(
  { label, icon, error, right, containerStyle, secureTextEntry, style, onFocus, onBlur, ...rest }: Props,
  ref,
) {
  const { colors, resolved } = useTheme();
  const { isRTL } = useTranslation() as any;
  const [focused, setFocused] = useState(false);
  const [hide, setHide] = useState(!!secureTextEntry);
  const dir = isRTL ? 'row-reverse' : 'row';
  const fieldBg = resolved === 'dark' ? colors.gray[100] : colors.gray[50];
  const restCol = resolved === 'dark' ? colors.gray[200] : colors.gray[100];

  // 0 = repos, 1 = focus. Pilote couleur/épaisseur de bordure, scale et glow.
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: focused ? 1 : 0,
      duration: 180,
      useNativeDriver: false, // on anime borderColor/borderWidth/shadow → JS driver requis
    }).start();
  }, [focused, anim]);

  // En erreur, la bordure reste rouge quel que soit l'état d'animation.
  const animatedBorderColor = error
    ? colors.error
    : anim.interpolate({ inputRange: [0, 1], outputRange: [restCol, colors.primary] });
  const animatedBorderWidth = anim.interpolate({ inputRange: [0, 1], outputRange: [1.5, 2] });
  const animatedScale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.012] });
  const animatedShadowOpacity = error ? 0 : anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] });

  return (
    <View style={[{ marginBottom: spacing.md }, containerStyle]}>
      {!!label && (
        <Text style={{ ...(type.micro as TextStyle), color: colors.gray[500], marginBottom: 6, marginLeft: 2, textAlign: isRTL ? 'right' : 'left' }}>
          {label}
        </Text>
      )}
      <Animated.View style={{
        flexDirection: dir, alignItems: 'center', gap: spacing.sm,
        backgroundColor: fieldBg, borderRadius: radius.lg,
        borderWidth: animatedBorderWidth, borderColor: animatedBorderColor,
        paddingHorizontal: spacing.lg, minHeight: 54,
        transform: [{ scale: animatedScale }],
        // léger glow premium quand focus (ignoré sur web/anciennes versions sans souci)
        shadowColor: colors.primary, shadowOpacity: animatedShadowOpacity,
        shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
      }}>
        {icon}
        <TextInput
          ref={ref}
          {...rest}
          secureTextEntry={hide}
          placeholderTextColor={colors.gray[400]}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={[{ flex: 1, ...(type.body as TextStyle), color: colors.gray[900], paddingVertical: spacing.md, textAlign: isRTL ? 'right' : 'left' }, style as any]}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setHide((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            // Audit formulaires : la bascule œil n'était qu'une icône → invisible pour TalkBack.
            accessibilityLabel={hide ? 'Afficher le mot de passe' : 'Masquer le mot de passe'}
            accessibilityState={{ selected: !hide }}
          >
            {hide ? <EyeOff size={18} color={colors.gray[400]} /> : <Eye size={18} color={colors.gray[400]} />}
          </Pressable>
        ) : right}
      </Animated.View>
      {!!error && (
        // accessibilityLiveRegion : l'erreur est ANNONCÉE par TalkBack, pas seulement colorée.
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={{ ...(type.micro as TextStyle), color: colors.error, marginTop: 4, marginLeft: 2, textAlign: isRTL ? 'right' : 'left' }}
        >{error}</Text>
      )}
    </View>
  );
});

export default Input;
