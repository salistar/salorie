import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { useLogging } from '../lib/LoggingContext';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { useUser } from '@clerk/clerk-expo';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, emailToDocId } from '../lib/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DAY_KEYS = ['days.sun', 'days.mon', 'days.tue', 'days.wed', 'days.thu', 'days.fri', 'days.sat'] as const;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DAY_ITEM_WIDTH = SCREEN_WIDTH / 7;

// ── helpers ────────────────────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Local-timezone YYYY-MM-DD formatter. IMPORTANT: never use toISOString here —
 * toISOString converts to UTC, so in +01:00 timezones a local-midnight Date
 * becomes the PREVIOUS day in ISO form, which caused taps on today to select
 * Sunday.
 */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build weeks as an array of weeks.
 * Each week is an array of 7 Date objects (Sun → Sat).
 * We generate past and future weeks relative to today.
 */
function buildWeeks(pastWeeks = 4, futureWeeks = 4): Date[][] {
  const today = startOfDay(new Date());
  const dayOfWeek = today.getDay(); // 0 = Sun
  const sundayOfCurrentWeek = new Date(today);
  sundayOfCurrentWeek.setDate(today.getDate() - dayOfWeek);

  const weeks: Date[][] = [];
  for (let w = -pastWeeks; w <= futureWeeks; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(sundayOfCurrentWeek);
      date.setDate(sundayOfCurrentWeek.getDate() + w * 7 + d);
      week.push(date);
    }
    weeks.push(week);
  }
  return weeks;
}

// ── types ──────────────────────────────────────────────────────────────────
interface DayItemProps {
  date: Date;
  isToday: boolean;
  isSelected: boolean;
  isFuture: boolean;
  consumed?: number;
  goal?: number;
  onPress: (date: Date) => void;
}

// ── DayItem ────────────────────────────────────────────────────────────────
const DayItem = React.memo(({ date, isToday, isSelected, isFuture, consumed, goal, onPress }: DayItemProps) => {
  const { resolved } = useTheme();
  const { t } = useTranslation();
  const isDark = resolved === 'dark';
  const dayLabel = t(DAY_KEYS[date.getDay()] as any);
  const dateNumber = date.getDate();

  return (
    <TouchableOpacity
      style={styles.dayItem}
      onPress={() => {
        if (isFuture) return;
        console.log('[WeekCalendar] day pressed:', toLocalDateString(date));
        onPress(date);
      }}
      activeOpacity={isFuture ? 1 : 0.6}
      disabled={isFuture}
      delayPressIn={0}
      pressRetentionOffset={{ top: 20, bottom: 20, left: 10, right: 10 }}
      hitSlop={{ top: 14, bottom: 18, left: 4, right: 4 }}
    >
      {/* Day name (DDD) */}
      <Text
        style={[
          styles.dayLabel,
          isDark && !isSelected && { color: '#ccc' },
          isToday && !isSelected && styles.dayLabelToday,
          isSelected && styles.dayLabelSelected,
          isFuture && !isSelected && !isToday && styles.dayLabelFuture,
        ]}
      >
        {dayLabel}
      </Text>

      {/* Date circle */}
      <View
        style={[
          styles.circle,
          isToday && styles.circleToday,
          isSelected && styles.circleSelected,
          isFuture && !isSelected && !isToday && styles.circleFuture,
          !isToday && !isSelected && !isFuture && styles.circlePast,
        ]}
      >
        <Text
          style={[
            styles.dateNumber,
            isDark && !isSelected && !isToday && { color: '#fff' },
            isToday && !isSelected && styles.dateNumberToday,
            isSelected && styles.dateNumberSelected,
            isFuture && !isSelected && !isToday && styles.dateNumberFuture,
            !isToday && !isSelected && !isFuture && !isDark && styles.dateNumberPast,
          ]}
        >
          {dateNumber}
        </Text>
      </View>

      {/* Today indicator dot – small and elegant below the circle */}
      {isToday && !isSelected && <View style={styles.todayIndicator} />}

      {/* Invisible placeholder for today + future so every cell has the SAME
          total content height as past cells (which carry a calorie label).
          Without this, past cells grow taller and — combined with our
          flex-start on dayItem — created a visual perception of mis-alignment
          between the top group (today + future) and the past circles.
          Now every cell reserves the label slot → all circles line up. */}
      {(isToday || isFuture) && (
        <Text style={[styles.caloriesLabel, { opacity: 0 }]}>
          {'+0'}
        </Text>
      )}

      {/* Past-day calories — three cases displayed as REMAINING:
            - Nothing logged → no label at all
            - Under goal     →  "+X kcal"  (green, calories still available)
            - At goal        →  "0 kcal"   (green, objective reached)
            - Over goal      →  "-X kcal"  (red, deficit / overshoot)
      */}
      {/* Past-day calories. Show for EVERY past day so the user always sees
          one of the 3 cases (+restant / 0 / -deficit). Goal falls back to
          2000 kcal when the profile cache hasn't loaded yet. */}
      {!isFuture && !isToday && (() => {
        const g = (goal != null && goal > 0) ? goal : 2000;
        const c = consumed || 0;
        const remaining = g - c;
        const over = remaining < 0;
        // D7: compact label — drop the verbose " kcal" suffix; the green/red
        // colour already conveys "remaining" vs "over". Keeps the week strip
        // readable (one clean number per day) instead of dense "+1570 kcal".
        const display = over
          ? `-${Math.abs(remaining)}`
          : remaining === 0
            ? '0'
            : `+${remaining}`;
        return (
          <Text style={[styles.caloriesLabel, { color: over ? '#EF4444' : '#10B981' }]}>
            {display}
          </Text>
        );
      })()}
    </TouchableOpacity>
  );
});

// ── WeekRow ────────────────────────────────────────────────────────────────
interface WeekRowProps {
  week: Date[];
  today: Date;
  selectedDate: Date;
  caloriesByDate: Record<string, number>;
  dailyGoal?: number;
  onPress: (date: Date) => void;
}

const WeekRow = React.memo(({ week, today, selectedDate, caloriesByDate, dailyGoal, onPress }: WeekRowProps) => (
  <View style={styles.weekRow}>
    {week.map((date) => {
      const key = toLocalDateString(date);
      return (
        <DayItem
          key={date.toISOString()}
          date={date}
          isToday={isSameDay(date, today)}
          isSelected={isSameDay(date, selectedDate)}
          isFuture={date > today}
          consumed={caloriesByDate[key]}
          goal={dailyGoal}
          onPress={onPress}
        />
      );
    })}
  </View>
));

// ── WeekCalendar ───────────────────────────────────────────────────────────
export default function WeekCalendar() {
  const { selectedDate, setSelectedDate } = useLogging();
  const { user } = useUser();
  const today = startOfDay(new Date());
  const pastWeeks = 52; // Allow scrolling back up to a full year
  const futureWeeks = 0; // Only current and previous weeks (no future logging)
  const [weeks] = useState(() => buildWeeks(pastWeeks, futureWeeks));
  const [caloriesByDate, setCaloriesByDate] = useState<Record<string, number>>({});
  const [dailyGoal, setDailyGoal] = useState<number | undefined>(undefined);
  const flatListRef = useRef<FlatList<Date[]>>(null);

  // Read daily calorie goal from the locally-cached profile so we can decide
  // the label color (green under goal, red over goal).
  useEffect(() => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    const docId = emailToDocId(email);
    if (!docId) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`profile_${docId}`);
        if (!raw) return;
        const p = JSON.parse(raw);
        const g = p?.nutritionalPlan?.dailyCalories || p?.dailyCalories;
        if (g) setDailyGoal(g);
      } catch {}
    })();
  }, [user?.primaryEmailAddress?.emailAddress]);

  // Fetch consumed calories for the last 60 days, display in green per past day
  useEffect(() => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    const docId = emailToDocId(email);
    if (!docId) return;
    console.log('[WeekCalendar] fetching past calories for', docId);
    const since = new Date();
    since.setDate(since.getDate() - 60);
    const sinceStr = toLocalDateString(since);
    (async () => {
      try {
        // Single-field range query → no composite index required.
        // We then filter for meal type in memory.
        const q = query(
          collection(db, 'users', docId, 'logs'),
          where('date', '>=', sinceStr),
        );
        const snap = await getDocs(q);
        const map: Record<string, number> = {};
        snap.forEach((d) => {
          const data = d.data();
          if (data.type !== 'meal') return;
          map[data.date] = (map[data.date] || 0) + (data.calories || 0);
        });
        console.log('[WeekCalendar] calories map days:', Object.keys(map).length);
        setCaloriesByDate(map);
      } catch (e) {
        console.warn('[WeekCalendar] fetch calories failed', e);
      }
    })();
  }, [user?.primaryEmailAddress?.emailAddress, selectedDate]);

  // current week is the last item
  const currentWeekIndex = weeks.length - 1;

  useEffect(() => {
    // Small delay to ensure layout is ready
    const timer = setTimeout(() => {
      flatListRef.current?.scrollToIndex({
        index: currentWeekIndex,
        animated: false,
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [currentWeekIndex]);

  const handleDayPress = useCallback(
    (date: Date) => {
      // Use LOCAL date string — toISOString would convert to UTC and shift
      // the day back by one in UTC+X timezones.
      setSelectedDate(toLocalDateString(date));
    },
    [setSelectedDate]
  );

  const renderItem = useCallback(
    ({ item }: { item: Date[] }) => (
      <WeekRow
        week={item}
        today={today}
        selectedDate={new Date(selectedDate)}
        caloriesByDate={caloriesByDate}
        dailyGoal={dailyGoal}
        onPress={handleDayPress}
      />
    ),
    [selectedDate, handleDayPress, today, caloriesByDate, dailyGoal]
  );

  const keyExtractor = useCallback(
    (item: Date[]) => item[0].toISOString(),
    []
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={weeks}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={currentWeekIndex}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        extraData={selectedDate}
        decelerationRate="fast"
        snapToInterval={SCREEN_WIDTH}
        scrollEventThrottle={16}
      />
    </View>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────
const CIRCLE_SIZE = 44;

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    paddingTop: 12,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.gray[100],
  },
  weekRow: {
    width: SCREEN_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    // No paddingHorizontal and no space-between: each day cell flexes to fill
    // its share of the row so there are NO dead zones between touch targets.
  },
  dayItem: {
    flex: 1,          // Every day cell takes an equal slice of the row
    alignItems: 'center',
    // Align to TOP (not center): past-day cells include a `caloriesLabel`
    // below the circle, today/future don't. Centering would push today's
    // circle up and past circles down so they stopped lining up across the
    // week. flex-start keeps every circle at the same Y.
    justifyContent: 'flex-start',
    paddingVertical: 8, // Vertical touch surface around the circle
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.gray[400],
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dayLabelToday: {
    color: Colors.light.primary,
    fontWeight: '800',
  },
  dayLabelSelected: {
    color: Colors.light.gray[900],
    fontWeight: '800',
  },
  dayLabelFuture: {
    color: Colors.light.gray[300],
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.light.gray[200], // Default border
  },
  circlePast: {
    backgroundColor: Colors.light.gray[50],
    borderColor: Colors.light.gray[200],
  },
  circleToday: {
    backgroundColor: Colors.light.primaryLight,
    borderColor: Colors.light.primary,
  },
  circleSelected: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primaryDark,
    borderWidth: 2,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  circleFuture: {
    borderColor: Colors.light.gray[200],
    borderStyle: 'dashed',
  },
  dateNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.gray[800],
  },
  dateNumberPast: {
    color: Colors.light.gray[600],
  },
  dateNumberToday: {
    color: Colors.light.primary,
  },
  dateNumberSelected: {
    color: '#FFFFFF', // Ensuring white is pure and forced
  },
  dateNumberFuture: {
    color: Colors.light.gray[300],
  },
  todayIndicator: {
    position: 'absolute',
    bottom: -12,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.light.primary,
  },
  caloriesLabel: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: '800',
    color: '#10B981', // GREEN
    letterSpacing: -0.2,
  },
});
