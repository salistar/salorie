import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../lib/ThemeContext';
import { Colors } from '../constants/Colors';

/**
 * Global screen background — gradient that switches based on theme.
 */
export default function ScreenBackground() {
  const { resolved } = useTheme();

  if (resolved === 'dark') {
    // Solid black background, no gradient
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000000' }]} pointerEvents="none" />
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <LinearGradient
        colors={[Colors.light.white, '#e8f5ec', Colors.light.primaryLight]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      {/* subtle brand glow anchored top-centre for depth */}
      <LinearGradient
        colors={['rgba(41,143,80,0.10)', 'rgba(41,143,80,0)']}
        locations={[0, 1]}
        style={[StyleSheet.absoluteFillObject, { height: 220 }]}
      />
    </View>
  );
}
