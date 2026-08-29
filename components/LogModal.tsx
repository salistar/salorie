import React, { useState, useEffect, useMemo } from 'react';
import { a11y } from '../lib/a11y';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { X, Check, Beef, Wheat, Droplets, Utensils, Zap } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { useLogging } from '../lib/LoggingContext';
import { addNutritionLog } from '../lib/firebase';
import { useUser } from '@clerk/clerk-expo';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { rowDir, txtAlign, directionAuto } from '../lib/rtl';
import { useTokens, Tokens } from '../constants/tokens';

export default function LogModal() {
  const { user } = useUser();
  // Cette modale s'ouvre depuis le bouton + de CHAQUE écran : la laisser en anglais
  // codé en dur faisait basculer de langue au geste le plus fréquent de l'app.
  const { t, isRTL } = useTranslation() as any;
  const { resolved } = useTheme();
  const k = useTokens();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);
  const { isLogModalVisible, hideLogModal, triggerRefresh, selectedDate, initialLogType } = useLogging();

  const [type, setType] = useState<'meal' | 'activity' | 'water'>(initialLogType);

  useEffect(() => {
    if (isLogModalVisible) {
      setType(initialLogType);
    }
  }, [isLogModalVisible, initialLogType]);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [waterAmount, setWaterAmount] = useState(''); // in Liters
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (type !== 'water' && (!name || !calories)) {
      Alert.alert('Error', 'Please enter a name and calorie amount');
      return;
    }
    if (type === 'water' && !waterAmount) {
      Alert.alert('Error', 'Please enter water amount');
      return;
    }

    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!user || !email) return;

    setLoading(true);
    try {
      await addNutritionLog({
        userId: email,
        type,
        name: type === 'water' ? 'Drinking Water' : name,
        calories: type === 'water' ? Number(waterAmount) : Number(calories),
        protein: type === 'water' ? 0 : Number(protein) || 0,
        carbs: type === 'water' ? 0 : Number(carbs) || 0,
        fat: type === 'water' ? 0 : Number(fat) || 0,
        date: selectedDate,
      });

      triggerRefresh();
      setName('');
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
      setWaterAmount('');
      hideLogModal();
    } catch (error) {
      console.error('Error saving log:', error);
      Alert.alert('Error', 'Failed to save log. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Dark-mode derived tokens (light path keeps the exact original Colors.light.* values)
  const sheetBg = k.surface;
  const inputCardBg = k.surfaceSunken;
  const inputBorder = k.border;
  const selectorBg = k.border;
  const textPrimary = k.text;
  const labelColor = k.textMuted;
  const mutedColor = k.textMuted;
  const typeTextColor = k.textMuted;
  const placeholderColor = isDark ? '#64748b' : undefined;

  return (
    <Modal
      visible={isLogModalVisible}
      transparent
      animationType="slide"
      onRequestClose={hideLogModal}
    >
      <KeyboardAvoidingView
        style={[styles.overlay, directionAuto()]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.content, { backgroundColor: sheetBg }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: textPrimary }]}>{t('logmodal.title')}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('fermer')} onPress={hideLogModal} style={styles.closeBtn}>
              <X size={24} color={k.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Type Selector */}
            <View style={[styles.typeSelector, { backgroundColor: selectorBg, flexDirection: rowDir(isRTL) }]}>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'meal' && styles.typeBtnActive]}
                onPress={() => setType('meal')}
              >
                <Utensils size={20} color={type === 'meal' ? k.surface : (k.textMuted)} />
                <Text style={[styles.typeText, { color: typeTextColor }, type === 'meal' && styles.typeTextActive]}>{t('logmodal.meal')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'activity' && styles.typeBtnActive]}
                onPress={() => setType('activity')}
              >
                <Zap size={20} color={type === 'activity' ? k.surface : (k.textMuted)} />
                <Text style={[styles.typeText, { color: typeTextColor }, type === 'activity' && styles.typeTextActive]}>{t('logmodal.exercise')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'water' && styles.typeBtnActive]}
                onPress={() => setType('water')}
              >
                <Droplets size={20} color={type === 'water' ? k.surface : (k.textMuted)} />
                <Text style={[styles.typeText, { color: typeTextColor }, type === 'water' && styles.typeTextActive]}>{t('logmodal.water')}</Text>
              </TouchableOpacity>
            </View>

            {/* Water Input */}
            {type === 'water' ? (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: labelColor, textAlign: txtAlign(isRTL) }]}>{t('logmodal.water_amount')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: inputCardBg, borderColor: inputBorder, color: textPrimary }]}
                  placeholder={t('logmodal.water_ph')}
                  accessibilityLabel={t('logmodal.water_a11y')}
                  placeholderTextColor={placeholderColor}
                  keyboardType="numeric"
                  returnKeyType="done"
                  maxLength={5}
                  value={waterAmount}
                  onChangeText={setWaterAmount}
                />
              </View>
            ) : (
              <>
                {/* Basic Info */}
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: labelColor, textAlign: txtAlign(isRTL) }]}>{t('logmodal.name')}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: inputCardBg, borderColor: inputBorder, color: textPrimary }]}
                    placeholder={type === 'meal' ? t('logmodal.meal_ph') : t('logmodal.activity_ph')}
                    accessibilityLabel={type === 'meal' ? t('logmodal.meal_name_a11y') : t('logmodal.activity_name_a11y')}
                    placeholderTextColor={placeholderColor}
                    returnKeyType="next"
                    maxLength={80}
                    value={name}
                    onChangeText={setName}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: labelColor, textAlign: txtAlign(isRTL) }]}>{type === 'meal' ? t('logmodal.calories') : t('logmodal.calories_burned')}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: inputCardBg, borderColor: inputBorder, color: textPrimary }]}
                    placeholder="0"
                    accessibilityLabel={type === 'meal' ? t('logmodal.calories_a11y') : t('logmodal.calories_burned_a11y')}
                    placeholderTextColor={placeholderColor}
                    keyboardType="numeric"
                    returnKeyType="done"
                    maxLength={5}
                    value={calories}
                    onChangeText={setCalories}
                  />
                </View>

                {/* Macros Selection */}
                {type === 'meal' && (
                  <>
                    <Text style={[styles.sectionTitle, { color: textPrimary, textAlign: txtAlign(isRTL) }]}>{t('logmodal.macros')}</Text>
                    <View style={[styles.macrosGrid, { flexDirection: rowDir(isRTL) }]}>
                      <View style={[styles.macroInput, { backgroundColor: inputCardBg, borderColor: inputBorder }]}>
                        <View style={[styles.macroIcon, { backgroundColor: k.dangerSoft }]}>
                          <Beef size={18} color="#FF5C5C" />
                        </View>
                        <TextInput
                          style={[styles.smallInput, { color: textPrimary }]}
                          placeholder="P"
                          accessibilityLabel={t('logmodal.protein_a11y')}
                          placeholderTextColor={placeholderColor}
                          keyboardType="numeric"
                          returnKeyType="done"
                          maxLength={4}
                          value={protein}
                          onChangeText={setProtein}
                        />
                        <Text style={[styles.unit, { color: mutedColor }]}>g</Text>
                      </View>

                      <View style={[styles.macroInput, { backgroundColor: inputCardBg, borderColor: inputBorder }]}>
                        <View style={[styles.macroIcon, { backgroundColor: k.warningSoft }]}>
                          <Wheat size={18} color={k.warning} />
                        </View>
                        <TextInput
                          style={[styles.smallInput, { color: textPrimary }]}
                          placeholder="C"
                          accessibilityLabel={t('logmodal.carbs_a11y')}
                          placeholderTextColor={placeholderColor}
                          keyboardType="numeric"
                          returnKeyType="done"
                          maxLength={4}
                          value={carbs}
                          onChangeText={setCarbs}
                        />
                        <Text style={[styles.unit, { color: mutedColor }]}>g</Text>
                      </View>

                      <View style={[styles.macroInput, { backgroundColor: inputCardBg, borderColor: inputBorder }]}>
                        <View style={[styles.macroIcon, { backgroundColor: k.infoSoft }]}>
                          <Droplets size={18} color={k.info} />
                        </View>
                        <TextInput
                          style={[styles.smallInput, { color: textPrimary }]}
                          placeholder="F"
                          accessibilityLabel={t('logmodal.fat_a11y')}
                          placeholderTextColor={placeholderColor}
                          keyboardType="numeric"
                          returnKeyType="done"
                          maxLength={4}
                          value={fat}
                          onChangeText={setFat}
                        />
                        <Text style={[styles.unit, { color: mutedColor }]}>g</Text>
                      </View>
                    </View>
                  </>
                )}
              </>
            )}

            <View style={styles.dateTag}>
              <Text style={[styles.dateTagText, { color: mutedColor }]}>{t('logmodal.logging_for')} {selectedDate}</Text>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <Text style={styles.saveBtnText}>{t('logmodal.saving')}</Text>
              ) : (
                <>
                  <Check size={20} color={k.surface} strokeWidth={3} />
                  <Text style={styles.saveBtnText}>{t('logmodal.save')}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: k.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: k.text,
  },
  closeBtn: {
    padding: 4,
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: k.border,
    borderRadius: 16,
    padding: 6,
    marginBottom: 24,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  typeBtnActive: {
    backgroundColor: k.accent,
  },
  typeText: {
    fontSize: 14,
    fontWeight: '700',
    color: k.textMuted,
  },
  typeTextActive: {
    color: k.surface,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: k.textMuted,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: k.surfaceSunken,
    borderWidth: 1.5,
    borderColor: k.border,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: k.text,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: k.text,
    marginTop: 8,
    marginBottom: 16,
  },
  macrosGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  macroInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: k.surfaceSunken,
    borderWidth: 1.5,
    borderColor: k.border,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 6,
  },
  macroIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: k.text,
    padding: 0,
  },
  unit: {
    fontSize: 12,
    color: k.textMuted,
    fontWeight: '600',
  },
  dateTag: {
    alignItems: 'center',
    marginBottom: 20,
  },
  dateTagText: {
    fontSize: 13,
    color: k.textMuted,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  saveBtn: {
    backgroundColor: k.accent,
    flexDirection: 'row',
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 32,
    shadowColor: k.isDark ? 'transparent' : k.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: {
    backgroundColor: k.textFaint,
  },
  saveBtnText: {
    color: k.surface,
    fontSize: 18,
    fontWeight: '800',
  },
});
