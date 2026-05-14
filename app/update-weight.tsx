import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, Check, Scale } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { RulerPicker } from 'react-native-ruler-picker';
import { useUser } from '@clerk/clerk-expo';
import { saveUserToFirestore, addWeightLog } from '../lib/firebase';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function UpdateWeightScreen() {
  const { user } = useUser();
  const params = useLocalSearchParams();
  const initialWeight = parseFloat(params.currentWeight as string) || 70;
  
  const [weight, setWeight] = useState(initialWeight);
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!user || !email) return;
    setLoading(true);

    try {
      // 1. Update user's current weight in profile
      await saveUserToFirestore({
        id: user.id,
        email,
        weight: weight,
      });

      // 2. Log historical entry for trend tracking
      await addWeightLog(email, weight);

      Alert.alert('Success', 'Your weight has been updated!');
      router.back();
    } catch (error) {
      console.error('Error updating weight:', error);
      Alert.alert('Error', 'Failed to update weight. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={28} color={Colors.light.gray[900]} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.titleSection}>
        <Text style={styles.title}>Update Weight</Text>
        <Text style={styles.subtitle}>Select your current body weight in kg</Text>
      </View>

      <View style={styles.content}>
        <Animated.View entering={FadeInDown.duration(800)} style={styles.pickerContainer}>
          <View style={styles.iconContainer}>
            <Scale size={32} color={Colors.light.primary} />
          </View>
          
          <RulerPicker
            min={30}
            max={200}
            step={0.1}
            fractionDigits={1}
            initialValue={initialWeight}
            onValueChange={(val) => setWeight(parseFloat(val))}
            unit="kg"
            width={300}
            height={150}
            indicatorColor={Colors.light.primary}
            valueTextStyle={styles.rulerValueText}
            unitTextStyle={styles.rulerUnitText}
          />
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.updateBtn, loading && styles.disabledBtn]} 
          onPress={handleUpdate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.light.white} />
          ) : (
            <>
              <Check size={24} color={Colors.light.white} strokeWidth={3} />
              <Text style={styles.updateText}>Update Weight</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    marginBottom: 10,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.gray[50],
  },
  titleSection: {
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.light.gray[900],
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.light.gray[400],
    fontWeight: '600',
    marginTop: 4,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  pickerContainer: {
    alignItems: 'center',
    width: '100%',
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  rulerValueText: {
    fontSize: 64,
    fontWeight: '900',
    color: Colors.light.gray[900],
  },
  rulerUnitText: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.light.gray[400],
    marginTop: 10,
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
  },
  updateBtn: {
    backgroundColor: Colors.light.primary,
    height: 64,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  disabledBtn: {
    backgroundColor: Colors.light.gray[200],
    shadowOpacity: 0,
    elevation: 0,
  },
  updateText: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.light.white,
  },
});
