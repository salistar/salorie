// Sélecteur de thème à six pastilles — le jumeau mobile de celui du web.
// ---------------------------------------------------------------------------
// Même ordre, mêmes noms, mêmes couleurs : `ORDRE_THEMES` et `THEMES` sortent
// du même design/themes.json que les pastilles de salorie.com. Un utilisateur
// qui choisit « Doré » sur son téléphone retrouve exactement la même pastille,
// au même rang, dans son espace membre.
//
// ⚠ « Auto » vient EN PREMIER, et n'est pas une septième couleur : c'est
// l'absence de choix, qui laisse le réglage du système décider. Le placer à la
// fin le ferait passer pour une palette de plus.

import React from 'react';
import { View, Text, Pressable, StyleSheet, AccessibilityRole } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme, ChoixTheme } from '../../lib/ThemeContext';
import { THEMES, ORDRE_THEMES } from '../../constants/themesGeneres';
import { useTokens } from '../../constants/tokens';

interface Props {
  /** Appelé après un choix — pour l'enregistrer côté profil, par exemple. */
  onChoix?: (choix: ChoixTheme) => void;
}

export default function SelecteurTheme({ onChoix }: Props) {
  const { choix, setTheme } = useTheme();
  const k = useTokens();

  const choisir = (c: ChoixTheme) => {
    setTheme(c);
    onChoix?.(c);
  };

  const pastille = (c: ChoixTheme, fond: string, bordure: string, libelle: string) => {
    const actif = choix === c;
    return (
      <Pressable
        key={c}
        onPress={() => choisir(c)}
        // La cible tactile fait 44 dp même si le disque n'en fait que 34 :
        // c'est le plancher au doigt, et un disque de 44 dp serait disgracieux.
        hitSlop={6}
        accessibilityRole={'radio' as AccessibilityRole}
        accessibilityState={{ selected: actif }}
        accessibilityLabel={libelle}
        style={[
          styles.pastille,
          { backgroundColor: fond, borderColor: actif ? k.accent : bordure },
          actif && styles.pastilleActive,
        ]}
      >
        {actif ? <Check size={16} color={k.accent} strokeWidth={3} /> : null}
      </Pressable>
    );
  };

  return (
    <View>
      <View style={styles.rangee} accessibilityRole={'radiogroup' as AccessibilityRole}>
        <Pressable
          onPress={() => choisir('system')}
          hitSlop={6}
          accessibilityRole={'radio' as AccessibilityRole}
          accessibilityState={{ selected: choix === 'system' }}
          style={[
            styles.auto,
            {
              backgroundColor: k.surfaceSunken,
              borderColor: choix === 'system' ? k.accent : k.border,
            },
          ]}
        >
          <Text style={[styles.autoTexte, { color: choix === 'system' ? k.accent : k.textMuted }]}>
            Auto
          </Text>
        </Pressable>

        {ORDRE_THEMES.map((cle) =>
          pastille(cle, THEMES[cle].bg, THEMES[cle].border, THEMES[cle].nom)
        )}
      </View>

      <Text style={[styles.legende, { color: k.textMuted }]}>
        {choix === 'system' ? 'Suit le réglage du téléphone' : THEMES[choix].nom}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // `wrap` : six pastilles plus « Auto » ne tiennent pas sur un écran étroit.
  // Sans lui, la dernière palette sortait du cadre — exactement le défaut
  // rencontré sur la barre latérale du web.
  rangee: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  pastille: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastilleActive: { borderWidth: 3 },
  auto: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoTexte: { fontSize: 12.5, fontWeight: '800' },
  legende: { marginTop: 10, fontSize: 12.5, fontWeight: '600' },
});
