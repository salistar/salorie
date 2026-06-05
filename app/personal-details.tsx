import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator,
  Alert
} from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { 
  ChevronLeft, 
  Flame, 
  Beef, 
  Cherry, 
  Droplet, 
  Zap,
  CheckCircle2
} from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, emailToDocId } from '../lib/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';

export default function PersonalDetailsScreen() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [goals, setGoals] = useState({
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    water: ''
  });

  useEffect(() => {
    const fetchGoals = async () => {
      if (!user) return;
      try {
        // Email-keyed doc (consistent with the rest of the app: logs, weight,
        // nutritionalPlan are all stored under users/{emailToDocId}).
        const email = user.primaryEmailAddress?.emailAddress || '';
        const userDoc = await getDoc(doc(db, 'users', emailToDocId(email)));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const plan = data.nutritionalPlan || {};
          setGoals({
            calories: String(plan.calories || ''),
            protein: String(plan.protein || ''),
            carbs: String(plan.carbs || ''),
            fat: String(plan.fat || ''),
            water: String(plan.water || '')
          });
        }
      } catch (error) {
        console.error('Error fetching goals:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchGoals();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const email = user.primaryEmailAddress?.emailAddress || '';
      const docId = emailToDocId(email);
      const nutritionalPlan = {
        calories: Number(goals.calories),
        protein: Number(goals.protein),
        carbs: Number(goals.carbs),
        fat: Number(goals.fat),
        water: Number(goals.water),
      };

      // Email-keyed + merge so it always works and stays consistent app-wide.
      await setDoc(doc(db, 'users', docId), { nutritionalPlan }, { merge: true });
      // Refresh the local profile cache so Coach / Meal Plan pick up new targets.
      try {
        const key = `profile_${docId}`;
        const raw = await AsyncStorage.getItem(key);
        const prof = raw ? JSON.parse(raw) : {};
        prof.nutritionalPlan = { ...(prof.nutritionalPlan || {}), ...nutritionalPlan };
        await AsyncStorage.setItem(key, JSON.stringify(prof));
      } catch {}
      
      Alert.alert('Success', 'Your personal details have been updated.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      console.error('Error saving goals:', error);
      Alert.alert('Error', 'Failed to update details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const InputField = ({ label, value, onChangeText, placeholder, icon: Icon, unit, delay = 0 }: any) => (
    <Animated.View entering={FadeInRight.delay(delay).duration(600)} style={styles.inputContainer}>
      <View style={styles.labelRow}>
        <View style={styles.iconBackground}>
          <Icon size={18} color={Colors.light.primary} />
        </View>
        <Text style={styles.inputLabel}>{label}</Text>
      </View>
      <View style={styles.textInputWrapper}>
        <TextInput
          style={styles.textInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.light.gray[300]}
          keyboardType="numeric"
        />
        <Text style={styles.unitText}>{unit}</Text>
      </View>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.back()}
          >
            <ChevronLeft size={24} color={Colors.light.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Personal Details</Text>
          <View style={{ width: 44 }} />
        </View>

        {loading ? (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
          </View>
        ) : (
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.introSection}>
              <Text style={styles.introTitle}>Nutritional Targets</Text>
              <Text style={styles.introDesc}>Adjust your daily goals for optimal performance.</Text>
            </View>

            <InputField 
              label="Daily Calories" 
              value={goals.calories}
              onChangeText={(text: string) => setGoals({ ...goals, calories: text })}
              placeholder="e.g. 2500"
              icon={Flame}
              unit="kcal"
              delay={100}
            />

            <InputField 
              label="Proteins" 
              value={goals.protein}
              onChangeText={(text: string) => setGoals({ ...goals, protein: text })}
              placeholder="e.g. 150"
              icon={Beef}
              unit="g"
              delay={200}
            />

            <InputField 
              label="Carbohydrates" 
              value={goals.carbs}
              onChangeText={(text: string) => setGoals({ ...goals, carbs: text })}
              placeholder="e.g. 250"
              icon={Cherry}
              unit="g"
              delay={300}
            />

            <InputField 
              label="Fats" 
              value={goals.fat}
              onChangeText={(text: string) => setGoals({ ...goals, fat: text })}
              placeholder="e.g. 70"
              icon={Zap}
              unit="g"
              delay={400}
            />

            <InputField 
              label="Daily Water" 
              value={goals.water}
              onChangeText={(text: string) => setGoals({ ...goals, water: text })}
              placeholder="e.g. 2500"
              icon={Droplet}
              unit="ml"
              delay={500}
            />

            <Animated.View entering={FadeInDown.delay(600).duration(600)}>
              <TouchableOpacity 
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={Colors.light.white} />
                ) : (
                  <>
                    <CheckCircle2 color={Colors.light.white} size={20} />
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.light.gray[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.light.gray[900],
  },
  loadingWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  introSection: {
    marginBottom: 32,
  },
  introTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.light.gray[900],
    marginBottom: 8,
  },
  introDesc: {
    fontSize: 16,
    color: Colors.light.gray[400],
    fontWeight: '500',
    lineHeight: 22,
  },
  inputContainer: {
    marginBottom: 24,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  iconBackground: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.light.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.gray[600],
  },
  textInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.gray[50],
    borderRadius: 20,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: Colors.light.gray[100],
  },
  textInput: {
    flex: 1,
    height: 56,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.gray[900],
  },
  unitText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.light.primary,
  },
  saveButton: {
    backgroundColor: Colors.light.primary,
    height: 64,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.light.white,
  },
});
