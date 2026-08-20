// Appels IA depuis le web — même porte d'entrée que le mobile.
// ---------------------------------------------------------------------------
// Le mobile ne parle jamais à Gemini directement : `lib/aiProxy.ts` appelle
// `${API_URL}/ai/generate`, et c'est le backend qui détient GEMINI_API_KEY. Le
// web fait pareil, et pour la même raison : une clé d'API dans du JavaScript
// servi au navigateur est une clé publique. Ici le risque serait même PIRE que
// sur mobile — n'importe qui peut ouvrir les sources d'une page web, là où il
// faut désassembler un APK.
//
// Conséquence assumée : sans backend joignable, ces écrans ne fonctionnent pas.
// Ils le disent, plutôt que de faire semblant.
import { firebaseAuth } from './firebaseClient';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/$/, '');

/**
 * En-tetes avec le jeton Firebase, exactement comme `lib/aiProxy.ts` du mobile.
 *
 * ⚠ Oubli initial de ma part, et il rendait NEUF ecrans inoperants : le backend
 * refuse `/ai/*` sans `Authorization: Bearer`, avec un 401 « Missing bearer
 * token ». En local rien ne le montrait — le backend n'y est pas joignable, donc
 * les pages affichaient sagement « service indisponible » et j'ai cru que
 * c'etait le comportement attendu hors connexion.
 */
async function enTetes(forcer = false): Promise<Record<string, string>> {
  const jeton = await firebaseAuth().currentUser?.getIdToken(forcer).catch(() => null);
  return { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) };
}

/**
 * POST vers le backend, avec UN reessai sur 401 en rafraichissant le jeton.
 *
 * Un jeton Firebase expire au bout d'une heure. Sans ce reessai, laisser un
 * onglet /me ouvert une matinee suffirait a rendre tous les ecrans a IA
 * inoperants, sans que rien n'indique qu'il faut simplement recharger la page.
 */
async function poster(chemin: string, corps: any, signal?: AbortSignal): Promise<any> {
  if (!API_URL) throw new IaIndisponible('NEXT_PUBLIC_API_URL absent');
  const envoyer = async (forcer: boolean) => {
    try {
      return await fetch(`${API_URL}${chemin}`, {
        method: 'POST',
        headers: await enTetes(forcer),
        body: JSON.stringify(corps),
        signal,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      throw new IaIndisponible('backend injoignable');
    }
  };

  let rep = await envoyer(false);
  if (rep.status === 401 || rep.status === 403) rep = await envoyer(true);
  if (rep.status === 401 || rep.status === 403) throw new IaNonAutorise('jeton refuse');
  if (!rep.ok) throw new IaIndisponible(`backend ${rep.status}`);
  return await rep.json().catch(() => null);
}

/** Transcription audio. Meme contrat que `aiTranscribe` du mobile. */
export async function transcrireAudio(
  audioBase64: string,
  mimeType = 'audio/webm',
  langue?: string,
  signal?: AbortSignal,
): Promise<string> {
  const data = await poster('/ai/transcribe', { audioBase64, mimeType, language: langue }, signal);
  return (data?.text ?? '').toString().trim();
}

export class IaIndisponible extends Error {}
/** Jeton absent ou expire : distinct d'une panne, et corrigeable en se reconnectant. */
export class IaNonAutorise extends Error {}

/**
 * Envoie une consigne au backend et renvoie le texte produit.
 *
 * `signal` permet d'abandonner : ces requêtes durent plusieurs secondes, et
 * quelqu'un qui change d'écran entre-temps ne doit pas voir une réponse
 * surgir dans une page qu'il a quittée.
 */
export async function genererTexte(consigne: string, signal?: AbortSignal): Promise<string> {
  const data = await poster('/ai/generate', { prompt: consigne }, signal);
  const texte = (data?.text ?? data?.result ?? data?.output ?? '').toString().trim();
  if (!texte) throw new IaIndisponible('réponse vide');
  return texte;
}

/**
 * Envoie une image au backend. Même contrat que `aiVision` du mobile :
 * `/ai/vision` attend `{prompt, imageBase64, mimeType}` et renvoie `{text}`.
 *
 * `imageBase64` est le contenu SEUL, sans le préfixe `data:image/jpeg;base64,`
 * que produit un `FileReader` de navigateur. Le laisser ferait échouer le
 * décodage côté serveur sur une erreur peu parlante.
 */
export async function analyserImage(
  consigne: string,
  imageBase64: string,
  mimeType = 'image/jpeg',
  signal?: AbortSignal,
): Promise<string> {
  const data = await poster('/ai/vision', { prompt: consigne, imageBase64, mimeType }, signal);
  const texte = (data?.text ?? '').toString().trim();
  if (!texte) throw new IaIndisponible('réponse vide');
  return texte;
}

/**
 * Lit un fichier image et renvoie sa charge base64 SANS le préfixe `data:`.
 *
 * Redimensionne à 1000 px de large au passage, comme `lib/imageAI.ts` sur
 * mobile : une photo de téléphone moderne pèse plusieurs mégaoctets, et
 * l'envoyer telle quelle allonge la requête sans rien apporter au modèle.
 */
export function fichierVersBase64(file: File, largeurMax = 1000): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = Math.min(1, largeurMax / (img.width || largeurMax));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * ratio));
      c.height = Math.max(1, Math.round(img.height * ratio));
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('canvas indisponible'));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      // Toujours en JPEG q0.7 : un PNG de capture d'ecran peut peser dix fois
      // plus lourd pour un resultat identique a l'analyse.
      const dataUrl = c.toDataURL('image/jpeg', 0.7);
      resolve({ base64: dataUrl.split(',')[1] || '', mimeType: 'image/jpeg' });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image illisible'));
    };
    img.src = url;
  });
}

/**
 * Extrait un tableau JSON d'une réponse de modèle.
 *
 * Les modèles encadrent volontiers leur JSON de ```json … ``` ou d'une phrase
 * d'introduction. Un `JSON.parse` direct casse dessus une fois sur trois, et
 * l'écran afficherait une erreur alors que la réponse est bonne.
 */
export function extraireListe(texte: string): any[] {
  const sansCloture = texte.replace(/```(?:json)?/gi, '').trim();
  const debut = sansCloture.indexOf('[');
  const fin = sansCloture.lastIndexOf(']');
  if (debut === -1 || fin <= debut) return [];
  try {
    const v = JSON.parse(sansCloture.slice(debut, fin + 1));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Extrait un objet JSON d'une réponse de modèle. Même motif que
 * `extraireListe`, avec des accolades — et la même raison d'exister : les
 * modèles encadrent leur JSON de ```json … ``` ou d'une phrase d'introduction,
 * sur laquelle un `JSON.parse` direct casse.
 */
export function extraireObjet(texte: string): Record<string, any> | null {
  const sansCloture = texte.replace(/```(?:json)?/gi, '').trim();
  const debut = sansCloture.indexOf('{');
  const fin = sansCloture.lastIndexOf('}');
  if (debut === -1 || fin <= debut) return null;
  try {
    const v = JSON.parse(sansCloture.slice(debut, fin + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export const iaConfiguree = () => Boolean(API_URL);
