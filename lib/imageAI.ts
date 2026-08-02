// Plomberie vision factorisée (fix audit) : resize → base64 JPEG → aiVision.
// Centralise le pré-traitement dupliqué dans plusieurs écrans (frigo, équipement,
// resto…). Chaque écran garde son PROMPT et son parsing — seule la plomberie est ici.
import * as ImageManipulator from 'expo-image-manipulator';
import { aiVision } from './aiProxy';

/**
 * Redimensionne (largeur maxWidth) + encode en base64 JPEG.
 * Best-practice : réduit une photo brute (5-15 Mo) à ~100-300 Ko avant l'IA
 * → moins de bande passante, moins de coût, réponse plus rapide.
 * `compress` optionnel : omis → qualité JPEG par défaut (préserve l'ancien comportement
 * des écrans qui ne compressaient pas).
 */
export async function prepareImageBase64(
  uri: string,
  maxWidth = 900,
  compress?: number,
): Promise<string> {
  const save: ImageManipulator.SaveOptions = {
    base64: true,
    format: ImageManipulator.SaveFormat.JPEG,
  };
  if (compress != null) save.compress = compress;
  const manip = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: maxWidth } }], save);
  return manip.base64 as string;
}

/** resize → base64 → Gemini vision, en une étape. Renvoie le texte brut (l'écran parse). */
export async function analyzeImageUri(
  prompt: string,
  uri: string,
  opts: { maxWidth?: number; compress?: number; model?: string } = {},
): Promise<string> {
  const b64 = await prepareImageBase64(uri, opts.maxWidth ?? 900, opts.compress);
  return aiVision(prompt, b64, 'image/jpeg', opts.model);
}
