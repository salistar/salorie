import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '../lib/ThemeContext';

interface AppBrandProps {
  size?: 'small' | 'medium' | 'large';
  centered?: boolean;
}

export default function AppBrand({ size = 'small', centered = false }: AppBrandProps) {
  const { colors } = useTheme();
  const config = {
    small: { logo: 28, wrap: 36, radius: 10, font: 18 },
    medium: { logo: 44, wrap: 56, radius: 16, font: 24 },
    large: { logo: 70, wrap: 90, radius: 24, font: 34 },
  }[size];

  return (
    <View style={[styles.row, centered && styles.centered]}>
      <View
        style={{
          width: config.wrap,
          height: config.wrap,
          borderRadius: config.radius,
          backgroundColor: colors.primaryLight,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image
          source={require('../assets/images/fire.png')}
          style={{ width: config.logo, height: config.logo }}
          resizeMode="contain"
        />
      </View>
      <Text style={[styles.brand, { fontSize: config.font, color: colors.primary }]}>Salorie</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  centered: {
    alignSelf: 'center',
  },
  brand: {
    fontWeight: '900',
    letterSpacing: -0.5,
  },
});
