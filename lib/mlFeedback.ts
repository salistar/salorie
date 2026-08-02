// Active learning : envoie au backend une "correction" de scan = image + ce que le modèle
// on-device a prédit + le label finalement retenu (cascade/utilisateur) + le tier.
// Construit un DATASET RÉEL (vraies photos étiquetées) pour ré-entraîner le on-device.
//
// RGPD : N'envoie RIEN tant que l'utilisateur n'a pas donné son consentement explicite
// (opt-in dans Réglages > Préférences, par défaut désactivé). Côté serveur l'identifiant
// est pseudonymisé (HMAC) et seules de vraies images JPEG/PNG sont stockées.
//
// Fire-and-forget : ne bloque jamais et n'échoue jamais l'UI.
import * as ImageManipulator from 'expo-image-manipulator';
import { auth } from './firebaseAuth';
import { getMLConsent } from './alConsent';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim();
const MODEL_VERSION = 'food_salorie_v5'; // suivre la dérive entre versions du modèle on-device

export async function submitScanFeedback(p: {
  imageUri: string;
  predicted?: string | null;
  predictedScore?: number;
  finalName: string;
  tier: 'device' | 'backend' | 'ai' | string;
  userEdited?: boolean;          // l'utilisateur a-t-il édité le nom proposé ? (= vraie correction)
  language?: string;
  modelVersion?: string;
}): Promise<void> {
  try {
    if (!API_URL || !p.imageUri || !p.finalName) return;
    // Gate consentement : pas d'envoi sans opt-in explicite.
    if (!(await getMLConsent())) return;
    // 384px JPEG q0.6 : assez pour ré-entraîner (entrée modèle 224), léger pour stocker en masse.
    const manip = await ImageManipulator.manipulateAsync(
      p.imageUri,
      [{ resize: { width: 384 } }],
      { base64: true, compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
    );
    const tok = await auth.currentUser?.getIdToken().catch(() => null);
    await fetch(`${API_URL}/ml/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
      body: JSON.stringify({
        imageBase64: manip.base64,
        mimeType: 'image/jpeg',
        predicted: p.predicted ?? null,
        predictedScore: typeof p.predictedScore === 'number' ? p.predictedScore : null,
        finalName: p.finalName,
        tier: p.tier,
        userEdited: typeof p.userEdited === 'boolean' ? p.userEdited : undefined,
        language: p.language,
        modelVersion: p.modelVersion || MODEL_VERSION,
      }),
    });
  } catch {
    /* collecte best-effort : on n'embête jamais l'utilisateur */
  }
}
