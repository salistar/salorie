import React, { useState } from 'react';
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
import { Pencil, X, Check, Beef, Wheat, Droplets, Flame } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import HalfProgress from './HalfProgress';

interface CaloriesCardProps {
  /** Calories consumed so far today */
  consumed?: number;
  /** Daily calorie goal */
  goal?: number;
  /** Macros consumed */
  protein?: number;
  proteinGoal?: number;
  carbs?: number;
  carbsGoal?: number;
  fat?: number;
  fatGoal?: number;
  /** Callback to update goal */
  onGoalUpdate?: (updates: {
    dailyCalories: number;
    proteins: number;
    carbs: number;
    fats: number;
  }) => void;
}

export default function CaloriesCard({
  consumed = 0,
  goal = 2000,
  protein = 0,
  proteinGoal = 150,
  carbs = 0,
  carbsGoal = 250,
  fat = 0,
  fatGoal = 70,
  onGoalUpdate,
}: CaloriesCardProps) {
  const [modalVisible, setModalVisible] = useState(false);
  
  // Local state for the multi-input form
  const [inputs, setInputs] = useState({
    calories: String(goal),
    protein: String(proteinGoal),
    carbs: String(carbsGoal),
    fats: String(fatGoal),
  });

  const remaining = Math.max(0, goal - consumed);
  const progress = Math.min(1, consumed / goal);
  const progressPct = Math.round(progress * 100);

  const remainingProtein = Math.max(0, proteinGoal - protein);
  const remainingCarbs = Math.max(0, carbsGoal - carbs);
  const remainingFat = Math.max(0, fatGoal - fat);

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
      <View style={styles.card}>
        {/* ── Row: title + edit icon ── */}
        <View style={styles.topRow}>
          <Text style={styles.title}>Calories</Text>
          <TouchableOpacity
            style={styles.editBtn}
            activeOpacity={0.7}
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
            <Pencil size={16} color={Colors.light.primary} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* ── Half-circle gauge ── */}
        <View style={styles.gaugeWrapper}>
          <HalfProgress
            progress={progress}
            size={220}
            strokeWidth={22}
            color={Colors.light.primary}
            trackColor={Colors.light.gray[100]}
          />

          {/* Labels centred below the arc opening */}
          <View style={styles.labelsOverlay}>
            <Text style={styles.remainingNumber}>{remaining.toLocaleString()}</Text>
            <Text style={styles.remainingLabel}>kcal remaining</Text>
          </View>
        </View>

        {/* ── Macros Grid ── */}
        <View style={styles.macrosContainer}>
          <View style={styles.macroItem}>
            <View style={[styles.macroIconWrapper, { backgroundColor: '#FFEEED' }]}>
              <Beef size={22} color="#FF5C5C" />
            </View>
            <View style={styles.macroTextContainer}>
              <Text style={styles.macroValue}>{remainingProtein}g</Text>
              <Text style={styles.macroLabel}>Protein left</Text>
            </View>
          </View>

          <View style={styles.macroItem}>
            <View style={[styles.macroIconWrapper, { backgroundColor: '#FFF9EB' }]}>
              <Wheat size={22} color="#F59E0B" />
            </View>
            <View style={styles.macroTextContainer}>
              <Text style={styles.macroValue}>{remainingCarbs}g</Text>
              <Text style={styles.macroLabel}>Carbs left</Text>
            </View>
          </View>

          <View style={styles.macroItem}>
            <View style={[styles.macroIconWrapper, { backgroundColor: '#E0F2FE' }]}>
              <Droplets size={22} color="#0EA5E9" />
            </View>
            <View style={styles.macroTextContainer}>
              <Text style={styles.macroValue}>{remainingFat}g</Text>
              <Text style={styles.macroLabel}>Fat left</Text>
            </View>
          </View>
        </View>

        {/* ── Stats row ── */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <View style={[styles.dot, { backgroundColor: Colors.light.gray[300] }]} />
            <Text style={styles.statLabel}>Goal</Text>
            <Text style={styles.statValue}>{goal.toLocaleString()}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.stat}>
            <View style={[styles.dot, { backgroundColor: Colors.light.primary }]} />
            <Text style={styles.statLabel}>Consumed</Text>
            <Text style={styles.statValue}>{consumed.toLocaleString()}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.stat}>
            <View style={[styles.dot, { backgroundColor: Colors.light.secondary }]} />
            <Text style={styles.statLabel}>Progress</Text>
            <Text style={styles.statValue}>{progressPct}%</Text>
          </View>
        </View>
      </View>

      {/* ── Edit goal modal ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Daily Goal</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color={Colors.light.gray[500]} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>Set your daily nutritional targets</Text>

            <View style={styles.modalInputsContainer}>
              <View style={styles.modalInputGroup}>
                <View style={styles.modalInputLabelRow}>
                  <Flame size={16} color={Colors.light.primary} />
                  <Text style={styles.modalInputLabel}>Daily Calories</Text>
                </View>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    value={inputs.calories}
                    onChangeText={(v) => setInputs(prev => ({ ...prev, calories: v }))}
                    keyboardType="numeric"
                    placeholder="2000"
                  />
                  <Text style={styles.inputUnit}>kcal</Text>
                </View>
              </View>

              <View style={styles.modalRow}>
                <View style={[styles.modalInputGroup, { flex: 1 }]}>
                  <View style={styles.modalInputLabelRow}>
                    <Beef size={16} color="#FF5C5C" />
                    <Text style={styles.modalInputLabel}>Proteins</Text>
                  </View>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={[styles.input, styles.smallInput]}
                      value={inputs.protein}
                      onChangeText={(v) => setInputs(prev => ({ ...prev, protein: v }))}
                      keyboardType="numeric"
                      placeholder="g"
                    />
                    <Text style={styles.inputUnit}>g</Text>
                  </View>
                </View>

                <View style={[styles.modalInputGroup, { flex: 1 }]}>
                  <View style={styles.modalInputLabelRow}>
                    <Wheat size={16} color="#F59E0B" />
                    <Text style={styles.modalInputLabel}>Carbs</Text>
                  </View>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={[styles.input, styles.smallInput]}
                      value={inputs.carbs}
                      onChangeText={(v) => setInputs(prev => ({ ...prev, carbs: v }))}
                      keyboardType="numeric"
                      placeholder="g"
                    />
                    <Text style={styles.inputUnit}>g</Text>
                  </View>
                </View>

                <View style={[styles.modalInputGroup, { flex: 1 }]}>
                  <View style={styles.modalInputLabelRow}>
                    <Droplets size={16} color="#0EA5E9" />
                    <Text style={styles.modalInputLabel}>Fats</Text>
                  </View>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={[styles.input, styles.smallInput]}
                      value={inputs.fats}
                      onChangeText={(v) => setInputs(prev => ({ ...prev, fats: v }))}
                      keyboardType="numeric"
                      placeholder="g"
                    />
                    <Text style={styles.inputUnit}>g</Text>
                  </View>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <Check size={18} color="#fff" strokeWidth={2.5} />
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // ── Card ──────────────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.light.white,
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 4,
  },

  // ── Top row ───────────────────────────────────────────────────────
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.light.gray[800],
  },
  editBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.light.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Gauge ─────────────────────────────────────────────────────────
  gaugeWrapper: {
    alignItems: 'center',
    marginTop: 8,
  },
  labelsOverlay: {
    alignItems: 'center',
    marginTop: 8,
  },
  remainingNumber: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.light.gray[800],
    letterSpacing: -1,
  },
  remainingLabel: {
    fontSize: 13,
    color: Colors.light.gray[400],
    marginTop: 2,
    fontWeight: '500',
  },

  // ── Stats row ─────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.gray[100],
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.light.gray[400],
    fontWeight: '500',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.gray[700],
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.light.gray[100],
  },

  // ── Macros Grid ──────────────────────────────────────────────────
  macrosContainer: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12, // Gap between cards
  },
  macroItem: {
    flex: 1,
    backgroundColor: Colors.light.primaryLight,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroIconWrapper: {
    width: 44, // Bigger wrapper
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  macroTextContainer: {
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 16, // Bigger value
    fontWeight: '800',
    color: Colors.light.gray[800],
  },
  macroLabel: {
    fontSize: 12, // Bigger label
    color: Colors.light.gray[500],
    fontWeight: '600',
    marginTop: 2,
  },

  // ── Modal ─────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.light.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.gray[800],
  },
  modalSub: {
    fontSize: 13,
    color: Colors.light.gray[400],
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.light.gray[200],
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
    backgroundColor: Colors.light.gray[50],
  },
  input: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: Colors.light.gray[800],
    paddingVertical: 14,
  },
  inputUnit: {
    fontSize: 15,
    color: Colors.light.gray[400],
    fontWeight: '600',
    marginLeft: 8,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.primary,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Multi-Goal Modal Styles ─────────────────────────────────────────
  modalInputsContainer: {
    gap: 16,
    marginBottom: 24,
  },
  modalInputGroup: {
    gap: 8,
  },
  modalInputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 4,
  },
  modalInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.gray[600],
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.gray[50],
    borderWidth: 1.5,
    borderColor: Colors.light.gray[200],
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  smallInput: {
    fontSize: 16,
    paddingVertical: 12,
  },
});
