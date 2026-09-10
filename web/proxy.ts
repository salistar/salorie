/**
 * Le portail d'authentification du back-office.
 * ---------------------------------------------------------------------------
 * ⚠ CE FICHIER S'APPELAIT `middleware.ts`, ET LE CONCEPT S'APPELLE TOUJOURS
 * « middleware » un peu partout dans ce dépôt. Next 16 déprécie cette
 * convention au profit de `proxy` — sa raison est que « middleware » évoque
 * celui d'Express, qui ne fait pas la même chose. Le fichier doit donc porter
 * ce nom, et exporter `proxy`, pour continuer d'être exécuté.
 *
 * ⚠ RENOMMER UN FICHIER NE SUFFIT PAS ICI : le déploiement synchronise `web/`
 * sur le VPS sans supprimer les fichiers disparus — sa purge ne connaît que des
 * RÉPERTOIRES entiers. Un `middleware.ts` orphelin serait resté à côté du
 * nouveau `proxy.ts`, et Next aurait exécuté l'ancien. D'où la ligne ajoutée à
 * l'étape « Purge » de `deploy-backend-web.yml`, le même jour que ce
 * renommage : les deux vont ensemble, ou aucun des deux.
 */
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

// ⚠ LE TUNNEL SENTRY DOIT ETRE PUBLIC, SINON IL NE REMONTE RIEN.
// `tunnel: '/monitoring'` (instrumentation-client.ts, relaye par
// app/monitoring/route.ts) fait transiter les rapports du NAVIGATEUR par notre
// domaine, parce que les bloqueurs de publicite coupent les appels directs vers
// *.sentry.io. Mais cette route tombait dans la regle generale :
// `POST /monitoring` rendait 307 vers /login, et le SDK, qui attend une reponse
// de Sentry, jetait le rapport.
//
// Constate le 10/09/2026, sur les DEUX domaines. Consequence : aucune erreur
// navigateur d'un visiteur non connecte n'arrivait — c'est-a-dire celles de la
// landing, de /me et de la page de connexion elle-meme, soit la quasi-totalite
// du trafic. Le silence de Sentry ressemblait a une absence de bugs.
const TUNNEL_SENTRY = '/monitoring';

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === TUNNEL_SENTRY || pathname.startsWith(TUNNEL_SENTRY + '/')) {
    return NextResponse.next();
  }
  if (pathname === ESPACE_PERSONNEL || pathname.startsWith(ESPACE_PERSONNEL + '/')) {
    return NextResponse.next();
  }
  // Fichiers publics servis a la racine par la landing (robots.txt, sitemap.xml,
  // og.png, screenshots/*).
  //
  // ⚠ LA REGLE ETAIT « UN POINT DANS LE DERNIER SEGMENT = UN FICHIER ».
  // Elle laissait donc passer SANS AUTHENTIFICATION tout chemin finissant par un
  // point — et les identifiants d'utilisateur de cette application sont des
  // ADRESSES COURRIEL. `/users/test@example.com` se termine par « .com » : le
  // middleware le prenait pour un fichier statique et n'exigeait aucune session.
  //
  // Constate le 10/09/2026, en verifiant la montee en Next 16 : `/users` rendait
  // 307 vers /login, `/users/<courriel>` rendait 200. Le meme comportement
  // existait en production, donc ce n'est pas une regression de la montee — mais
  // c'est elle qui l'a fait voir.
  //
  // Aucune donnee ne fuyait : `requireAdmin` refuse dans la page elle-meme, et
  // le corps ne contenait que « unauthorized ». C'est la defense en profondeur
  // qui a tenu, pas cette regle. Un ecran d'administration qui oublierait son
  // propre controle serait, lui, entierement ouvert.
  //
  // On n'accepte donc plus qu'une EXTENSION CONNUE, en fin de chemin. La liste
  // est celle des fichiers reellement presents dans `public/`.
  const EXTENSIONS_PUBLIQUES = /\.(txt|xml|png|jpg|jpeg|svg|ico|webmanifest|md)$/i;
  if (EXTENSIONS_PUBLIQUES.test(pathname)) {
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
