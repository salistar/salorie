/**
 * Ce qui ne doit jamais partir vers Sentry.
 * ---------------------------------------------------------------------------
 * ⚠ `sendDefaultPii: false` NE COUVRE PAS TOUT, et c'est le malentendu à éviter.
 * Ce réglage empêche le SDK d'ajouter DE LUI-MÊME l'adresse IP, les en-têtes et
 * les cookies. Il ne touche pas à ce que NOTRE code place dans un message
 * d'erreur ou dans un fil d'Ariane.
 *
 * Or cette application manipule des poids, des glycémies, des adresses de
 * courriel et des photos de repas en base64. Un `throw new Error('échec pour '
 * + email)` écrit sans y penser partirait tel quel, et se retrouverait dans un
 * outil tiers, hors du Maroc, pour une durée de rétention qu'on ne choisit pas.
 *
 * ⚠ ON MASQUE SUR LA FORME, PAS SUR DES NOMS DE CHAMPS.
 * Une liste de clés sensibles (`email`, `poids`, `glycemie`…) laisserait passer
 * le champ qu'on aurait oublié d'y mettre — et c'est toujours celui-là qui fuit.
 * Reconnaître la FORME d'une adresse ou d'un base64 ne dépend d'aucune liste à
 * tenir à jour.
 *
 * Ce module existe séparément du `Sentry.init` pour une seule raison : une
 * fonction qui protège des données de santé doit être testable. Voir
 * `__tests__/sentryMasquage.test.ts`.
 */

/** Remplace dans `texte` tout ce qui a la forme d'une donnée personnelle. */
export function masquerPourSentry(texte: string): string {
  if (!texte) return texte;
  return String(texte)
    // Adresses de courriel — l'identifiant de compte de l'application.
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[courriel]')
    // Photos de repas en base64 : elles n'apprennent rien sur le plantage et
    // feraient exploser la taille de l'événement.
    .replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]{40,}/gi, '[image]')
    // Un très long bloc base64 sans en-tête reste une image ou un jeton.
    // ⚠ LE PREFIXE EST CAPTURE, PAS AVALE. Sans lui, `corps=QQQ…` devenait
    // `[donnees]` tout court : « corps », « utilisateur » et « photo » sont
    // faits de caractères que la classe base64 contient aussi, donc le motif
    // remontait dans l'étiquette et effaçait le seul mot qui rendait la ligne
    // lisible. On borne par un caractère hors classe plutôt que par un
    // lookbehind, qui n'est pas garanti sur toutes les versions de Hermes.
    .replace(/(^|[^A-Za-z0-9+/=])([A-Za-z0-9+/=]{400,})/g, '$1[donnees]')
    // Jetons porteurs (Clerk, Firebase).
    .replace(/(Bearer\s+)[\w.-]{16,}/gi, '$1[jeton]')
    // Jetons JWT nus, hors en-tête Authorization.
    .replace(/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}\b/g, '[jwt]');
}

/** Type minimal de ce que le SDK nous passe — on ne dépend pas de sa version. */
type EvenementSentry = {
  message?: string;
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Array<{ message?: string }>;
};

/**
 * Applique le masquage à un événement, en place.
 *
 * ⚠ NE JETTE JAMAIS. Masquer est une protection ; si elle échoue, on préfère un
 * rapport non masqué à pas de rapport du tout — l'inverse ferait disparaître
 * silencieusement la remontée d'erreurs le jour où ce code a un défaut.
 */
export function masquerEvenement<T extends EvenementSentry>(evenement: T): T {
  try {
    for (const v of evenement.exception?.values ?? []) {
      if (v.value) v.value = masquerPourSentry(v.value);
    }
    if (evenement.message) evenement.message = masquerPourSentry(evenement.message);
    for (const b of evenement.breadcrumbs ?? []) {
      if (b.message) b.message = masquerPourSentry(b.message);
    }
  } catch {
    /* voir ci-dessus */
  }
  return evenement;
}
