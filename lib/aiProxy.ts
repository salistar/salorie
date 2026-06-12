// Server-side AI proxy. The app no longer calls Gemini directly with an embedded
// key — it calls the backend /ai/* endpoints (which hold GEMINI_API_KEY server
// side and require a Firebase ID token). Keeps the app bundle key-free.
import { auth } from './firebaseAuth';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim();

async function headers(): Promise<Record<string, string>> {
  const tok = await auth.currentUser?.getIdToken().catch(() => null);
  return { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
}

/** Text generation via backend Gemini. Returns the model's text. */
export async function aiGenerate(prompt: string, model?: string): Promise<string> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL not configured');
  const res = await fetch(`${API_URL}/ai/generate`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ prompt, model }),
  });
  if (!res.ok) throw new Error(`/ai/generate ${res.status}`);
  const j = await res.json();
  return String(j?.text ?? '');
}

/** Vocal → texte via faster-whisper backend (fallback Gemini côté serveur). */
export async function aiTranscribe(audioBase64: string, mimeType = 'audio/mp4', language?: string): Promise<string> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL not configured');
  const res = await fetch(`${API_URL}/ai/transcribe`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ audioBase64, mimeType, language }),
  });
  if (!res.ok) throw new Error(`/ai/transcribe ${res.status}`);
  const j = await res.json();
  return String(j?.text ?? '');
}

/** Multimodal (image) generation via backend Gemini. */
export async function aiVision(prompt: string, imageBase64: string, mimeType = 'image/jpeg', model?: string): Promise<string> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL not configured');
  const res = await fetch(`${API_URL}/ai/vision`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ prompt, imageBase64, mimeType, model }),
  });
  if (!res.ok) throw new Error(`/ai/vision ${res.status}`);
  const j = await res.json();
  return String(j?.text ?? '');
}

/**
 * Drop-in replacement for `new GoogleGenerativeAI(key)` — same surface
 * (`getGenerativeModel({model}).generateContent(promptOrParts)` →
 * `{ response: { text() } }`) but routes to the backend /ai/* proxy, so no
 * Gemini key is needed in the client. Lets existing call sites work unchanged.
 */
export const geminiShim = {
  getGenerativeModel: ({ model }: { model?: string } = {}) => ({
    generateContent: async (input: any) => {
      let text: string;
      if (typeof input === 'string') {
        text = await aiGenerate(input, model);
      } else if (Array.isArray(input)) {
        const promptPart = input.map((p: any) => (typeof p === 'string' ? p : p?.text)).filter(Boolean).join('\n');
        const img = input.find((p: any) => p && p.inlineData);
        text = img
          ? await aiVision(promptPart, img.inlineData.data, img.inlineData.mimeType || 'image/jpeg', model)
          : await aiGenerate(promptPart, model);
      } else {
        text = await aiGenerate(String(input ?? ''), model);
      }
      return { response: { text: () => text } };
    },
  }),
};
