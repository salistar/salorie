import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  SafeAreaView, 
  Dimensions,
  Platform,
  ActivityIndicator
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Flame, Check, ArrowLeft } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { useLogging } from '../lib/LoggingContext';
import { addNutritionLog } from '../lib/firebase';
import { useUser } from '@clerk/clerk-expo';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

export default function WorkoutResultScreen() {
  const { user } = useUser();
  const { selectedDate, triggerRefresh } = useLogging();
  const params = useLocalSearchParams();
  const { calories, name, duration } = params;

  const [loading, setLoading] = useState(false);

  const handleLog = async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!user || !email) return;
    setLoading(true);

    try {
      await addNutritionLog({
        userId: email,
        type: 'activity',
        name: (name as string).split(' (')[0] || 'Workout',
        calories: parseFloat(calories as string),
        protein: 0,
        carbs: 0,
        fat: 0,
        date: selectedDate,
        intensity: (name as string).match(/\((.*?)\)/)?.[1] || 'Medium',
        duration: parseInt(duration as string),
      });
      triggerRefresh();
      router.replace('/(tabs)' as any);
    } catch (error) {
      console.error('Error logging activity:', error);
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
      </View>

      <View style={styles.content}>
        <Animated.View 
          entering={ZoomIn.duration(600).springify()}
          style={styles.fireWrapper}
        >
          <View style={styles.fireCircle}>
            <Flame size={80} color="#FF5C5C" strokeWidth={2.5} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).duration(600)}>
          <Text style={styles.subtitle}>Your workout burned</Text>
          <Text style={styles.calories}>{calories} kcal</Text>
          <Text style={styles.info}>{name} • {duration} min</Text>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.logBtn, loading && styles.disabledBtn]}
          onPress={handleLog}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.light.white} />
          ) : (
            <>
              <Check size={24} color={Colors.light.white} strokeWidth={3} />
              <Text style={styles.logText}>Log Workout</Text>
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
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.gray[50],
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  fireWrapper: {
    marginBottom: 40,
  },
  fireCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#FFEEED',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF5C5C',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 5,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.gray[500],
    textAlign: 'center',
    marginBottom: 12,
  },
  calories: {
    fontSize: 72,
    fontWeight: '900',
    color: Colors.light.gray[900],
    textAlign: 'center',
    letterSpacing: -2,
  },
  info: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.gray[400],
    textAlign: 'center',
    marginTop: 16,
  },
  footer: {
    padding: 32,
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
  },
  logBtn: {
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
  logText: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.light.white,
  },
});
