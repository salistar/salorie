import React, { useState, useEffect } from 'react';
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

export default function LogModal() {
  const { user } = useUser();
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
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Add Log</Text>
            <TouchableOpacity onPress={hideLogModal} style={styles.closeBtn}>
              <X size={24} color={Colors.light.gray[500]} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Type Selector */}
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'meal' && styles.typeBtnActive]}
                onPress={() => setType('meal')}
              >
                <Utensils size={20} color={type === 'meal' ? Colors.light.white : Colors.light.gray[400]} />
                <Text style={[styles.typeText, type === 'meal' && styles.typeTextActive]}>Meal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'activity' && styles.typeBtnActive]}
                onPress={() => setType('activity')}
              >
                <Zap size={20} color={type === 'activity' ? Colors.light.white : Colors.light.gray[400]} />
                <Text style={[styles.typeText, type === 'activity' && styles.typeTextActive]}>Exercise</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'water' && styles.typeBtnActive]}
                onPress={() => setType('water')}
              >
                <Droplets size={20} color={type === 'water' ? Colors.light.white : Colors.light.gray[400]} />
                <Text style={[styles.typeText, type === 'water' && styles.typeTextActive]}>Water</Text>
              </TouchableOpacity>
            </View>

            {/* Water Input */}
            {type === 'water' ? (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Water Amount (ml)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 250"
                  keyboardType="numeric"
                  value={waterAmount}
                  onChangeText={setWaterAmount}
                />
              </View>
            ) : (
              <>
                {/* Basic Info */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={type === 'meal' ? "e.g. Chicken Salad" : "e.g. Running"}
                    value={name}
                    onChangeText={setName}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{type === 'meal' ? "Calories (kcal)" : "Calories Burned (kcal)"}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={calories}
                    onChangeText={setCalories}
                  />
                </View>

                {/* Macros Selection */}
                {type === 'meal' && (
                  <>
                    <Text style={styles.sectionTitle}>Macros (Optional)</Text>
                    <View style={styles.macrosGrid}>
                      <View style={styles.macroInput}>
                        <View style={[styles.macroIcon, { backgroundColor: '#FFEEED' }]}>
                          <Beef size={18} color="#FF5C5C" />
                        </View>
                        <TextInput
                          style={styles.smallInput}
                          placeholder="P"
                          keyboardType="numeric"
                          value={protein}
                          onChangeText={setProtein}
                        />
                        <Text style={styles.unit}>g</Text>
                      </View>

                      <View style={styles.macroInput}>
                        <View style={[styles.macroIcon, { backgroundColor: '#FFF9EB' }]}>
                          <Wheat size={18} color="#F59E0B" />
                        </View>
                        <TextInput
                          style={styles.smallInput}
                          placeholder="C"
                          keyboardType="numeric"
                          value={carbs}
                          onChangeText={setCarbs}
                        />
                        <Text style={styles.unit}>g</Text>
                      </View>

                      <View style={styles.macroInput}>
                        <View style={[styles.macroIcon, { backgroundColor: '#E0F2FE' }]}>
                          <Droplets size={18} color="#0EA5E9" />
                        </View>
                        <TextInput
                          style={styles.smallInput}
                          placeholder="F"
                          keyboardType="numeric"
                          value={fat}
                          onChangeText={setFat}
                        />
                        <Text style={styles.unit}>g</Text>
                      </View>
                    </View>
                  </>
                )}
              </>
            )}

            <View style={styles.dateTag}>
              <Text style={styles.dateTagText}>Logging for: {selectedDate}</Text>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <Text style={styles.saveBtnText}>Saving...</Text>
              ) : (
                <>
                  <Check size={20} color={Colors.light.white} strokeWidth={3} />
                  <Text style={styles.saveBtnText}>Save Entry</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: Colors.light.white,
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
    color: Colors.light.gray[800],
  },
  closeBtn: {
    padding: 4,
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.light.gray[100],
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
    color: Colors.light.gray[500],
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
    color: Colors.light.gray[600],
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: Colors.light.gray[50],
    borderWidth: 1.5,
    borderColor: Colors.light.gray[200],
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: Colors.light.gray[800],
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.gray[800],
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
    backgroundColor: Colors.light.gray[50],
    borderWidth: 1.5,
    borderColor: Colors.light.gray[200],
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
    color: Colors.light.gray[800],
    padding: 0,
  },
  unit: {
    fontSize: 12,
    color: Colors.light.gray[400],
    fontWeight: '600',
  },
  dateTag: {
    alignItems: 'center',
    marginBottom: 20,
  },
  dateTagText: {
    fontSize: 13,
    color: Colors.light.gray[400],
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
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: {
    backgroundColor: Colors.light.gray[300],
  },
  saveBtnText: {
    color: Colors.light.white,
    fontSize: 18,
    fontWeight: '800',
  },
});
