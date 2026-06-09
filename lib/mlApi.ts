// Client des modèles ML backend (/ml/*). Auth = Firebase ID token (comme aiProxy).
//  - mlWeightForecast : prévision de poids + plateau (régression+EMA serveur)
//  - mlMealReco       : recommandation de repas (scoring macro vs objectif)
//  - mlPortionEstimate: estimation de portion (grammes) via Gemini Vision serveur
import { auth } from './firebaseAuth';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim();

async function headers(): Promise<Record<string, string>> {
  const tok = await auth.currentUser?.getIdToken().catch(() => null);
  return { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
}

export type WeightForecast = {
  ok: boolean;
  reason?: string;
  model?: string;
  count?: number;
  currentWeight?: number;
  trendKgPerWeek?: number;
  recentKgPerWeek?: number;
  direction?: 'losing' | 'gaining' | 'stable';
  plateau?: boolean;
  confidence?: number;
  projection?: { targetWeight: number; daysToGoal: number; etaTs: number; weeklyRate: number } | null;
};

export type MealReco = {
  ok: boolean;
  goal: string;
  remaining: { kcal: number; p: number; c: number; f: number };
  recommendations: { name: string; kcal: number; p: number; c: number; f: number; score: number; proteinDensity: number; tags: string[] }[];
};

export async function mlWeightForecast(targetWeight?: number): Promise<WeightForecast> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL not configured');
  const q = targetWeight != null ? `?targetWeight=${encodeURIComponent(targetWeight)}` : '';
  const res = await fetch(`${API_URL}/ml/weight-forecast${q}`, { headers: await headers() });
  if (!res.ok) throw new Error(`/ml/weight-forecast ${res.status}`);
  return res.json();
}

export async function mlMealReco(
  remaining: { kcal: number; p: number; c: number; f: number },
  goal: 'lose' | 'maintain' | 'gain' = 'maintain',
  limit = 5,
): Promise<MealReco> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL not configured');
  const res = await fetch(`${API_URL}/ml/meal-reco`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ remaining, goal, limit }),
  });
  if (!res.ok) throw new Error(`/ml/meal-reco ${res.status}`);
  return res.json();
}

export async function mlPortionEstimate(
  imageBase64: string,
  foodName?: string,
): Promise<{ ok: boolean; food?: string; estimatedGrams?: number; calories?: number; confidence?: number; reasoning?: string }> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL not configured');
  const res = await fetch(`${API_URL}/ml/portion-estimate`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ imageBase64, foodName }),
  });
  if (!res.ok) throw new Error(`/ml/portion-estimate ${res.status}`);
  return res.json();
}
