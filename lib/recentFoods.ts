// Aliments RÉCENTS + FAVORIS (stockés localement, par email) pour re-logger en
// 1 tap — la friction n°1 du quotidien (on mange souvent les mêmes aliments).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emailToDocId } from './firebase';

export interface QuickFood {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving?: string;
}

const recentsKey = (email: string) => `recent_foods_${emailToDocId(email)}`;
const favKey = (email: string) => `fav_foods_${emailToDocId(email)}`;
const idOf = (f: QuickFood) => `${f.name}|${f.serving || ''}`.toLowerCase();

async function read(key: string): Promise<QuickFood[]> {
  try { const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) : []; } catch { return []; }
}

export const getRecentFoods = (email: string) => read(recentsKey(email));
export const getFavoriteFoods = (email: string) => read(favKey(email));

/** Appelé après un log réussi : remonte l'aliment en tête des récents (max 20, dédupliqué). */
export async function addRecentFood(email: string, f: QuickFood): Promise<void> {
  if (!email || !f?.name) return;
  try {
    const list = await read(recentsKey(email));
    const next = [f, ...list.filter((x) => idOf(x) !== idOf(f))].slice(0, 20);
    await AsyncStorage.setItem(recentsKey(email), JSON.stringify(next));
  } catch {}
}

export async function isFavoriteFood(email: string, f: QuickFood): Promise<boolean> {
  const list = await read(favKey(email));
  return list.some((x) => idOf(x) === idOf(f));
}

/** Bascule le statut favori ; renvoie le nouvel état (true = désormais favori). */
export async function toggleFavoriteFood(email: string, f: QuickFood): Promise<boolean> {
  if (!email || !f?.name) return false;
  try {
    const list = await read(favKey(email));
    const exists = list.some((x) => idOf(x) === idOf(f));
    const next = exists ? list.filter((x) => idOf(x) !== idOf(f)) : [f, ...list].slice(0, 40);
    await AsyncStorage.setItem(favKey(email), JSON.stringify(next));
    return !exists;
  } catch { return false; }
}
