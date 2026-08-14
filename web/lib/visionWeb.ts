'use client';
// Reconnaissance de repas depuis le navigateur.
// ---------------------------------------------------------------------------
// Le navigateur appelle DIRECTEMENT l'API Salorie avec le jeton Firebase de
// l'utilisateur — pas de route serveur Next intermediaire. Deux raisons : la liste
// CORS du backend accepte deja `*.salorie.com`, et surtout la photo ne transite
// alors par aucun tiers. Le backend applique le meme quota par utilisateur que pour
// le mobile, puisque c'est la meme identite (FirebaseAuthGuard).
import { PUBLIC_CONFIG } from './publicConfig';
import { jetonApi } from './firebaseBridge';

export type ResultatScan = {
  name: string;
  description?: string;
  qualities?: string[];
  risks?: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  quantity?: number;
  unit?: string;
  serving?: string;
  portionConfidence?: string;
  portionBasis?: string;
};

const INSTRUCTION_LANGUE: Record<string, string> = {
  fr: 'Answer in FRENCH: "name", "description", "qualities", "risks" and "serving" must be written in French.',
  en: 'Answer in ENGLISH.',
  ar: 'Answer in ARABIC: "name", "description", "qualities", "risks" and "serving" must be written in Arabic.',
};

/**
 * Prompt de reconnaissance.
 *
 * Copie fidele de celui de l'ecran mobile (app/(app)/scan-analysis.tsx) : c'est ce
 * qui garantit qu'une meme photo donne le meme resultat des deux cotes. Toute
 * modification doit etre reportee dans les DEUX fichiers — sans quoi le web et le
 * telephone se mettraient a compter differemment le meme tajine.
 */
export function promptScan(langue: string): string {
  return `You are a precise food & drink recognition expert. Analyze the food OR DRINK in this image.

${INSTRUCTION_LANGUE[langue] || INSTRUCTION_LANGUE.fr}

Be especially accurate for INTERNATIONAL, MOROCCAN and MENA-region dishes and drinks. Examples you must recognize correctly:
- Moroccan/MENA dishes: tajine, couscous, harira, rfissa, pastilla/bastilla, tangia, msemen, baghrir, harcha, zaalouk, bissara, chebakia, briouates, kebab, shawarma, falafel, hummus, mloukhia, koshari, mansaf, maqluba.
- Drinks: black coffee (cafe noir / espresso), Moroccan mint tea (atay / the a la menthe), cafe au lait, fresh orange juice, avocado smoothie, leben/raib.
- If it is clearly a simple BEVERAGE (e.g. a cup of dark liquid = coffee/tea), classify it as the DRINK, never as a meat/dessert dish.
Look carefully at color, container (cup/glass/plate/bowl) and texture before deciding.

Return STRICT JSON with these keys:
{
  "name": "short dish name (2-5 words)",
  "description": "detailed description of the food (2-4 sentences): visible ingredients, cooking style, texture",
  "qualities": ["2-3 short health BENEFITS"],
  "risks": ["2-3 short health RISKS / cautions"],
  "calories": 123,
  "protein": 12.3,
  "carbs": 45,
  "fat": 8.5,
  "quantity": 250,
  "unit": "g",
  "serving": "human-readable serving e.g. '1 bowl (250g)'",
  "portionConfidence": "low | medium | high",
  "portionBasis": "short reason for the weight estimate (<=6 words)"
}

Rules:
- "unit" MUST be exactly "g" for solids or "ml" for liquids. No other unit.
- PORTION WEIGHT IS CRITICAL — every macro is derived from it. Estimate the TOTAL grams/ml using visible REFERENCE CUES: plate / bowl / cup / glass size, a fork / spoon / hand for scale, food height and how much of the container it fills. Prefer a realistic SPECIFIC number (e.g. 180, 310) over round defaults.
- "calories", "protein", "carbs", "fat" MUST correspond to that exact "quantity" (the whole visible portion) — NOT per 100 g.
- "qualities" and "risks" are ARRAYS of 2-3 SHORT strings each. Always give at least one of each.
- Output ONLY the JSON. No markdown, no code fences, no commentary.`;
}

/**
 * Redimensionne et compresse une image dans le navigateur avant l'envoi.
 * Meme cible que le mobile (900 px de large) : une photo brute de 5-15 Mo tombe a
 * 100-300 Ko, ce qui change tout sur une connexion mobile marocaine — et le backend
 * refuse au-dela d'une certaine taille.
 */
export function compresser(fichier: File, largeurMax = 900, qualite = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('lecture-impossible'));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('image-illisible'));
      img.onload = () => {
        const echelle = Math.min(1, largeurMax / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * echelle);
        c.height = Math.round(img.height * echelle);
        const ctx = c.getContext('2d');
        if (!ctx) return reject(new Error('canvas-indisponible'));
        ctx.drawImage(img, 0, 0, c.width, c.height);
        // On ne garde que la charge utile base64, sans le prefixe `data:` — c'est ce
        // que le backend attend dans `imageBase64`.
        resolve(c.toDataURL('image/jpeg', qualite).split(',')[1] || '');
      };
      img.src = String(lecteur.result);
    };
    lecteur.readAsDataURL(fichier);
  });
}

/** Extrait le premier objet JSON d'une reponse, meme emballee dans des clotures. */
function extraireJson(texte: string): any {
  const m = texte.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('reponse-illisible');
  return JSON.parse(m[0]);
}

export async function analyser(imageBase64: string, langue: string): Promise<ResultatScan> {
  const jeton = await jetonApi();
  if (!jeton) throw new Error('session-absente');

  const rep = await fetch(`${PUBLIC_CONFIG.apiUrl}/ml/vision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: JSON.stringify({ prompt: promptScan(langue), imageBase64, mimeType: 'image/jpeg' }),
  });
  if (!rep.ok) throw new Error(`vision-${rep.status}`);

  const brut = await rep.json();
  const j = extraireJson(String(brut?.text ?? ''));
  return {
    name: String(j.name || '').trim() || 'Aliment',
    description: j.description,
    qualities: Array.isArray(j.qualities) ? j.qualities : [],
    risks: Array.isArray(j.risks) ? j.risks : [],
    calories: Math.round(Number(j.calories) || 0),
    protein: Number(j.protein) || 0,
    carbs: Number(j.carbs) || 0,
    fat: Number(j.fat) || 0,
    quantity: Number(j.quantity) || undefined,
    unit: j.unit === 'ml' ? 'ml' : 'g',
    serving: j.serving,
    portionConfidence: j.portionConfidence,
    portionBasis: j.portionBasis,
  };
}
