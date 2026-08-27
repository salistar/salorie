import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE } from '../../../../lib/jwt';

export const runtime = 'nodejs';

// Deconnexion du back-office.
// ---------------------------------------------------------------------------
// Cette route est appelee par un <form method="post"> depuis la barre laterale.
// Elle renvoyait `{ ok: true }` en JSON : le navigateur affichait donc la page
// brute `/api/auth/logout` avec du JSON a l'ecran, au lieu de ramener a la
// connexion. Constate le 27/08/2026.
//
// On redirige desormais vers `/login?deconnexion=1`. Le parametre n'est pas
// decoratif : il dit a l'ecran de connexion de fermer AUSSI la session Clerk.
// Sans cela, effacer le cookie admin ne suffit pas — Clerk reste connecte, le
// pont Google se rejoue immediatement, et on se retrouve reconnecte au MEME
// compte. Changer de compte etait donc impossible.
//
// 303 (See Other) et non 302 : apres un POST, c'est le code qui impose au
// navigateur de suivre en GET. Un 302 laisse certains clients rejouer le POST.
//
// ⚠ REDIRECTION RELATIVE, ET SURTOUT PAS `NextResponse.redirect(new URL(..., req.url))`.
// Derriere Caddy, `req.url` porte l'adresse INTERNE du conteneur : l'en-tete
// Location partait vers `http://localhost:3000/login` et le navigateur affichait
// ERR_CONNECTION_REFUSED. Constate en production le 27/08/2026.
//
// Un chemin relatif est autorise par la RFC 7231 et resolu par le navigateur
// contre l'URL courante : aucune detection d'hote, donc rien a casser le jour
// ou le domaine change — et il a deja change une fois cette annee.
function deconnecter(_req: NextRequest) {
  const res = new NextResponse(null, {
    status: 303,
    headers: { Location: '/login?deconnexion=1' },
  });
  res.cookies.set(AUTH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}

export async function POST(req: NextRequest) {
  return deconnecter(req);
}

// Certains liens de deconnexion sont de simples <a href>. Les accepter evite un
// 405 qui laisserait l'utilisateur connecte en croyant s'etre deconnecte.
export async function GET(req: NextRequest) {
  return deconnecter(req);
}
