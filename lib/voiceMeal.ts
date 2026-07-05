import { aiVision, aiTranscribe, aiGenerate } from './aiProxy';

// Logging vocal — chemin RAPIDE : audio → faster-whisper (backend, quasi gratuit)
// → texte → Gemini TEXTE (léger) pour les nutriments. Fallback : ancien chemin
// Gemini audio en un appel (si whisper/transcribe indisponible).

export interface ParsedMeal {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const AUDIO_PROMPT = `Cet audio est une personne qui décrit — en FRANÇAIS, ANGLAIS, ARABE ou DARIJA MAROCAINE — un repas ou un aliment qu'elle vient de manger (ex. darija : "atay" = thé à la menthe, "khobz" = pain, "djaj" = poulet).
1) Transcris ce qui est dit. 2) Identifie l'aliment/repas et estime ses nutriments pour la portion décrite.
Réponds STRICTEMENT en JSON pur (aucun texte autour, pas de balises), format exact :
{"name":"<repas en français, court>","calories":<number kcal>,"protein":<number g>,"carbs":<number g>,"fat":<number g>}
Si l'audio ne décrit aucune nourriture, renvoie {"name":"","calories":0,"protein":0,"carbs":0,"fat":0}.`;

const textPrompt = (transcript: string) => `Une personne décrit un repas qu'elle vient de manger, en FRANÇAIS, ANGLAIS, ARABE ou DARIJA MAROCAINE (parfois mélangés) : « ${transcript} »
Exemples darija : "atay" = thé à la menthe sucré ; "khobz" = pain ; "bissara" = soupe de fèves ; "l7am" = viande ; "djaj" = poulet ; "7lib" = lait ; "zit" = huile.
Identifie le ou les aliments/repas (même mal orthographiés par la transcription vocale, déduis phonétiquement) et estime les nutriments TOTAUX pour la portion décrite.
Réponds STRICTEMENT en JSON pur (aucun texte autour, pas de balises), format exact :
{"name":"<repas en français, court>","calories":<number kcal>,"protein":<number g>,"carbs":<number g>,"fat":<number g>}
UNIQUEMENT si le texte est vide ou sans AUCUN rapport avec la nourriture, renvoie {"name":"","calories":0,"protein":0,"carbs":0,"fat":0}.`;

function parseJson(raw: string): ParsedMeal | null {
  if (!raw) return null;
  const m = raw.match(/\{[\s\S]*\}/); // extrait le 1er bloc JSON même si entouré
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return {
      name: String(j.name || '').trim(),
      calories: Math.max(0, Math.round(Number(j.calories) || 0)),
      protein: Math.max(0, Math.round(Number(j.protein) || 0)),
      carbs: Math.max(0, Math.round(Number(j.carbs) || 0)),
      fat: Math.max(0, Math.round(Number(j.fat) || 0)),
    };
  } catch {
    return null;
  }
}

export async function parseMealFromAudio(base64: string, mimeType = 'audio/mp4'): Promise<ParsedMeal | null> {
  // 1) Chemin rapide : whisper → texte → Gemini texte.
  // PAS de langue forcée : auto-détection (fr/en/ar/darija) — forcer 'fr'
  // massacrait l'arabe et la darija (« atay », « couscous »…).
  try {
    const transcript = (await aiTranscribe(base64, mimeType)).trim();
    if (transcript) {
      const parsed = parseJson(await aiGenerate(textPrompt(transcript)));
      if (parsed && parsed.name) return parsed; // nom vide → on retente en audio direct
    }
  } catch { /* transcribe indisponible → fallback audio direct */ }
  // 2) Fallback : Gemini audio en un appel (ancien chemin, toujours fiable).
  return parseJson(await aiVision(AUDIO_PROMPT, base64, mimeType));
}
