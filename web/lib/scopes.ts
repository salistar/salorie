// Catalogue des sections du back-office et de leurs perimetres d'acces.
// ---------------------------------------------------------------------------
// SOURCE UNIQUE : la barre laterale, le middleware Edge et les routes API lisent
// tous ce fichier. Ajouter une section, c'est ajouter une ligne ici — impossible
// d'oublier de la proteger, et impossible qu'un menu montre une page interdite.
//
// Volontairement pur (aucun mongoose, aucun acces reseau) : le middleware tourne
// sur l'Edge runtime, qui ne supporterait pas une dependance serveur.

export type Role = 'owner' | 'admin' | 'viewer';

/** Perimetre fonctionnel. Un `admin` n'ouvre que les sections de ses perimetres. */
export type Scope =
  | 'apercu'
  | 'notifications'
  | 'journal'
  | 'courses'
  | 'orgs'
  | 'feedback'
  | 'emails'
  | 'moderation'
  | 'terrains'
  | 'marketplace'
  | 'medailles'
  | 'flags'
  | 'premium';

export type Section = {
  href: string;
  label: string;
  icone: string;
  scope: Scope;
  /** Reserve au super-admin : gouvernance de l'outil lui-meme, pas des donnees. */
  superadminSeul?: boolean;
  /** Chemins supplementaires rattaches a cette section (sous-pages). */
  aussi?: string[];
};

export const SECTIONS: Section[] = [
  { href: '/admin', label: "Vue d'ensemble", icone: '📊', scope: 'apercu', aussi: ['/users'] },
  { href: '/notify', label: 'Notifications', icone: '📣', scope: 'notifications' },
  { href: '/news', label: 'Journal app', icone: '📰', scope: 'journal' },
  { href: '/races', label: 'Courses virtuelles', icone: '🏁', scope: 'courses' },
  { href: '/orgs', label: 'Organisations B2B', icone: '🏢', scope: 'orgs' },
  { href: '/feedback', label: 'Feedback users', icone: '💬', scope: 'feedback' },
  { href: '/emails', label: 'Emails support', icone: '📬', scope: 'emails' },
  // `/reports` (signalements de contenu) existait sans figurer au menu : la page
  // etait donc joignable seulement de memoire. Rattachee a la moderation, elle est
  // desormais protegee par le meme perimetre et atteignable depuis l'interface.
  { href: '/moderation', label: 'Modération', icone: '🧪', scope: 'moderation' },
  { href: '/reports', label: 'Signalements', icone: '🚩', scope: 'moderation' },
  { href: '/sport-fields', label: 'Terrains & matchs', icone: '⚽', scope: 'terrains' },
  { href: '/marketplace', label: 'Marketplace', icone: '🛒', scope: 'marketplace' },
  { href: '/medals-history', label: 'Médailles gagnées', icone: '🥇', scope: 'medailles' },
  { href: '/achievements', label: 'Achievements', icone: '🏅', scope: 'medailles' },
  { href: '/medal-builder', label: 'Builder médailles', icone: '🥇', scope: 'medailles' },
  { href: '/flags', label: 'Feature Flags', icone: '🎛️', scope: 'flags' },
  { href: '/premium', label: 'Premium', icone: '⭐', scope: 'premium' },
  // Gouvernance de l'outil : cles des fournisseurs et comptes du back-office. Ce
  // sont les deux seules pages qui permettent d'elargir ses propres droits ou de
  // depenser de l'argent — elles restent au super-admin, hors systeme de perimetres.
  { href: '/ai-keys', label: 'Clés IA', icone: '🔑', scope: 'apercu', superadminSeul: true },
  { href: '/admins', label: 'Comptes back-office', icone: '👤', scope: 'apercu', superadminSeul: true },
];

/** Perimetres proposes a l'attribution (l'ordre est celui du menu, sans doublon). */
export const SCOPES_ATTRIBUABLES: { scope: Scope; label: string }[] = (() => {
  const vus = new Set<Scope>();
  const sortie: { scope: Scope; label: string }[] = [];
  for (const s of SECTIONS) {
    if (s.superadminSeul || vus.has(s.scope)) continue;
    vus.add(s.scope);
    sortie.push({ scope: s.scope, label: s.scope === 'medailles' ? 'Médailles & achievements' : s.label });
  }
  return sortie;
})();

/** Section correspondant a un chemin, ou `null` si le chemin n'est pas protege. */
export function sectionDuChemin(chemin: string): Section | null {
  let meilleure: Section | null = null;
  let longueurRetenue = -1;
  for (const s of SECTIONS) {
    const bases = [s.href, ...(s.aussi || [])];
    for (const b of bases) {
      const correspond = b === '/' ? chemin === '/' : chemin === b || chemin.startsWith(b + '/');
      // On garde la correspondance la PLUS LONGUE : `/medals-history` ne doit pas
      // etre capte par une eventuelle section `/medals`. On compare la longueur du
      // chemin REELLEMENT reconnu, pas celle du `href` de la section retenue — sans
      // quoi une correspondance sur un chemin secondaire (`/users`, long) serait
      // jugee moins bonne que le `href` de sa propre section (`/`, court).
      if (correspond && b.length > longueurRetenue) {
        meilleure = s;
        longueurRetenue = b.length;
      }
    }
  }
  return meilleure;
}

/**
 * Droit d'ouvrir une section.
 *
 * Migration douce, meme philosophie que `roleOf` : un `admin` SANS perimetres garde
 * tous les droits qu'il avait avant l'introduction de ceux-ci. Introduire une
 * granularite ne doit jamais retirer silencieusement l'acces d'un compte existant —
 * la restriction ne commence qu'a la premiere attribution explicite.
 */
export function peutVoir(role: Role, scopes: Scope[] | undefined, section: Section): boolean {
  if (role === 'owner') return true;
  if (section.superadminSeul) return false;
  if (!scopes || scopes.length === 0) return true;
  return scopes.includes(section.scope);
}

/** Sections visibles par un compte, dans l'ordre du menu. */
export function sectionsVisibles(role: Role, scopes: Scope[] | undefined): Section[] {
  return SECTIONS.filter((s) => peutVoir(role, scopes, s));
}

/** Libelle francais du role, tel qu'affiche partout dans l'interface. */
export function libelleRole(role: Role): string {
  return role === 'owner' ? 'Super-admin' : role === 'admin' ? 'Admin' : 'Lecture seule';
}

/**
 * Perimetre exige par une route d'API.
 *
 * Les pages sont filtrees par leur chemin, mais une route d'API reste joignable
 * directement : sans cette carte, un admin cantonne a la moderation pourrait
 * appeler POST /api/races a la main et creer une course. On la tient ici, a cote du
 * menu, pour qu'ajouter une section signifie toujours la proteger des deux cotes.
 *
 * Chemin inconnu = aucun perimetre exige : toutes les routes verifient de toute
 * facon l'identite et le droit d'ecrire (cf. lib/adminGuard.ts). On ne ferme donc
 * jamais par accident une route qu'on aurait oublie de recenser.
 */
const API_PERIMETRES: { prefixe: string; scope: Scope; superadminSeul?: boolean }[] = [
  { prefixe: '/api/ai-keys', scope: 'apercu', superadminSeul: true },
  { prefixe: '/api/admins', scope: 'apercu', superadminSeul: true },
  { prefixe: '/api/achievements', scope: 'medailles' },
  { prefixe: '/api/medals-history', scope: 'medailles' },
  { prefixe: '/api/flags', scope: 'flags' },
  { prefixe: '/api/marketplace', scope: 'marketplace' },
  { prefixe: '/api/moderation', scope: 'moderation' },
  { prefixe: '/api/reports', scope: 'moderation' },
  { prefixe: '/api/news', scope: 'journal' },
  { prefixe: '/api/notify', scope: 'notifications' },
  { prefixe: '/api/orgs', scope: 'orgs' },
  { prefixe: '/api/premium', scope: 'premium' },
  { prefixe: '/api/races', scope: 'courses' },
  { prefixe: '/api/sport-fields', scope: 'terrains' },
];

/** Droit d'appeler une route d'API. Vrai si la route n'exige aucun perimetre. */
export function peutAppelerApi(role: Role, scopes: Scope[] | undefined, chemin: string): boolean {
  const regle = API_PERIMETRES.find((r) => chemin === r.prefixe || chemin.startsWith(r.prefixe + '/'));
  if (!regle) return true;
  return peutVoir(role, scopes, {
    href: regle.prefixe,
    label: regle.prefixe,
    icone: '',
    scope: regle.scope,
    superadminSeul: regle.superadminSeul,
  });
}
