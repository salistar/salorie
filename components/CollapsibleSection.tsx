// Section repliable (accordéon) — allègement Home/Analytics. En-tête tappable +
// chevron ; le contenu se déplie/replie. Animation de layout douce. Additif.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { Colors } from '../constants/Colors';

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
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };
  const tint = color || Colors.light.primary;
  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.header} activeOpacity={0.7} onPress={toggle}>
        <Text style={styles.title}>{title}</Text>
        {open ? <ChevronDown size={20} color={tint} /> : <ChevronRight size={20} color={tint} />}
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
  title: { fontSize: 16, fontWeight: '800', color: Colors.light.gray[900], letterSpacing: -0.2 },
  body: { marginTop: 4 },
});
