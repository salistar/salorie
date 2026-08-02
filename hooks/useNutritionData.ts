import { useState, useEffect, useRef } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { getUserFromFirestore, getNutritionLogs, NutritionLog } from '../lib/firebase';

export function useNutritionData(date: string) {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState({
    calories: 2000,
    protein: 150,
    carbs: 250,
    fat: 70,
    water: 2000
  });
  const [consumed, setConsumed] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    water: 0
  });
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const isMounted = useRef(true);

  const fetchData = async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!user?.id || !email) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // 1. Fetch user profile for nutritional goals (keyed by email)
      const profile = await getUserFromFirestore(email, user.id);
      if (!isMounted.current) return;

      if (profile?.nutritionalPlan) {
        setGoals({
          calories: Number(profile.nutritionalPlan.dailyCalories) || 2000,
          protein: Number(profile.nutritionalPlan.proteins) || 150,
          carbs: Number(profile.nutritionalPlan.carbs) || 250,
          fat: Number(profile.nutritionalPlan.fats) || 70,
          water: (Number(profile.nutritionalPlan.waterIntake) || 2) * 1000
        });
      }

      // 2. Fetch logs for the selected date (keyed by email)
      const dailyLogs = await getNutritionLogs(email, date);
      if (!isMounted.current) return;

      setLogs(dailyLogs);

      // 3. Compute totals
      const totals = dailyLogs.reduce(
        (acc, log) => {
          if (log.type === 'activity') {
            acc.calories -= Number(log.calories) || 0;
          } else if (log.type === 'water') {
            // NOTE: pour les logs `type: 'water'`, le champ `calories` porte le volume
            // d'eau en ml (convention du modèle NutritionLog — cf. add-water.tsx où
            // `calories: ml`, et lib/healthExport.ts). Il n'existe pas de champ `water`
            // dédié sur le log ; on somme donc bien `calories` (= ml) dans `acc.water`.
            acc.water += Number(log.calories) || 0;
          } else {
            acc.calories += Number(log.calories) || 0;
            acc.protein += Number(log.protein) || 0;
            acc.carbs += Number(log.carbs) || 0;
            acc.fat += Number(log.fat) || 0;
          }
          return acc;
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 }
      );
      setConsumed(totals);
    } catch (error) {
      console.warn('useNutritionData fetch error:', error);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  // Fetch on mount and when date changes
  useEffect(() => {
    isMounted.current = true;
    fetchData();
    return () => { isMounted.current = false; };
  }, [user?.id, user?.primaryEmailAddress?.emailAddress, date]);

  // Safety timeout — never stay loading more than 10s
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        console.warn('useNutritionData: safety timeout, stopping loading');
        setLoading(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [loading]);

  return {
    loading,
    goals,
    consumed,
    logs,
    refresh: fetchData
  };
}
