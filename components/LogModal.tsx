import React, { useState, useEffect, useMemo } from 'react';
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
import { rowDir, txtAlign } from '../lib/rtl';

export default function LogModal() {
  const { user } = useUser();
  // Cette modale s'ouvre depuis le bouton + de CHAQUE écran : la laisser en anglais
  // codé en dur faisait basculer de langue au geste le plus fréquent de l'app.
  const { t, isRTL } = useTranslation() as any;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
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
  const sheetBg = isDark ? '#161C23' : Colors.light.white;
  const inputCardBg = isDark ? '#1e293b' : Colors.light.gray[50];
  const inputBorder = isDark ? '#283241' : Colors.light.gray[200];
  const selectorBg = isDark ? '#0f1419' : Colors.light.gray[100];
  const textPrimary = isDark ? '#f1f5f9' : Colors.light.gray[800];
  const labelColor = isDark ? '#94a3b8' : Colors.light.gray[600];
  const mutedColor = isDark ? '#94a3b8' : Colors.light.gray[400];
  const typeTextColor = isDark ? '#94a3b8' : Colors.light.gray[500];
  const placeholderColor = isDark ? '#64748b' : undefined;

  return (
    <Modal
      visible={isLogModalVisible}
      transparent
      animationType="slide"
      onRequestClose={hideLogModal}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.content, { backgroundColor: sheetBg }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: textPrimary }]}>{t('logmodal.title')}</Text>
            <TouchableOpacity onPress={hideLogModal} style={styles.closeBtn}>
              <X size={24} color={isDark ? Colors.dark.gray[500] : Colors.light.gray[500]} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Type Selector */}
            <View style={[styles.typeSelector, { backgroundColor: selectorBg, flexDirection: rowDir(isRTL) }]}>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'meal' && styles.typeBtnActive]}
                onPress={() => setType('meal')}
              >
                <Utensils size={20} color={type === 'meal' ? Colors.light.white : (isDark ? '#94a3b8' : Colors.light.gray[400])} />
                <Text style={[styles.typeText, { color: typeTextColor }, type === 'meal' && styles.typeTextActive]}>{t('logmodal.meal')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'activity' && styles.typeBtnActive]}
                onPress={() => setType('activity')}
              >
                <Zap size={20} color={type === 'activity' ? Colors.light.white : (isDark ? '#94a3b8' : Colors.light.gray[400])} />
                <Text style={[styles.typeText, { color: typeTextColor }, type === 'activity' && styles.typeTextActive]}>{t('logmodal.exercise')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'water' && styles.typeBtnActive]}
                onPress={() => setType('water')}
              >
                <Droplets size={20} color={type === 'water' ? Colors.light.white : (isDark ? '#94a3b8' : Colors.light.gray[400])} />
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
                        <View style={[styles.macroIcon, { backgroundColor: '#FFEEED' }]}>
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
                        <View style={[styles.macroIcon, { backgroundColor: '#FFF9EB' }]}>
                          <Wheat size={18} color="#F59E0B" />
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
                        <View style={[styles.macroIcon, { backgroundColor: '#E0F2FE' }]}>
                          <Droplets size={18} color="#0EA5E9" />
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
                  <Check size={20} color={Colors.light.white} strokeWidth={3} />
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
const makeStyles = (isDark: boolean) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: isDark ? Colors.dark.card : Colors.light.white,
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
    color: isDark ? Colors.dark.gray[800] : Colors.light.gray[800],
  },
  closeBtn: {
    padding: 4,
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: isDark ? Colors.dark.gray[100] : Colors.light.gray[100],
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
    backgroundColor: Colors.light.primary,
  },
  typeText: {
    fontSize: 14,
    fontWeight: '700',
    color: isDark ? Colors.dark.gray[500] : Colors.light.gray[500],
  },
  typeTextActive: {
    color: Colors.light.white,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: isDark ? Colors.dark.gray[600] : Colors.light.gray[600],
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    borderWidth: 1.5,
    borderColor: isDark ? Colors.dark.gray[200] : Colors.light.gray[200],
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: isDark ? Colors.dark.gray[800] : Colors.light.gray[800],
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: isDark ? Colors.dark.gray[800] : Colors.light.gray[800],
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
    backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    borderWidth: 1.5,
    borderColor: isDark ? Colors.dark.gray[200] : Colors.light.gray[200],
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
    color: isDark ? Colors.dark.gray[800] : Colors.light.gray[800],
    padding: 0,
  },
  unit: {
    fontSize: 12,
    color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400],
    fontWeight: '600',
  },
  dateTag: {
    alignItems: 'center',
    marginBottom: 20,
  },
  dateTagText: {
    fontSize: 13,
    color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400],
    fontWeight: '500',
    fontStyle: 'italic',
  },
  saveBtn: {
    backgroundColor: Colors.light.primary,
    flexDirection: 'row',
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 32,
    shadowColor: isDark ? 'transparent' : Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: {
    backgroundColor: isDark ? Colors.dark.gray[300] : Colors.light.gray[300],
  },
  saveBtnText: {
    color: Colors.light.white,
    fontSize: 18,
    fontWeight: '800',
  },
});
