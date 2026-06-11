import { aiVision } from './aiProxy';

// Logging vocal : on envoie l'audio enregistré à Gemini (via /ai/vision, qui
// accepte l'audio en inlineData) pour le TRANSCRIRE + estimer les nutriments,
// le tout en un appel. 100% logiciel, aucun module natif (réutilise l'AI proxy).

export interface ParsedMeal {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const PROMPT = `Cet audio est une personne qui décrit, en français, un repas ou un aliment qu'elle vient de manger.
1) Transcris ce qui est dit. 2) Identifie l'aliment/repas et estime ses nutriments pour la portion décrite.
Réponds STRICTEMENT en JSON pur (aucun texte autour, pas de balises), format exact :
{"name":"<repas en français, court>","calories":<number kcal>,"protein":<number g>,"carbs":<number g>,"fat":<number g>}
Si l'audio ne décrit aucune nourriture, renvoie {"name":"","calories":0,"protein":0,"carbs":0,"fat":0}.`;

export async function parseMealFromAudio(base64: string, mimeType = 'audio/mp4'): Promise<ParsedMeal | null> {
  const raw = await aiVision(PROMPT, base64, mimeType);
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
