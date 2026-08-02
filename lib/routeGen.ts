// Génération IA de parcours (#5) — PREVIEW perso uniquement.
// La création de COURSE persistée étant admin-only, on ne fait AUCUNE écriture
// backend : on demande à Gemini (via le proxy aiGenerate) un parcours structuré
// puis on l'affiche en aperçu. Aucune persistance.
import { aiGenerate } from './aiProxy';

export type RouteWaypoint = { name: string; atKm: number; description: string };
export type GeneratedRoute = {
  name: string;
  description: string;
  waypoints: RouteWaypoint[];
  medalIdea: string;
};

type Lang = 'en' | 'fr' | 'ar';

const LANG_NAME: Record<Lang, string> = { en: 'English', fr: 'French', ar: 'Arabic' };

/** Extrait le 1er objet JSON d'une chaîne (gère ```json ... ``` et texte parasite). */
function extractJson(raw: string): any | null {
  if (!raw) return null;
  let s = String(raw).trim();
  // Retire les fences markdown éventuelles.
  s = s.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = s.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

/**
 * Génère un APERÇU de parcours via l'IA backend (Gemini).
 * @param theme   thème libre saisi par l'utilisateur (ex. "bord de mer à Casablanca")
 * @param km      distance cible en km
 * @param language langue de sortie ('en' | 'fr' | 'ar')
 * @returns un GeneratedRoute, ou null en cas d'échec (réseau / parsing).
 */
export async function generateRoute(theme: string, km: number, language: Lang): Promise<GeneratedRoute | null> {
  const lang = LANG_NAME[language] || 'English';
  const safeKm = Number.isFinite(km) && km > 0 ? Math.round(km) : 5;
  const cleanTheme = (theme || '').trim() || 'a scenic running route';
  const prompt =
    `You are designing a virtual running route for a fitness app.\n` +
    `Theme: "${cleanTheme}". Total distance: ${safeKm} km.\n` +
    `Reply with ONLY a single valid JSON object (no markdown, no extra text) with this exact shape:\n` +
    `{"name": string, "description": string, "waypoints": [{"name": string, "atKm": number, "description": string}], "medalIdea": string}\n` +
    `Rules: provide 3 to 5 waypoints, each with an "atKm" between 0 and ${safeKm} in increasing order. ` +
    `Keep the description under 240 characters. "medalIdea" is a short idea for a commemorative medal design. ` +
    `Write every text value (name, description, waypoint names/descriptions, medalIdea) in ${lang}.`;

  try {
    const raw = await aiGenerate(prompt);
    const obj = extractJson(raw);
    if (!obj || typeof obj !== 'object') return null;

    const waypoints: RouteWaypoint[] = Array.isArray(obj.waypoints)
      ? obj.waypoints
          .map((w: any) => ({
            name: String(w?.name ?? '').trim(),
            atKm: Number(w?.atKm),
            description: String(w?.description ?? '').trim(),
          }))
          .filter((w: RouteWaypoint) => w.name.length > 0)
          .map((w: RouteWaypoint) => ({ ...w, atKm: Number.isFinite(w.atKm) ? w.atKm : 0 }))
      : [];

    const name = String(obj.name ?? '').trim();
    if (!name) return null;

    return {
      name,
      description: String(obj.description ?? '').trim(),
      waypoints,
      medalIdea: String(obj.medalIdea ?? '').trim(),
    };
  } catch (e) {
    console.warn('[routeGen] generateRoute failed', e);
    return null;
  }
}
