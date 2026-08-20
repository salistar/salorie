import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, AUTH_COOKIE } from './lib/jwt';
import { sectionDuChemin, peutVoir, sectionsVisibles, peutAppelerApi } from './lib/scopes';

// Auth gate basée sur un JWT cookie (login/register custom + MongoDB).
// Remplace l'ancien HTTP Basic Auth. Edge-safe (jose uniquement, pas de mongoose).
const PUBLIC = ['/login', '/register'];
// Landing fusionnee (ex-depot salorie-landing) : pages publiques par nature.
const LANDING = ['/', '/ar', '/en', '/contact', '/privacy', '/terms', '/refund', '/delete-account'];

// L'espace personnel /me a son PROPRE gardien — Clerk, cote navigateur, avec la meme
// instance que l'app mobile. Le laisser tomber dans le portail par jeton d'admin
// renverrait chaque utilisateur vers /login, une page d'administration qu'il n'a
// aucune raison de voir et ou son compte Salorie ne fonctionne pas. Les deux
// systemes d'authentification cohabitent donc sans se croiser : jeton Mongo pour le
// back-office, Clerk + Firebase pour les utilisateurs.
const ESPACE_PERSONNEL = '/me';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === ESPACE_PERSONNEL || pathname.startsWith(ESPACE_PERSONNEL + '/')) {
    return NextResponse.next();
  }
  // Fichiers publics servis a la racine par la landing (robots.txt, sitemap.xml,
  // og.png, screenshots/*). Un point dans le DERNIER segment = un fichier statique.
  const dernier = pathname.split('/').pop() || '';
  if (dernier.includes('.')) {
    return NextResponse.next();
  }
  // Routes publiques : pages d'auth + API d'auth + landing.
  if (pathname.startsWith('/api/auth') || PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))
      || LANDING.some((r) => pathname === r || (r !== '/' && pathname.startsWith(r + '/')))) {
    return NextResponse.next();
  }
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? await verifyToken(token) : null;
  if (!payload) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Routes d'API : on REFUSE en JSON. Une redirection renverrait du HTML a du code
  // qui attend des donnees, et l'interface afficherait une erreur incomprehensible.
  if (pathname.startsWith('/api/') && !peutAppelerApi(payload.role, payload.scopes, pathname)) {
    return NextResponse.json(
      { ok: false, error: 'Hors de tes périmètres' },
      { status: 403 },
    );
  }

  // Perimetres : un admin qui tape une URL hors de ses sections n'atterrit pas sur
  // une page vide ni sur une erreur, mais sur la premiere section qu'il a le droit
  // de voir. Le menu ne lui proposait deja pas ce lien (cf. Sidebar) — ceci ferme
  // l'acces direct par l'URL, qui restait ouvert.
  const section = sectionDuChemin(pathname);
  if (section && !peutVoir(payload.role, payload.scopes, section)) {
    const url = req.nextUrl.clone();
    const permises = sectionsVisibles(payload.role, payload.scopes);
    url.pathname = permises[0]?.href || '/login';
    url.searchParams.set('refus', section.href);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // ⚠ NE JAMAIS AJOUTER DE MOTIF A LA CLAUSE DE NEGATION `(?!…)`.
  // Le 20/08/2026, y ajouter `.*\..*` pour laisser passer robots.txt a ouvert une
  // FAILLE : a la compilation du motif, `\.` devient `.` (n'importe quel caractere),
  // donc la negation excluait TOUT — /admin etait servi SANS jeton, emails exposes.
  // Les fichiers publics (un point dans le dernier segment) sont traites DANS LE
  // CORPS du middleware, ou aucune regle d'echappement ne se retourne contre nous.
  // Apres tout changement ici : re-tester `/admin` sans cookie (doit repondre 307).
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
