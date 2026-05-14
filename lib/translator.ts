/**
 * Generic localized string translator.
 *
 * Strategy (cheap → expensive):
 *   1. Local i18n dictionary (activities.* keys)
 *   2. AsyncStorage cache (translations_{lang}_{hash})
 *   3. Firestore shared cache (translations_cache/{hash})
 *   4. Gemini AI API call, then write-through to both caches
 *
 * Used for activity names, AI weekly-outlook summaries, and any free-form
 * text that needs to change language at runtime without another round trip
 * to the model.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONFIG } from '../constants/config';
import { db } from './firebase';

export type Lang = 'en' | 'fr' | 'ar';

const genAI = new GoogleGenerativeAI(CONFIG.geminiApiKey);

function hash(s: string): string {
  // djb2 — small, fast, stable; fine as a cache key
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

const langLabel = (l: Lang) => l === 'fr' ? 'French' : l === 'ar' ? 'Arabic' : 'English';

/**
 * Ask Gemini to translate `text` into `targetLang`. Returns only the translated
 * string (no quotes, no explanations).
 */
async function translateViaAi(text: string, targetLang: Lang): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt =
    `Translate the following text to ${langLabel(targetLang)}. ` +
    `Return ONLY the translation, no quotes, no explanation, preserve meaning and tone.\n\nText: ${text}`;
  console.log('\x1b[32m[API→Gemini] translator REQUEST\x1b[0m', {
    model: 'gemini-2.5-flash',
    targetLang,
    sourceChars: text.length,
    sourcePreview: text.slice(0, 80),
  });
  const t0 = Date.now();
  const r = await model.generateContent(prompt);
  const out = r.response.text().trim().replace(/^["'`]|["'`]$/g, '');
  console.log('\x1b[34m[API←Gemini] translator RESPONSE\x1b[0m', {
    ms: Date.now() - t0,
    targetLang,
    outChars: out.length,
    outPreview: out.slice(0, 80),
  });
  return out;
}

/**
 * translate(text, targetLang, localLookup?)
 *
 * - localLookup: optional synchronous function that returns a direct
 *   translation from the i18n dictionary if available (prefix 'activities.'
 *   for example). If it returns a non-empty string different from the input
 *   key prefix, that wins — no API call.
 */
export async function translate(
  text: string,
  targetLang: Lang,
  localLookup?: (text: string, lang: Lang) => string | undefined,
): Promise<string> {
  if (!text) return text;
  if (targetLang === 'en') return text; // source strings are EN by convention

  // 1. Local dictionary
  const local = localLookup?.(text, targetLang);
  if (local && local.trim() && local !== text) return local;

  const key = hash(`${targetLang}:${text}`);
  const asyncKey = `tx_${key}`;

  // 2. AsyncStorage cache
  try {
    const cached = await AsyncStorage.getItem(asyncKey);
    if (cached) return cached;
  } catch {}

  // 3. Firestore shared cache
  try {
    console.log('\x1b[32m[API→Firestore] translations_cache/get\x1b[0m', { key, targetLang });
    const snap = await getDoc(doc(db, 'translations_cache', key));
    if (snap.exists()) {
      const v = (snap.data() as any)[targetLang];
      console.log('\x1b[34m[API←Firestore] translations_cache HIT\x1b[0m', { key, targetLang, preview: typeof v === 'string' ? v.slice(0, 60) : null });
      if (typeof v === 'string' && v) {
        AsyncStorage.setItem(asyncKey, v).catch(() => {});
        return v;
      }
    } else {
      console.log('\x1b[34m[API←Firestore] translations_cache MISS\x1b[0m', { key, targetLang });
    }
  } catch (e) {
    console.warn('\x1b[34m[API←Firestore] translations_cache error:\x1b[0m', (e as Error).message);
  }

  // 4. Gemini fallback, then write-through
  try {
    const translated = await translateViaAi(text, targetLang);
    if (translated && translated !== text) {
      AsyncStorage.setItem(asyncKey, translated).catch(() => {});
      try {
        console.log('\x1b[32m[API→Firestore] translations_cache/set\x1b[0m', { key, targetLang, chars: translated.length });
        await setDoc(
          doc(db, 'translations_cache', key),
          { source: text, [targetLang]: translated, updatedAt: Date.now() },
          { merge: true },
        );
        console.log('\x1b[34m[API←Firestore] translations_cache/set OK\x1b[0m', { key });
      } catch (e) {
        console.warn('\x1b[34m[API←Firestore] translations_cache/set FAILED:\x1b[0m', (e as Error).message);
      }
      return translated;
    }
  } catch (e) {
    console.warn('[translator] AI translation failed:', (e as Error).message);
  }
  return text; // last-resort: source
}

/**
 * React hook-friendly variant that synchronously returns the best-known
 * translation for a given text and lazily upgrades via AI if absent.
 * Pass a `setState` to refresh the component when the async translation lands.
 */
export async function translateWithCache(
  text: string,
  targetLang: Lang,
  onUpdate?: (t: string) => void,
  localLookup?: (text: string, lang: Lang) => string | undefined,
): Promise<string> {
  const result = await translate(text, targetLang, localLookup);
  onUpdate?.(result);
  return result;
}
