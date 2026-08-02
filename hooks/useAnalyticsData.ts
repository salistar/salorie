import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, emailToDocId } from '../lib/firebase';
import { useUser } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';

const toLocalDateString = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Build the 7 local 'YYYY-MM-DD' keys for the current week (Mon→Sun).
// Anchored at local noon so day arithmetic never crosses a DST boundary,
// and keyed via toLocalDateString (same local format the logs are stored in) —
// no UTC/toISOString() shift. Shared by cache-path and remote-path.
const computeWeekDates = (): string[] => {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay; // days back to Monday
  // Anchor at local noon of *this Monday* using calendar components only.
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + mondayOffset,
    12, 0, 0, 0
  );
  const arr: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate() + i,
      12, 0, 0, 0
    );
    arr.push(toLocalDateString(d));
  }
  return arr;
};

export interface DailyActivity {
  date: string;
  hasActivity: boolean;
  dayName: string;
  consumedCalories: number;
  burnedCalories: number;
  waterConsumed: number;
}

export function useAnalyticsData() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [streakData, setStreakData] = useState<DailyActivity[]>([]);
  const [weeklyLogs, setWeeklyLogs] = useState<any[]>([]);
  const [weight, setWeight] = useState<number | null>(null);

  const fetchAnalytics = useCallback(async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    const docId = emailToDocId(email);
    console.log('[useAnalyticsData] fetch start — email:', email, 'docId:', docId);
    if (!user || !docId) {
      console.log('[useAnalyticsData] no user/email, aborting');
      setLoading(false);
      return;
    }
    setLoading(true);

    // ── helpers shared between cache-path and remote-path ─────────────────
    const buildWeekDates = () => computeWeekDates();

    const processLogs = (logs: any[], weekDates: string[]) => {
      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dailyConsumed: Record<string, number> = {};
      const dailyBurned: Record<string, number> = {};
      const dailyWater: Record<string, number> = {};
      const active = new Set<string>();
      logs.forEach((data: any) => {
        const date = data.date;
        const value = data.calories || 0;
        if (!weekDates.includes(date)) return;
        if (data.type === 'meal') dailyConsumed[date] = (dailyConsumed[date] || 0) + value;
        else if (data.type === 'activity') dailyBurned[date] = (dailyBurned[date] || 0) + value;
        else if (data.type === 'water') dailyWater[date] = (dailyWater[date] || 0) + value;
        active.add(date);
      });
      return weekDates.map((dateStr, idx) => ({
        date: dateStr,
        dayName: dayNames[idx],
        hasActivity: active.has(dateStr),
        consumedCalories: Math.round(dailyConsumed[dateStr] || 0),
        burnedCalories: Math.round(dailyBurned[dateStr] || 0),
        waterConsumed: Math.round(dailyWater[dateStr] || 0),
      }));
    };

    // ── Cache-first: show phone-stored data instantly ─────────────────────
    try {
      const [cachedLogsRaw, cachedProfileRaw] = await Promise.all([
        AsyncStorage.getItem(`logs_${docId}`),
        AsyncStorage.getItem(`profile_${docId}`),
      ]);
      if (cachedLogsRaw) {
        const cachedLogs: any[] = JSON.parse(cachedLogsRaw);
        console.log('[useAnalyticsData] cache hit — logs:', cachedLogs.length);
        if (cachedLogs.length > 0) {
          const weekDates = buildWeekDates();
          const weekLogs = cachedLogs.filter((l: any) => weekDates.includes(l.date));
          setWeeklyLogs(weekLogs);
          setStreakData(processLogs(cachedLogs, weekDates));
          setLoading(false);
        }
      }
      if (cachedProfileRaw) {
        const p = JSON.parse(cachedProfileRaw);
        if (p?.weight) setWeight(p.weight);
      }
    } catch (e) {
      console.warn('[useAnalyticsData] cache read failed', e);
    }

    try {
      // 1. Get dates for current week (Monday to Sunday) — local, DST-safe keys.
      const weekDates: string[] = computeWeekDates();
      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

      // 2. Fetch logs for this week — EMAIL-KEYED doc path
      const logsRef = collection(db, 'users', docId, 'logs');
      const q = query(
        logsRef,
        where('date', '>=', weekDates[0]),
        where('date', '<=', weekDates[6])
      );

      const querySnapshot = await getDocs(q);
      console.log('[useAnalyticsData] logs found for week:', querySnapshot.size);
      const rawLogs: any[] = [];
      const dailyConsumedMap: Record<string, number> = {};
      const dailyBurnedMap: Record<string, number> = {};
      const dailyWaterMap: Record<string, number> = {};
      const activeDays = new Set<string>();

      querySnapshot.forEach((d) => {
        const data = d.data();
        rawLogs.push(data);
        const date = data.date;
        const value = data.calories || 0;
        const type = data.type;

        if (type === 'meal') {
          dailyConsumedMap[date] = (dailyConsumedMap[date] || 0) + value;
        } else if (type === 'activity') {
          dailyBurnedMap[date] = (dailyBurnedMap[date] || 0) + value;
        } else if (type === 'water') {
          dailyWaterMap[date] = (dailyWaterMap[date] || 0) + value;
        }

        activeDays.add(date);
      });

      setWeeklyLogs(rawLogs);
      const processedStats: DailyActivity[] = weekDates.map((dateStr, index) => ({
        date: dateStr,
        dayName: dayNames[index],
        hasActivity: activeDays.has(dateStr),
        consumedCalories: Math.round(dailyConsumedMap[dateStr] || 0),
        burnedCalories: Math.round(dailyBurnedMap[dateStr] || 0),
        waterConsumed: Math.round(dailyWaterMap[dateStr] || 0),
      }));

      setStreakData(processedStats);
      console.log('[useAnalyticsData] streak computed, active days:', activeDays.size);

      // Refresh the local logs cache so the next mount hits cache-first.
      try {
        await AsyncStorage.setItem(`logs_${docId}`, JSON.stringify(rawLogs));
      } catch {}

      // Weight — EMAIL-KEYED
      const userDoc = await getDoc(doc(db, 'users', docId));
      if (userDoc.exists()) {
        const w = userDoc.data().weight || 0;
        setWeight(w);
        console.log('[useAnalyticsData] weight:', w);
      }
    } catch (error) {
      console.warn('[useAnalyticsData] fetch error:', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Safety timeout
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        console.warn('[useAnalyticsData] safety timeout');
        setLoading(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [loading]);

  return { loading, streakData, weight, weeklyLogs, refresh: fetchAnalytics };
}
