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
const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/$/, '');

export class IaIndisponible extends Error {}

/**
 * Envoie une consigne au backend et renvoie le texte produit.
 *
 * `signal` permet d'abandonner : ces requêtes durent plusieurs secondes, et
 * quelqu'un qui change d'écran entre-temps ne doit pas voir une réponse
 * surgir dans une page qu'il a quittée.
 */
export async function genererTexte(consigne: string, signal?: AbortSignal): Promise<string> {
  if (!API_URL) throw new IaIndisponible('NEXT_PUBLIC_API_URL absent');
  let rep: Response;
  try {
    rep = await fetch(`${API_URL}/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: consigne }),
      signal,
    });
  } catch (e: any) {
    // AbortError n'est pas une panne : c'est l'utilisateur qui est parti.
    if (e?.name === 'AbortError') throw e;
    throw new IaIndisponible('backend injoignable');
  }
  if (!rep.ok) throw new IaIndisponible(`backend ${rep.status}`);
  const data = await rep.json().catch(() => null);
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
  if (!API_URL) throw new IaIndisponible('NEXT_PUBLIC_API_URL absent');
  let rep: Response;
  try {
    rep = await fetch(`${API_URL}/ai/vision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: consigne, imageBase64, mimeType }),
      signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new IaIndisponible('backend injoignable');
  }
  if (!rep.ok) throw new IaIndisponible(`backend ${rep.status}`);
  const data = await rep.json().catch(() => null);
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
