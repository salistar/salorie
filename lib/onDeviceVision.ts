// Vision ON-DEVICE partagée (tier 1 de la cascade scan : ON-DEVICE → LOCAL DB → GEMINI).
// Classifieur on-device partagé (utilisé par scan-analysis, tier 1 de la cascade).
// Classification TFLite (food_salorie : EfficientNetB0, entree 224x224 float32, SORTIE 172
// CLASSES — verifie le 13 aout 2026 en chargeant le .tflite, pas d'apres un commentaire.
// L'ancien commentaire annoncait « 70 classes MobileNetV2 » et contredisait
// foodSalorieLabels.ts ; c'est bien FOOD_SALORIE_LABELS (172 entrees) qui correspond.)
// + lookup macros hors-ligne dans assets/data/local-foods.json (FR/AR + k/p/c/f).
import * as ImageManipulator from 'expo-image-manipulator';
import { decode as jpegDecode } from 'jpeg-js';
import { Buffer } from 'buffer';
import { FOOD_SALORIE_LABELS as FOOD_LABELS } from './foodSalorieLabels';

export type Pred = { label: string; score: number };

/**
 * ⚠ CE MODELE NE RECONNAIT RIEN — VERIFIE LE 29/08/2026.
 *
 * `food_salorie.tflite` est le MEME fichier ici et sur le serveur (meme
 * empreinte SHA-256). Mesure contre Food-101, le jeu de reference du domaine,
 * dont les 101 classes font partie de ses 172 : **0 bonne reponse sur 74**.
 *
 * Il ne se contente pas de se tromper : il annonce 0,90 a 0,99 de confiance. Or
 * `scan-analysis` court-circuite toute la cascade des 0,85 — donc une fiche
 * nutritionnelle fausse entrait dans le journal sans qu'aucun palier plus fiable
 * ne soit consulte.
 *
 * Trois causes ecartees, mesures a l'appui (food4k/diagnostic_pretraitement.py) :
 * les etiquettes (identiques et dans le meme ordre des deux cotes, 172/172), le
 * pretraitement (dix variantes essayees, 0/60 pour chacune), le fichier lui-meme
 * (non corrompu). Le modele ne discrimine pas.
 *
 * D'ou venait la confiance placee en lui : les « 41/50 (82%) » cites pour
 * justifier son adoption comptaient les reponses AU-DESSUS DU SEUIL, pas les
 * reponses JUSTES.
 *
 * Remettre a `true` seulement apres qu'un modele candidat ait passe
 * `python food4k/valider_modele.py`.
 */
export const MODELE_ON_DEVICE_FIABLE = false;


let modelPromise: Promise<any> | null = null;
async function getModel() {
  if (!modelPromise) {
    const { loadTensorflowModel } = await import('react-native-fast-tflite');
    modelPromise = loadTensorflowModel(require('../assets/models/food_salorie.tflite'));
  }
  return modelPromise;
}

/** Classification 100% on-device → top-3 classes alimentaires. Lève si modèle natif absent. */
export async function classifyOnDevice(uri: string): Promise<Pred[]> {
  const model = await getModel();
  const shape: number[] = model.inputs[0].shape; // [1, H, W, 3]
  const H = shape[1], W = shape[2];
  const dtype: string = model.inputs[0].dataType;

  const manip = await ImageManipulator.manipulateAsync(
    uri, [{ resize: { width: W, height: H } }],
    { base64: true, format: ImageManipulator.SaveFormat.JPEG },
  );
  const raw = Buffer.from(manip.base64 as string, 'base64');
  const { data } = jpegDecode(raw, { useTArray: true }); // RGBA

  const px = W * H;
  let input: Uint8Array | Float32Array;
  if (dtype === 'uint8') {
    input = new Uint8Array(px * 3);
    for (let i = 0, j = 0; i < px; i++) { input[j++] = data[i * 4]; input[j++] = data[i * 4 + 1]; input[j++] = data[i * 4 + 2]; }
  } else {
    // food_salorie intègre déjà le preprocessing MobileNetV2 → il attend des pixels BRUTS 0..255 (pas de /255)
    input = new Float32Array(px * 3);
    for (let i = 0, j = 0; i < px; i++) { input[j++] = data[i * 4]; input[j++] = data[i * 4 + 1]; input[j++] = data[i * 4 + 2]; }
  }

  const out = await model.run([input]);
  const probs: ArrayLike<number> = out[0];
  const idx: number[] = [];
  for (let i = 0; i < probs.length; i++) idx.push(i); // food_salorie : pas de classe __background__, on part de 0
  idx.sort((a, b) => (probs[b] as number) - (probs[a] as number));
  const max = probs[idx[0]] as number;
  const norm = (v: number) => (max > 1 ? v / 255 : v);
  return idx.slice(0, 3).map((i) => ({
    label: FOOD_LABELS[i] || `class ${i}`,
    score: Math.min(1, norm(probs[i] as number)),
  }));
}

// ── Lookup macros HORS-LIGNE (tier 1 bis) ──────────────────────────────────
// Les labels AIY sont en anglais ; la base locale est FR/AR. On normalise et on
// tente une correspondance souple (mots-clés). Retourne null si pas de match fiable.
let LOCAL: any[] | null = null;
function localFoods(): any[] {
  if (!LOCAL) { try { LOCAL = require('../assets/data/local-foods.json'); } catch { LOCAL = []; } }
  return LOCAL || [];
}
function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9؀-ۿ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export type LocalMacro = { name: string; kcal: number; protein: number; carbs: number; fat: number } | null;

/** Cherche les macros d'un label (on-device) dans la base locale. null si pas de match. */
export function localMacroForLabel(label: string): LocalMacro {
  const q = norm(label.replace(/_/g, ' '));
  if (!q) return null;
  const words = q.split(' ').filter((w) => w.length > 2);
  let best: any = null; let bestScore = 0;
  for (const it of localFoods()) {
    const hay = norm(`${it.n || ''} ${it.ar || ''}`);
    if (!hay) continue;
    let score = 0;
    if (hay === q) score = 100;
    else if (hay.includes(q) || q.includes(hay)) score = 60;
    else { for (const w of words) if (hay.includes(w)) score += 20; }
    if (score > bestScore) { bestScore = score; best = it; }
  }
  if (!best || bestScore < 40) return null; // pas assez sûr → on laissera Gemini
  return { name: best.n || label, kcal: Number(best.k) || 0, protein: Number(best.p) || 0, carbs: Number(best.c) || 0, fat: Number(best.f) || 0 };
}
