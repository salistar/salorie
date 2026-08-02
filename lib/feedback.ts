// Active-learning feedback. When the user says "that's not it" on a scan result
// and types the correct name, we POST the image + wrong prediction + correction
// to the backend so the recognition model can be improved over time.
// Reuses the same auth headers + API base URL as the AI proxy (aiProxy.ts).
import { auth } from './firebaseAuth';
import { getMLConsent } from './alConsent';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim();

async function headers(): Promise<Record<string, string>> {
  const tok = await auth.currentUser?.getIdToken().catch(() => null);
  return { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
}

/**
 * Envoie une correction utilisateur au backend pour l'active-learning.
 * Route backend : POST /ml/feedback
 * @param imageBase64 image scannée (JPEG base64, sans préfixe data:)
 * @param predicted   nom prédit par la reco (aiResult.name)
 * @param corrected   nom correct saisi par l'utilisateur
 * @param source      tier de détection ('device' | 'backend' | 'ai')
 */
export async function sendFeedback(
  imageBase64: string,
  predicted: string,
  corrected: string,
  source: string,
): Promise<void> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL not configured');
  // RGPD : n'envoie RIEN sans le consentement explicite (opt-in Réglages), comme mlFeedback.
  if (!(await getMLConsent())) return;
  // Contrat de l'endpoint existant recordScanFeedback : finalName = nom retenu,
  // userEdited=true → exemple "gold" (vraie correction utilisateur), tier = source.
  const res = await fetch(`${API_URL}/ml/feedback`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({
      imageBase64,
      mimeType: 'image/jpeg',
      predicted,
      finalName: corrected,
      userEdited: true,
      tier: source,
    }),
  });
  if (!res.ok) throw new Error(`/ml/feedback ${res.status}`);
}
