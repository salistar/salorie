// Filtrage des messages de chat — appliqué CÔTÉ SERVEUR.
// ---------------------------------------------------------------------------
// Un filtre côté client ne protège personne : il suffit d'appeler le socket
// directement pour le contourner. Celui-ci s'exécute avant toute diffusion et
// avant toute écriture en base.
//
// Trois refus, dans cet ordre de gravité :
//   1. les LIENS — c'est le vecteur d'arnaque n°1 sur un chat d'app grand public,
//      et aucun échange légitime entre coureurs n'en a besoin ;
//   2. les coordonnées personnelles (téléphone, email) — protéger les mineurs et
//      les personnes vulnérables d'un contact hors plateforme ;
//   3. les insultes, en français, arabe et darija marocaine.
//
// Volontairement une fonction PURE, sans injection : elle est testable seule, et
// le jour où l'on voudra la brancher sur un modèle, elle restera le point d'entrée.

/** Détecte une URL, y compris déguisée (« exemple point com », « exemple[.]com »). */
const LIENS = [
  /https?:\/\//i,
  /www\./i,
  /\b[a-z0-9-]+\s*(?:\[|\()?\s*(?:\.|point|dot)\s*(?:\]|\))?\s*(?:com|net|org|ma|fr|io|co|me|shop|store|xyz|link)\b/i,
  /\bt\.me\/|\bwa\.me\/|\bbit\.ly\b/i,
];

/** Numéro de téléphone marocain ou international, et adresses e-mail. */
const COORDONNEES = [
  /\b(?:\+?212|0)\s*[5-7](?:[\s.-]*\d){8}\b/,
  /\b\d{10,}\b/,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
];

// Insultes courantes. Liste volontairement courte et sûre : un filtre trop large
// bloque des messages innocents, ce qui se retourne contre la modération — les
// utilisateurs cessent d'écrire au lieu d'écrire mieux.
const INSULTES = [
  // français
  /\b(conn(?:ard|asse)|encul[ée]|salope|pute|fdp|ta\s*m[eè]re|nique\s*ta)\b/i,
  // arabe / darija (translittéré et en caractères arabes)
  /\b(zam(?:el|il)|9ahba|kahba|hmar|7mar|nayek|tfou)\b/i,
  /(قحبة|زامل|نيك|كلب\s*بن\s*كلب)/,
];

export type MotifRefus = 'vide' | 'trop-long' | 'lien' | 'coordonnees' | 'insulte';

// Type PLAT plutot qu'union discriminee : ce projet compile avec `strict: false`,
// donc sans `strictNullChecks` — TypeScript n'y retrecit pas une union sur un
// booleen, et `verdict.motif` serait refuse apres un `if (!verdict.ok)`. Mieux vaut
// un type qui dit la verite au compilateur tel qu'il est configure qu'un type
// elegant qui ne compile pas.
export type VerdictChat = { ok: boolean; texte?: string; motif?: MotifRefus };

/** Longueur maximale d'un message. Au-delà, ce n'est plus du chat. */
export const LONGUEUR_MAX = 280;

export function filtrerMessage(brut: unknown): VerdictChat {
  const texte = String(brut ?? '').replace(/\s+/g, ' ').trim();
  if (!texte) return { ok: false, motif: 'vide' };
  if (texte.length > LONGUEUR_MAX) return { ok: false, motif: 'trop-long' };
  // Les COORDONNEES avant les LIENS, et l'ordre compte : `moi@exemple.com` satisfait
  // aussi le motif « nom de domaine ». Teste dans l'autre sens, l'auteur lisait
  // « les liens ne sont pas autorises » alors qu'il venait de donner son e-mail —
  // un refus qu'on ne comprend pas est un refus qu'on rejoue.
  if (COORDONNEES.some((r) => r.test(texte))) return { ok: false, motif: 'coordonnees' };
  if (LIENS.some((r) => r.test(texte))) return { ok: false, motif: 'lien' };
  if (INSULTES.some((r) => r.test(texte))) return { ok: false, motif: 'insulte' };
  return { ok: true, texte };
}

/** Message affichable à l'auteur, dans sa langue, quand son message est refusé. */
export function expliquerRefus(motif: string, langue = 'fr'): string {
  const M: Record<string, Record<string, string>> = {
    fr: {
      vide: 'Message vide.',
      'trop-long': `Message trop long (${LONGUEUR_MAX} caractères maximum).`,
      lien: 'Les liens ne sont pas autorisés dans le chat.',
      coordonnees: 'Ne partage pas de numéro ni d’e-mail ici.',
      insulte: 'Ce message ne respecte pas les règles de la communauté.',
      muet: 'Tu ne peux pas écrire dans cette course pour le moment.',
      debit: 'Tu écris trop vite. Attends quelques secondes.',
    },
    en: {
      vide: 'Empty message.',
      'trop-long': `Message too long (${LONGUEUR_MAX} characters max).`,
      lien: 'Links are not allowed in chat.',
      coordonnees: 'Do not share a phone number or e-mail here.',
      insulte: 'This message breaks the community rules.',
      muet: 'You cannot post in this race right now.',
      debit: 'You are posting too fast. Wait a few seconds.',
    },
    ar: {
      vide: 'رسالة فارغة.',
      'trop-long': `الرسالة طويلة جدًا (${LONGUEUR_MAX} حرفًا كحد أقصى).`,
      lien: 'الروابط غير مسموح بها في الدردشة.',
      coordonnees: 'لا تشارك رقم هاتف أو بريدًا إلكترونيًا هنا.',
      insulte: 'هذه الرسالة تخالف قواعد المجتمع.',
      muet: 'لا يمكنك الكتابة في هذا السباق حاليًا.',
      debit: 'أنت تكتب بسرعة كبيرة. انتظر بضع ثوانٍ.',
    },
  };
  return (M[langue] || M.fr)[motif] || (M[langue] || M.fr).insulte;
}
