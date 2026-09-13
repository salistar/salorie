/**
 * Ce qui ne doit jamais partir vers Sentry — COPIE DU MODULE MOBILE.
 * ---------------------------------------------------------------------------
 * ⚠ CE FICHIER EST UNE COPIE DE `lib/sentryMasquage.ts`, A LA RACINE DU DEPOT,
 * ET LA COPIE EST IMPOSEE PAR LA STRUCTURE, PAS CHOISIE.
 * Le contexte de build du conteneur backend est `./backend` (docker-compose) et
 * son `tsconfig.build.json` fixe `rootDir: "src"` — deux contraintes posees
 * deliberement, et documentees la-bas. Importer la racine casserait l'une ou
 * l'autre, et j'ai deja paye cette semaine ce que coute un changement de
 * disposition de conteneur.
 *
 * ⚠ MAIS LA DIVERGENCE, ELLE, EST INTERDITE PAR UN TEST.
 * `sentry-masquage.spec.ts` compare les REGLES des deux fichiers, commentaires
 * retires. Toute modification de l'un sans l'autre fait echouer la CI. C'est la
 * difference avec `ml/masquage-secrets.spec.ts`, qui se contente d'un
 * commentaire demandant de reporter les changements a la main.
 *
 * Le reste de l'explication — pourquoi on masque sur la FORME et non sur des
 * noms de champs — vit dans le fichier d'origine, qui fait foi.
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
    .replace(/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}\b/g, '[jwt]')
    // ⚠ CLÉS D'API, AJOUTÉES LE 13/09/2026 EN OUVRANT CE MODULE AU SERVEUR.
    // Les fournisseurs d'IA recopient volontiers la clé reçue dans leur message
    // d'erreur — « Incorrect API key provided: sk-proj-AbCd… ». Sur le mobile ce
    // texte ne circulait pas ; côté backend, il traverse la cascade de vision et
    // finirait tel quel dans un événement Sentry, c'est-à-dire chez un tiers.
    //
    // On reconnaît les PRÉFIXES, parce qu'ils sont stables et publics : `sk-`
    // (OpenAI et compatibles), `AIza` (Google), `goog_`/`test_` (RevenueCat),
    // `pk_live`/`sk_live` (Clerk, Stripe). La longueur minimale évite d'effacer
    // un mot ordinaire qui commencerait par les mêmes lettres.
    .replace(/\b(?:sk|pk)[-_](?:live|test|proj)?[-_]?[A-Za-z0-9]{16,}/g, '[cle]')
    .replace(/\bAIza[\w-]{20,}/g, '[cle]')
    .replace(/\b(?:goog|test|appl|amzn)_[A-Za-z0-9]{16,}/g, '[cle]');
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
