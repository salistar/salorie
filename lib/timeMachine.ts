// "Time Machine" — couche historique d'un lieu (waypoint d'une course).
// Génère, via le proxy Gemini backend (aiGenerate), un court récit du lieu
// À TRAVERS LES ÉPOQUES (antiquité -> aujourd'hui), dans la langue de l'app.
// Cache mémoire par (lieu + langue) pour éviter de rappeler l'IA inutilement.

import { aiGenerate } from './aiProxy';

type Lang = 'en' | 'fr' | 'ar' | string;

// Cache mémoire : clé = `${langue}::${nom du lieu normalisé}`.
const cache = new Map<string, string>();

const LANG_NAME: Record<string, string> = {
  en: 'English',
  fr: 'French',
  ar: 'Arabic',
};

/**
 * Récit historique court (3-4 phrases) d'un lieu, de l'antiquité à aujourd'hui,
 * dans la langue demandée. Renvoie null en cas d'échec (réseau, IA, lieu vide).
 */
export async function getHistory(placeName: string, language: Lang = 'en'): Promise<string | null> {
  const name = String(placeName || '').trim();
  if (!name) return null;

  const lang = String(language || 'en');
  const key = `${lang}::${name.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const langLabel = LANG_NAME[lang] || 'English';
  const prompt =
    `Write a short, vivid 3-4 sentence history of the place "${name}" through the ages, ` +
    `from antiquity to today (how it changed across eras). ` +
    `Be factual where you can, evocative, and concise. ` +
    `Reply ONLY in ${langLabel}, with no title, no preamble and no bullet points.`;

  try {
    const out = (await aiGenerate(prompt))?.trim();
    if (!out) return null;
    cache.set(key, out);
    return out;
  } catch {
    return null;
  }
}
