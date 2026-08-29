import React, { useState, useMemo } from 'react';
import { directionAuto } from '../lib/rtl';
import { useTokens, Tokens } from '../constants/tokens';
import { a11y } from '../lib/a11y';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Pencil, X, Check, Flame, Beef, Wheat, Droplets } from 'lucide-react-native';
import HalfProgress from './HalfProgress';
import { useTranslation } from '../lib/i18n';
import { useTheme } from '../lib/ThemeContext';

const TXT: Record<string, {
  dailyTargets: string;
  adjustGoals: string;
  dailyCalories: string;
  protein: string;
  carbs: string;
  fats: string;
  updateGoals: string;
}> = {
  en: {
    dailyTargets: 'Daily Targets',
    adjustGoals: 'Adjust your nutritional goals',
    dailyCalories: 'Daily Calories',
    protein: 'Protein',
    carbs: 'Carbs',
    fats: 'Fats',
    updateGoals: 'Update Daily Goals',
  },
  fr: {
    dailyTargets: 'Objectifs quotidiens',
    adjustGoals: 'Ajustez vos objectifs nutritionnels',
    dailyCalories: 'Calories quotidiennes',
    protein: 'Protéines',
    carbs: 'Glucides',
    fats: 'Lipides',
    updateGoals: 'Mettre à jour les objectifs',
  },
  ar: {
    dailyTargets: 'الأهداف اليومية',
    adjustGoals: 'اضبط أهدافك الغذائية',
    dailyCalories: 'السعرات الحرارية اليومية',
    protein: 'البروتين',
    carbs: 'الكربوهيدرات',
    fats: 'الدهون',
    updateGoals: 'تحديث الأهداف اليومية',
  },
};

interface RemainingCaloriesCardProps {
  consumed?: number;
  goal?: number;
  protein?: number;
  proteinGoal?: number;
  carbs?: number;
  carbsGoal?: number;
  fat?: number;
  fatGoal?: number;
  onGoalUpdate?: (updates: {
    dailyCalories: number;
    proteins: number;
    carbs: number;
    fats: number;
  }) => void;
}

export default function RemainingCaloriesCard({
  consumed = 0,
  goal = 2000,
  protein = 0,
  proteinGoal = 150,
  carbs = 0,
  carbsGoal = 250,
  fat = 0,
  fatGoal = 70,
  onGoalUpdate,
}: RemainingCaloriesCardProps) {
  const { t, language, isRTL } = useTranslation() as any;
  const tx = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const k = useTokens();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);
  // Theme-aware surface so the card doesn't stay bright white on the dark home.
  const cardBg = k.surface;
  const titleColor = k.text;
  const subColor = k.textMuted;
  const valueColor = k.text;
  const statValueColor = k.text;
  const macroBg = isDark ? 'rgba(46,139,87,0.15)' : k.accentSoft;
  const tok = useTokens();
  const macroIconBg = tok.bg;
  const trackColor = k.border;
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : k.surfaceSunken;
  const [modalVisible, setModalVisible] = useState(false);
  const [inputs, setInputs] = useState({
    calories: String(goal),
    protein: String(proteinGoal),
    carbs: String(carbsGoal),
    fats: String(fatGoal),
  });

  const remaining = goal - consumed;
  const progress = Math.max(0, Math.min(1, consumed / goal));

  // The green arc ALWAYS starts at 0 and grows with progress — it never gets
  // "replaced" by red/yellow when thresholds are crossed, which was confusing.
  // Overshoot is signalled by the remaining number going negative (shown in red
  // by the caller), not by repainting the green arc.
  const getProgressColor = () => k.accent;

  const handleSave = () => {
    onGoalUpdate?.({
      dailyCalories: parseInt(inputs.calories, 10) || goal,
      proteins: parseInt(inputs.protein, 10) || proteinGoal,
      carbs: parseInt(inputs.carbs, 10) || carbsGoal,
      fats: parseInt(inputs.fats, 10) || fatGoal,
    });
    setModalVisible(false);
  };

  return (
    <>
      <View style={[styles.card, { backgroundColor: cardBg }, isDark && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }]}>
        {/* Header: Title + Edit Icon */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: titleColor }]}>{t('home.calories')}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('modifier')}
            style={styles.editIconBtn}
            activeOpacity={0.6}
            onPress={() => {
              setInputs({
                calories: String(goal),
                protein: String(proteinGoal),
                carbs: String(carbsGoal),
                fats: String(fatGoal),
              });
              setModalVisible(true);
            }}
          >
            <Pencil size={20} color={k.textMuted} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* Progress Section */}
        <View style={styles.progressContainer}>
          <HalfProgress
            progress={progress}
            size={240}
            strokeWidth={24}
            color={getProgressColor()}
            trackColor={trackColor}
          >
            <View style={styles.innerContent}>
              <Text
                style={[styles.remainingValue, { color: getProgressColor() }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {Math.abs(remaining).toLocaleString()}
              </Text>
              <Text style={[styles.remainingLabel, { color: subColor }]}>
                {consumed > goal ? t('home.kcal_over') : t('home.kcal_remaining')}
              </Text>
            </View>
          </HalfProgress>
        </View>

        {/* Macros Row */}
        <View style={styles.macrosGrid}>
          <View style={[styles.macroBox, { backgroundColor: macroBg }]}>
            <View style={[styles.macroIconCircle, { backgroundColor: macroIconBg }]}>
              <Beef size={22} color="#FF5C5C" />
            </View>
            <Text style={[styles.macroValue, { color: valueColor }]}>{Math.max(0, proteinGoal - protein)}g</Text>
            <Text style={[styles.macroName, { color: subColor }]}>{t('home.protein_left')}</Text>
          </View>

          <View style={[styles.macroBox, { backgroundColor: macroBg }]}>
            <View style={[styles.macroIconCircle, { backgroundColor: macroIconBg }]}>
              <Wheat size={22} color="#F59E0B" />
            </View>
            <Text style={[styles.macroValue, { color: valueColor }]}>{Math.max(0, carbsGoal - carbs)}g</Text>
            <Text style={[styles.macroName, { color: subColor }]}>{t('home.carbs_left')}</Text>
          </View>

          <View style={[styles.macroBox, { backgroundColor: macroBg }]}>
            <View style={[styles.macroIconCircle, { backgroundColor: macroIconBg }]}>
              <Droplets size={22} color="#0EA5E9" />
            </View>
            <Text style={[styles.macroValue, { color: valueColor }]}>{Math.max(0, fatGoal - fat)}g</Text>
            <Text style={[styles.macroName, { color: subColor }]}>{t('home.fat_left')}</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={[styles.statsRow, { borderTopColor: borderColor }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: subColor }]}>{t('home.goal')}</Text>
            <Text style={[styles.statValue, { color: statValueColor }]}>{goal.toLocaleString()} kcal</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: borderColor }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: subColor }]}>{t('home.consumed')}</Text>
            <Text style={[styles.statValue, { color: statValueColor }]}>{consumed.toLocaleString()} kcal</Text>
          </View>
        </View>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={[styles.modalOverlay, directionAuto()]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalCard, isDark && { backgroundColor: k.surface }]}>
            <View style={[styles.modalHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View>
                <Text style={[styles.modalTitle, { color: k.text, textAlign: isRTL ? 'right' : 'left' }]}>{tx.dailyTargets}</Text>
                <Text style={[styles.modalSubtitle, { color: k.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{tx.adjustGoals}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('fermer')} onPress={() => setModalVisible(false)} style={[styles.closeBtn, isDark && { backgroundColor: k.surfaceSunken }]}>
                <X size={24} color={k.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputSection}>
              {/* Calories Input */}
              <View style={styles.inputGroup}>
                <View style={[styles.labelRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.miniIconCircle, { backgroundColor: 'rgba(41, 143, 80, 0.1)' }]}>
                    <Flame size={16} color={k.accent} />
                  </View>
                  <Text style={[styles.inputLabel, { color: k.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{tx.dailyCalories}</Text>
                </View>
                <View style={[styles.textInputWrapper, isDark && { backgroundColor: k.surfaceSunken, borderColor: k.border }]}>
                  <TextInput
                    style={[styles.textInput, { color: k.text, textAlign: isRTL ? 'right' : 'left' }]}
                    value={inputs.calories}
                    onChangeText={(v) => setInputs(prev => ({ ...prev, calories: v }))}
                    accessibilityLabel={tx.dailyCalories}
                    keyboardType="numeric"
                    returnKeyType="done"
                    maxLength={5}
                    placeholder="2000"
                    placeholderTextColor={isDark ? '#9BA1A6' : undefined}
                  />
                  <Text style={styles.unitText}>kcal</Text>
                </View>
              </View>

              <View style={[styles.multiInputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {/* Protein Input */}
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <View style={[styles.labelRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <View style={[styles.miniIconCircle, { backgroundColor: 'rgba(255, 92, 92, 0.1)' }]}>
                      <Beef size={14} color="#FF5C5C" />
                    </View>
                    <Text style={[styles.inputLabel, { color: k.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{tx.protein}</Text>
                  </View>
                  <View style={[styles.textInputWrapper, isDark && { backgroundColor: k.surfaceSunken, borderColor: k.border }]}>
                    <TextInput
                      style={[styles.textInput, { fontSize: 16, color: k.text, textAlign: isRTL ? 'right' : 'left' }]}
                      value={inputs.protein}
                      onChangeText={(v) => setInputs(prev => ({ ...prev, protein: v }))}
                      accessibilityLabel={tx.protein}
                      keyboardType="numeric"
                      returnKeyType="done"
                      maxLength={4}
                      placeholder="g"
                      placeholderTextColor={isDark ? '#9BA1A6' : undefined}
                    />
                    <Text style={styles.unitText}>g</Text>
                  </View>
                </View>

                {/* Carbs Input */}
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <View style={[styles.labelRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <View style={[styles.miniIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                      <Wheat size={14} color="#F59E0B" />
                    </View>
                    <Text style={[styles.inputLabel, { color: k.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{tx.carbs}</Text>
                  </View>
                  <View style={[styles.textInputWrapper, isDark && { backgroundColor: k.surfaceSunken, borderColor: k.border }]}>
                    <TextInput
                      style={[styles.textInput, { fontSize: 16, color: k.text, textAlign: isRTL ? 'right' : 'left' }]}
                      value={inputs.carbs}
                      onChangeText={(v) => setInputs(prev => ({ ...prev, carbs: v }))}
                      accessibilityLabel={tx.carbs}
                      keyboardType="numeric"
                      returnKeyType="done"
                      maxLength={4}
                      placeholder="g"
                      placeholderTextColor={isDark ? '#9BA1A6' : undefined}
                    />
                    <Text style={styles.unitText}>g</Text>
                  </View>
                </View>

                {/* Fats Input */}
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <View style={[styles.labelRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <View style={[styles.miniIconCircle, { backgroundColor: 'rgba(14, 165, 233, 0.1)' }]}>
                      <Droplets size={14} color="#0EA5E9" />
                    </View>
                    <Text style={[styles.inputLabel, { color: k.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{tx.fats}</Text>
                  </View>
                  <View style={[styles.textInputWrapper, isDark && { backgroundColor: k.surfaceSunken, borderColor: k.border }]}>
                    <TextInput
                      style={[styles.textInput, { fontSize: 16, color: k.text, textAlign: isRTL ? 'right' : 'left' }]}
                      value={inputs.fats}
                      onChangeText={(v) => setInputs(prev => ({ ...prev, fats: v }))}
                      accessibilityLabel={tx.fats}
                      keyboardType="numeric"
                      returnKeyType="done"
                      maxLength={4}
                      placeholder="g"
                      placeholderTextColor={isDark ? '#9BA1A6' : undefined}
                    />
                    <Text style={styles.unitText}>g</Text>
                  </View>
                </View>
              </View>
            </View>

            <TouchableOpacity style={[styles.saveBtn, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={handleSave} activeOpacity={0.8}>
              <Check size={20} color="#fff" strokeWidth={3} />
              <Text style={styles.saveBtnText}>{tx.updateGoals}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  card: {
    backgroundColor: k.surface,
    borderRadius: 32,
    padding: 24,
    shadowColor: k.isDark ? 'transparent' : k.accent,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
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
    color: k.text,
    letterSpacing: -0.5,
  },
  editIconBtn: {
    padding: 8,
    marginRight: -8, // Offset padding for perfect alignment
  },
  progressContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 140, // Match half-circle height
    marginBottom: 10,
  },
  innerContent: {
    position: 'absolute',
    top: 60, // Position relative to HalfProgress arc center
    alignItems: 'center',
  },
  remainingValue: {
    fontSize: 48,
    fontWeight: '900',
    color: k.text,
    letterSpacing: -1.5,
  },
  remainingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: k.textMuted,
    marginTop: -4,
  },
  macrosGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    marginBottom: 20,
  },
  macroBox: {
    flex: 1,
    backgroundColor: k.accentSoft,
    borderRadius: 20,
    padding: 16, // More padding
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(41, 143, 80, 0.08)',
  },
  macroIconCircle: {
    width: 44, // Bigger
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  macroValue: {
    fontSize: 16, // Bigger
    fontWeight: '800',
    color: k.text,
  },
  macroName: {
    fontSize: 12, // Bigger
    fontWeight: '700',
    color: k.textMuted,
    marginTop: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: k.surfaceSunken,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: k.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: k.text,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: k.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: k.surface,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    padding: 32,
    paddingBottom: 48,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: k.text,
    letterSpacing: -0.5,
  },
  modalSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: k.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: k.surfaceSunken,
    padding: 8,
    borderRadius: 12,
  },
  inputSection: {
    gap: 24,
    marginBottom: 36,
  },
  inputGroup: {
    gap: 10,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 4,
  },
  miniIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: k.textMuted,
  },
  textInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: k.surfaceSunken,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: k.border,
  },
  textInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: k.text,
    paddingVertical: 14,
  },
  unitText: {
    fontSize: 14,
    fontWeight: '600',
    color: k.textMuted,
  },
  multiInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: k.accent,
    borderRadius: 18,
    paddingVertical: 18,
    gap: 10,
    shadowColor: k.isDark ? 'transparent' : k.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  saveBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
