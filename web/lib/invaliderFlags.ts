/**
 * Prévient l'API que les drapeaux ont changé.
 * ---------------------------------------------------------------------------
 * Depuis le 09/09/2026, `GET api.salorie.com/flags` sert les drapeaux avec un
 * cache Redis de 60 s — c'est lui qui épargne le quota Firestore (N clients →
 * une lecture par minute au lieu de N). Sans ce coup de fil, un basculement
 * décidé ici mettrait jusqu'à une minute à atteindre les téléphones.
 *
 * Une minute est acceptable pour ALLUMER une fonctionnalité. Elle ne l'est pas
 * pour en éteindre une qui pose problème — c'est précisément le moment où on
 * regarde sa montre.
 *
 * ⚠ BEST-EFFORT, ET SILENCIEUX PAR DESSEIN.
 * L'écriture Firestore a déjà eu lieu et elle FAIT AUTORITÉ. Si l'API est
 * injoignable, le cache expirera tout seul dans la minute. Faire échouer le
 * basculement parce qu'un cache n'a pas pu être vidé, ce serait échanger une
 * gêne mineure contre une panne réelle.
 *
 * ⚠ TOUT CHEMIN QUI ÉCRIT UN DRAPEAU DOIT L'APPELER — la bascule comme le
 * rollback. C'est pour ça qu'elle vit ici et non dans une route.
 */
const API = process.env.BACKEND_URL || 'https://api.salorie.com';

export async function invaliderFlags(): Promise<void> {
  if (!process.env.ADMIN_API_KEY) return;
  try {
    await fetch(`${API}/flags/invalidate`, {
      method: 'POST',
      headers: { 'x-admin-key': process.env.ADMIN_API_KEY },
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    /* le cache expire de lui-meme dans la minute */
  }
}
