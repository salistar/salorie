// Vision ON-DEVICE partagée (tier 1 de la cascade scan : ON-DEVICE → LOCAL DB → GEMINI).
// Classifieur on-device partagé (utilisé par scan-analysis, tier 1 de la cascade).
// Classification TFLite (food_salorie : MobileNetV3-Large, entree 288x288 float32,
// SORTIE 172 CLASSES — verifie le 09/09/2026 en chargeant le .tflite, pas d'apres
// un commentaire. Le code ci-dessous lit de toute facon la forme dans le modele :
// changer de resolution ou de nombre de classes ne demande pas de toucher ici.
//
// ⚠ 288 px ET NON PLUS 224. Sonde lineaire du 09/09/2026 : +3,0 points de
// justesse predits, +3,1 obtenus, pour deux fois le temps de calcul. Payable —
// le palier embarque passe de ~50 a ~100 ms quand un aller-retour reseau en
// coute 300. 320 px fait MOINS bien que 288 : le rendement s'inverse.
//
// ⚠ 172 CLASSES A NOUVEAU. Le modele du 08/09 en avait ecarte deux, trop
// maigres ; le corpus assaini les a ramenees. Quand une classe est absente, elle
// ne disparait pas de l'application : le classifieur se tait et la cascade la
// traite au palier suivant. Un palier qui se tait laisse passer ; un palier qui
// repond faux avec assurance ARRETE la cascade.
// + lookup macros hors-ligne dans assets/data/local-foods.json (FR/AR + k/p/c/f).
import * as ImageManipulator from 'expo-image-manipulator';
import { decode as jpegDecode } from 'jpeg-js';
import { Buffer } from 'buffer';
import { FOOD_SALORIE_LABELS as FOOD_LABELS } from './foodSalorieLabels';
import { FOOD_SALORIE_NOMS } from './foodSalorieNoms';

export type Pred = { label: string; score: number };

/**
 * Le classifieur embarque est-il digne de court-circuiter la cascade ?
 *
 * ⚠ MIS A `false` PAR ERREUR LE 29/08/2026, PUIS RETABLI.
 * Un banc de mesure avait conclu que ce modele ne reconnaissait rien. Son corpus
 * DEDUISAIT l'etiquette de chaque photo de sa position dans le jeu de donnees au
 * lieu de LIRE le champ fourni a cote : la photo comptee comme « pizza » etait
 * un plat de nachos, et le modele qui repondait « Nachos » avait raison.
 *
 * Mesure refaite avec les vraies etiquettes, sur les 101 plats de Food-101
 * (`python food4k/valider_modele.py`) :
 *   justesse globale               57,4 %
 *   justesse de ce qui est SERVI   71,9 %
 *
 * ⚠ MODELE REMPLACE LE 08/09/2026, et voici la comparaison qui l'a decide —
 * les DEUX modeles sur LES MEMES 437 images (`food4k/comparer_modeles.py`) :
 *                        repond   justes   FAUSSES
 *   nouveau (170 cl.)      189      95        94
 *   precedent (172 cl.)    289      87       202
 * Plus de bonnes reponses, et moins de la MOITIE des mauvaises. Il se tait deux
 * fois plus souvent, et c'est le gain : ce qu'il decline monte au palier suivant,
 * plus juste que lui. Un palier embarque qui repond faux avec assurance est le
 * pire cas, puisqu'il empeche la cascade de continuer.
 *
 * L'ancien modele est conserve a cote, en `.precedent`.
 *
 * Ce drapeau reste : il donne un endroit unique pour couper le palier si un
 * futur modele se degrade, et `valider_modele.py` dit quand il le faut.
 */
export const MODELE_ON_DEVICE_FIABLE = true;


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

/**
 * Cherche les macros d'un label (on-device) dans la base locale.
 *
 * ⚠ ON CHERCHE AVEC LE NOM FRANCAIS, PAS AVEC L'IDENTIFIANT DU MODELE.
 * Le modele rend `feet of beef` ; la base dit `Pieds de veau` depuis qu'elle a
 * ete francisee (09/09/2026) — c'est ce que l'utilisateur doit lire. Chercher
 * l'anglais dans une base francaise faisait perdre leurs macros hors ligne a
 * 93 classes sur 172. On traduit donc d'abord, et on garde l'anglais en repli
 * pour les entrees que la base nomme encore ainsi.
 */
export function localMacroForLabel(label: string): LocalMacro {
  const brut = label.replace(/_/g, ' ');
  const traduit = FOOD_SALORIE_NOMS[brut.toLowerCase()];
  if (traduit) {
    const parFr = chercherDansBase(norm(traduit.fr));
    if (parFr) return parFr;
    if (traduit.ar) {
      const parAr = chercherDansBase(norm(traduit.ar));
      if (parAr) return parAr;
    }
  }
  return chercherDansBase(norm(brut));
}

function chercherDansBase(q: string): LocalMacro {
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
  if (!best || bestScore < 40) return null; // pas assez sûr → la cascade prendra le relais
  return { name: best.n || q, kcal: Number(best.k) || 0, protein: Number(best.p) || 0, carbs: Number(best.c) || 0, fat: Number(best.f) || 0 };
}
