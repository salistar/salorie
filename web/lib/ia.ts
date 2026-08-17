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

export const iaConfiguree = () => Boolean(API_URL);
