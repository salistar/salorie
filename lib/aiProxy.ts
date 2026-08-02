// Server-side AI proxy. The app no longer calls Gemini directly with an embedded
// key — it calls the backend /ai/* endpoints (which hold GEMINI_API_KEY server
// side and require a Firebase ID token). Keeps the app bundle key-free.
import { auth } from './firebaseAuth';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim();

async function headers(): Promise<Record<string, string>> {
  const tok = await auth.currentUser?.getIdToken().catch(() => null);
  return { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
}

/**
 * fetch avec TIMEOUT dur (AbortController). Sans lui, un tier vision lent/bloqué côté
 * serveur (ex. Ollama /ml/vision qui hang sur une image ambiguë comme un café noir) fige
 * le scan à l'infini sur « Analyse de l'image… ». Sur timeout, on lève une erreur : la
 * cascade (scan-analysis) escalade alors au tier suivant (backend → Gemini) ou affiche
 * une vraie erreur, au lieu de tourner indéfiniment.
 */
async function fetchWithTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`timeout ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(to);
  }
}

/** Text generation via backend Gemini. Returns the model's text. */
export async function aiGenerate(prompt: string, model?: string): Promise<string> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL not configured');
  const res = await fetchWithTimeout(`${API_URL}/ai/generate`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ prompt, model }),
  }, 30000);
  if (!res.ok) throw new Error(`/ai/generate ${res.status}`);
  const j = await res.json();
  return String(j?.text ?? '');
}

/** Vocal → texte via faster-whisper backend (fallback Gemini côté serveur). */
export async function aiTranscribe(audioBase64: string, mimeType = 'audio/mp4', language?: string): Promise<string> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL not configured');
  const res = await fetchWithTimeout(`${API_URL}/ai/transcribe`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ audioBase64, mimeType, language }),
  }, 45000);
  if (!res.ok) throw new Error(`/ai/transcribe ${res.status}`);
  const j = await res.json();
  return String(j?.text ?? '');
}

/** Multimodal (image) generation via backend Gemini. */
export async function aiVision(prompt: string, imageBase64: string, mimeType = 'image/jpeg', model?: string): Promise<string> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL not configured');
  const res = await fetchWithTimeout(`${API_URL}/ai/vision`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ prompt, imageBase64, mimeType, model }),
  }, 30000);
  if (!res.ok) throw new Error(`/ai/vision ${res.status}`);
  const j = await res.json();
  return String(j?.text ?? '');
}

/**
 * Vision via MODÈLE LOCAL AUTO-HÉBERGÉ sur le backend (Ollama llava/moondream),
 * avec repli API food gratuite côté serveur. DISTINCT du provider Gemini (/ai/vision).
 * Route backend: POST /ml/vision (à implémenter côté serveur — Phase 2).
 */
export async function aiVisionLocal(prompt: string, imageBase64: string, mimeType = 'image/jpeg'): Promise<string> {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL not configured');
  // Timeout court (22s) : le tier backend Ollama peut hang sur une image ambiguë (café
  // noir) → on abandonne vite pour escalader vers Gemini plutôt que figer le scan.
  const res = await fetchWithTimeout(`${API_URL}/ml/vision`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ prompt, imageBase64, mimeType }),
  }, 22000);
  if (!res.ok) throw new Error(`/ml/vision ${res.status}`);
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
