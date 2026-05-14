import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { Pencil } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { useTranslation } from '../lib/i18n';
import { useTheme } from '../lib/ThemeContext';

const { width } = Dimensions.get('window');
const CARD_PADDING = 24;
const GRID_GAP = 8;
const AVAILABLE_WIDTH = width - (CARD_PADDING * 2) - 32; // Allow some margin
const MAX_GLASSES = 9;
const GLASS_SIZE = (AVAILABLE_WIDTH - (GRID_GAP * (MAX_GLASSES - 1))) / MAX_GLASSES;

interface WaterIntakeCardProps {
  consumedMl?: number;
  goalMl?: number;
  onEditPress?: () => void;
}

export default function WaterIntakeCard({
  consumedMl = 0,
  goalMl = 2000,
  onEditPress,
}: WaterIntakeCardProps) {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  // Logic: Scale goal to exactly 9 glasses if goal is defined
  const glassCapacity = goalMl / MAX_GLASSES;
  const consumedGlasses = consumedMl / glassCapacity;

  // Render glasses logic
  const renderGlasses = () => {
    const glasses = [];
    for (let i = 0; i < MAX_GLASSES; i++) {
      let imageSource;
      if (i + 1 <= consumedGlasses) {
        imageSource = require('../assets/images/full_glass.png');
      } else if (i < consumedGlasses && i + 1 > consumedGlasses) {
        imageSource = require('../assets/images/half_glass.png');
      } else {
        imageSource = require('../assets/images/empty_glass.png');
      }

      glasses.push(
        <View key={i} style={styles.glassWrapper}>
          <Image source={imageSource} style={styles.glassImage} resizeMode="contain" />
        </View>
      );
    }
    return glasses;
  };

  const remainingMl = Math.max(0, goalMl - consumedMl);

  return (
    <View style={[styles.card, resolved === 'dark' && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('home.water')}</Text>
        <TouchableOpacity style={styles.editBtn} activeOpacity={0.6} onPress={onEditPress}>
          <Pencil size={20} color={Colors.light.gray[400]} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <View style={styles.glassesContainer}>
        <View style={styles.glassesRow}>{renderGlasses()}</View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {Math.round(remainingMl)}{t('home.ml_left')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.white,
    borderRadius: 32,
    padding: CARD_PADDING,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
    marginTop: 20,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.light.gray[900],
    letterSpacing: -0.5,
  },
  editBtn: {
    padding: 8,
    marginRight: -8,
  },
  glassesContainer: {
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassesRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
    justifyContent: 'center',
    width: '100%',
  },
  glassWrapper: {
    width: GLASS_SIZE,
    height: GLASS_SIZE * 1.3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassImage: {
    width: '100%',
    height: '100%',
  },
  footer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.gray[50],
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.gray[500],
    fontStyle: 'italic',
  },
});
