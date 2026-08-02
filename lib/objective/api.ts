// Helpers d'appel aux endpoints d'analyse objectif-aware du backend.
// Même pattern fetch + headers() (token Firebase) que lib/aiProxy.ts.
// Routes backend : POST /menu/analyze, /fridge/analyze, /receipt/analyze
//   body { imageBase64, mime?, objective }
import { auth } from '../firebaseAuth';
import type { ObjectiveContext, FoodScore } from './scoring';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim();

async function headers(): Promise<Record<string, string>> {
  const tok = await auth.currentUser?.getIdToken().catch(() => null);
  return { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
}

/** Un aliment détecté + son verdict objectif (renvoyé par le backend). */
export interface AnalyzedItem {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  tags?: string[];
  score?: FoodScore;
}

/** Réponse commune des trois analyses (menu / frigo / ticket). */
export interface ObjectiveAnalysis {
  items: AnalyzedItem[];
  /** Synthèse libre éventuelle (texte généré). */
  summary?: string;
  [k: string]: any;
}

/** POST générique vers une route d'analyse objectif-aware. */
async function postAnalyze(
  path: string,
  imageBase64: string,
  objective: ObjectiveContext,
  mime: string = 'image/jpeg',
): Promise<ObjectiveAnalysis> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL not configured');
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ imageBase64, mime, objective }),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return (await res.json()) as ObjectiveAnalysis;
}

/** Analyse une photo de MENU/carte vs l'objectif → plats scorés. */
export function analyzeMenu(
  imageBase64: string,
  objective: ObjectiveContext,
  mime?: string,
): Promise<ObjectiveAnalysis> {
  return postAnalyze('/menu/analyze', imageBase64, objective, mime);
}

/** Analyse une photo de FRIGO/placard vs l'objectif → aliments scorés. */
export function analyzeFridge(
  imageBase64: string,
  objective: ObjectiveContext,
  mime?: string,
): Promise<ObjectiveAnalysis> {
  return postAnalyze('/fridge/analyze', imageBase64, objective, mime);
}

/** Analyse une photo de TICKET de caisse vs l'objectif → produits scorés. */
export function analyzeReceipt(
  imageBase64: string,
  objective: ObjectiveContext,
  mime?: string,
): Promise<ObjectiveAnalysis> {
  return postAnalyze('/receipt/analyze', imageBase64, objective, mime);
}

/** Une alternative produit mieux notée (renvoyée par /barcode/alternatives). */
export interface AlternativeProduct {
  name: string;
  brand?: string;
  barcode?: string;
  image?: string;
  kcal?: number;
  fit?: number;
  verdict?: FoodScore['verdict'];
  reason?: string;
}

/**
 * Demande jusqu'à 3 alternatives MIEUX NOTÉES à un produit dont le verdict est
 * "avoid", vs l'objectif du jour. Best-effort : renvoie [] si l'endpoint échoue.
 * Route backend : POST /barcode/alternatives { barcode, objective }
 * (le backend re-résout le produit depuis le barcode ; pas de payload `food`).
 */
export async function fetchAlternatives(
  barcode: string,
  objective: ObjectiveContext,
): Promise<AlternativeProduct[]> {
  if (!API_URL) return [];
  try {
    const res = await fetch(`${API_URL}/barcode/alternatives`, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({ barcode, objective }),
    });
    if (!res.ok) return [];
    const j = await res.json();
    const list = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : Array.isArray(j?.alternatives) ? j.alternatives : [];
    return (list as AlternativeProduct[]).slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Soumet un produit INCONNU (absent d'OpenFoodFacts) à la file de validation
 * modérée du backend, avec une photo de l'étiquette. Route backend :
 * POST /barcode/pending { barcode, imageBase64, name }.
 */
export async function submitPendingProduct(payload: {
  barcode: string;
  imageBase64: string;
  name?: string;
}): Promise<boolean> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL not configured');
  const res = await fetch(`${API_URL}/barcode/pending`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`/barcode/pending ${res.status}`);
  return true;
}
