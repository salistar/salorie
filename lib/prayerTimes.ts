// Horaires de prière (Fajr = fin du suhoor / début du jeûne, Maghrib = iftar / rupture)
// pour le Mode Ramadan. Source : API Aladhan (gratuite, sans clé). Cache journalier local.
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'prayer_times_v1';
// Maroc par défaut (Casablanca). method=3 = Muslim World League (Fajr 18°). Maghrib = coucher du soleil.
export const DEFAULT_LOC = { lat: 33.5731, lng: -7.5898, label: 'Maroc' };

export interface PrayerTimes {
  date: string;        // YYYY-M-D
  fajr: number;        // timestamp ms (aujourd'hui)
  maghrib: number;     // timestamp ms (aujourd'hui)
  nextFajr: number;    // timestamp ms (demain) -> fin du prochain suhoor
  fajrStr: string;     // "HH:MM"
  maghribStr: string;  // "HH:MM"
}

function parseAtDate(timeStr: string, base: Date): number {
  // Aladhan renvoie p.ex. "05:31 (WEST)" -> on garde "05:31".
  const hm = String(timeStr || '').trim().split(' ')[0];
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
  const d = new Date(base);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

export async function getTodayPrayerTimes(
  lat = DEFAULT_LOC.lat,
  lng = DEFAULT_LOC.lng,
): Promise<PrayerTimes | null> {
  const today = new Date();
  const ymd = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
  const ck = `${CACHE_KEY}:${ymd}:${lat.toFixed(2)},${lng.toFixed(2)}`;
  try {
    const c = await AsyncStorage.getItem(ck);
    if (c) return JSON.parse(c) as PrayerTimes;
  } catch {}

  try {
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const url = (d: Date) =>
      `https://api.aladhan.com/v1/timings/${Math.floor(d.getTime() / 1000)}?latitude=${lat}&longitude=${lng}&method=3`;
    const [r1, r2] = await Promise.all([fetch(url(today)), fetch(url(tomorrow))]);
    const j1 = await r1.json();
    const j2 = await r2.json();
    const tA = j1?.data?.timings;
    const tB = j2?.data?.timings;
    if (!tA?.Fajr || !tA?.Maghrib || !tB?.Fajr) return null;
    const res: PrayerTimes = {
      date: ymd,
      fajr: parseAtDate(tA.Fajr, today),
      maghrib: parseAtDate(tA.Maghrib, today),
      nextFajr: parseAtDate(tB.Fajr, tomorrow),
      fajrStr: String(tA.Fajr).trim().split(' ')[0],
      maghribStr: String(tA.Maghrib).trim().split(' ')[0],
    };
    try { await AsyncStorage.setItem(ck, JSON.stringify(res)); } catch {}
    return res;
  } catch {
    return null;
  }
}
