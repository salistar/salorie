// Un temoin de courtoisie : le prenom, pour que la landing dise « Reprendre »
// plutot que « Se connecter » a quelqu'un qui est deja passe.
//
// POURQUOI PAS CLERK
// Faire dire son prenom a la landing par Clerk coute le runtime complet —
// 407 Ko mesures sur /me le 27/08/2026 — sur une page publique qui en pese 706.
// Alourdir de moitie une page vitrine pour personnaliser un libelle est un
// mauvais echange, surtout quand l'audit pointe deja /me comme trop lourd.
//
// POURQUOI PAS UNE LECTURE SERVEUR
// Lire le cookie dans un composant serveur rendrait la landing DYNAMIQUE : elle
// perdrait son cache CDN (`x-nextjs-cache: HIT` aujourd'hui). On paierait le
// confort d'un prenom par la lenteur de toutes les visites, y compris celles
// des inconnus. La lecture se fait donc dans le navigateur.
//
// ⚠ CE TEMOIN N'AUTORISE RIEN.
// Il ne contient qu'un prenom, il n'est jamais lu par le serveur, et aucune
// decision d'acces ne s'en approche. Le forger ne donne acces a rien : /me
// reste garde par Clerk, le back-office par son propre cookie signe. C'est un
// confort d'affichage, et il doit le rester.

export const CLE_TEMOIN = 'salorie_prenom';

/** Trente jours : au-dela, « Reprendre » s'adresserait a un inconnu. */
const DUREE_JOURS = 30;

/**
 * Nettoie ce qui va dans le cookie.
 *
 * Un prenom vient de Clerk, donc d'un fournisseur d'identite — mais il finit
 * dans du HTML. On borne la longueur et on retire tout ce qui n'est pas une
 * lettre, un espace, un tiret ou une apostrophe : ni point-virgule (qui
 * couperait le cookie), ni chevrons.
 */
export function nettoyerPrenom(brut: string): string {
  return String(brut || '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{M} '’-]/gu, '')
    .trim()
    .slice(0, 24);
}

export function poserTemoin(prenom: string): void {
  if (typeof document === 'undefined') return;
  const propre = nettoyerPrenom(prenom);
  if (!propre) return;
  const exp = new Date(Date.now() + DUREE_JOURS * 864e5).toUTCString();
  // `SameSite=Lax` : le temoin ne part pas sur une requete inter-sites. Il n'a
  // rien de sensible, mais un cookie qui voyage sans raison finit par voyager
  // avec quelque chose.
  document.cookie =
    `${CLE_TEMOIN}=${encodeURIComponent(propre)}; path=/; expires=${exp}; SameSite=Lax`;
}

export function lireTemoin(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${CLE_TEMOIN}=([^;]*)`));
  if (!m) return null;
  try {
    // Le contenu est re-nettoye A LA LECTURE, pas seulement a l'ecriture : un
    // cookie se modifie a la main, et ce qui en sort finit dans le DOM.
    return nettoyerPrenom(decodeURIComponent(m[1])) || null;
  } catch {
    return null;
  }
}

export function effacerTemoin(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${CLE_TEMOIN}=; path=/; max-age=0; SameSite=Lax`;
}
