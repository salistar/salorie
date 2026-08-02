// Crédite une activité (km parcourus) dans les compteurs locaux des nouvelles features :
// défi annuel cumulatif, XP avatar, et km cumulés (lus par Sadaqa + Récompenses O2O).
// Best-effort : n'échoue jamais, ne bloque pas la fin de course.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addAnnualKm } from './annualChallenge';
import { addXp } from './avatar';

const RACE_TOTAL_KM_KEY = 'race_total_km'; // clé lue par lib/sadaqa.ts et lib/rewards.ts

export async function creditKm(km: number): Promise<void> {
  if (!isFinite(km) || km <= 0) return;
  try { await addAnnualKm(km); } catch {}
  try { await addXp(Math.round(km * 10)); } catch {} // 10 XP / km (10 km => +100 XP => 1 niveau)
  try {
    const cur = parseFloat((await AsyncStorage.getItem(RACE_TOTAL_KM_KEY)) || '0') || 0;
    await AsyncStorage.setItem(RACE_TOTAL_KM_KEY, String(Math.round((cur + km) * 100) / 100));
  } catch {}
}
