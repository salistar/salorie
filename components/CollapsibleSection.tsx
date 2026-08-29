// Section repliable (accordéon) — allègement Home/Analytics. En-tête tappable +
// chevron ; le contenu se déplie/replie. Animation de layout douce. Additif.
import React, { useState } from 'react';
import { flipAuto } from '../lib/rtl';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../lib/ThemeContext';
import { useTokens, Tokens } from '../constants/tokens';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  color?: string;
}

export default function CollapsibleSection({ title, defaultOpen = false, children, color }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const { resolved } = useTheme();
  const k = useTokens();
  const titleColor = k.text;
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };
  const tint = color || k.accent;
  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.header} activeOpacity={0.7} onPress={toggle}>
        <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
        {open ? <ChevronDown size={20} color={tint} /> : <View style={flipAuto()}><ChevronRight size={20} color={tint} /></View>}
      </TouchableOpacity>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 4,
  },
  // Pas de `color` ici : il est TOUJOURS surchargé par `titleColor` (theme-aware)
  // au point d'usage. Le laisser donnait l'illusion d'une couleur en dur.
  title: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  body: { marginTop: 4 },
});
