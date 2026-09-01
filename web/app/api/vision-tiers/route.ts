// Etat des paliers de vision — relais vers le backend, avec la cle d'admin.
// ---------------------------------------------------------------------------
// POURQUOI CE RELAIS
// La route `/ml/vision-tiers` du backend est protegee par `x-admin-key`, que
// seule cette application detient (variable de serveur, jamais envoyee au
// navigateur). Le relais permet de consulter l'etat depuis la page des cles,
// avec la session d'admin deja ouverte, sans manipuler la cle a la main.
//
// CE QU'ELLE REPOND, ET POURQUOI C'EST UTILE
// Un palier de vision se tait pour deux raisons qu'on ne distingue pas de
// l'exterieur : la cle manque, ou le MODELE demande n'existe plus chez le
// fournisseur. Groq a passe des semaines muet pour la seconde raison — cle
// valide, modele « preview » retire. Cette route interroge chaque fournisseur et
// verifie que le modele qu'on s'apprete a appeler figure encore dans sa liste.
//
// Aucune cle ne transite : la reponse ne contient que des noms de modeles.
import { NextResponse } from 'next/server';
import { requireAdmin, unauthorized } from '../../../lib/adminGuard';

export const dynamic = 'force-dynamic';

// BACKEND_URL : la meme variable que les autres relais d'admin. J'avais pris
// NEXT_PUBLIC_API_URL, qui n'est pas celle que le serveur renseigne.
const API = process.env.BACKEND_URL || 'https://api.salorie.com';

export async function GET(req: Request) {
  // Le middleware refuse deja toute route d'API hors perimetre, mais les autres
  // relais d'admin doublent ce controle ici. Deux verrous valent mieux qu'un
  // quand la route porte la cle d'admin du backend.
  const _admin = await requireAdmin(); if (!_admin) return unauthorized();
  try {
    const h: Record<string, string> = {};
    if (process.env.ADMIN_API_KEY) h['x-admin-key'] = process.env.ADMIN_API_KEY;

    // `?essai=1` demande un essai REEL : une image de 1x1 pixel envoyee a chaque
    // fournisseur. C'est la seule facon de distinguer « le modele existe » de
    // « le modele sait voir ». Facturable au jeton pres, donc jamais par defaut.
    const essai = new URL(req.url).searchParams.get('essai') === '1' ? '?essai=1' : '';

    // La sonde interroge une dizaine de fournisseurs : sans borne, un
    // fournisseur qui ne repond jamais ferait pendre la page indefiniment. Un
    // essai reel ajoute un aller-retour par fournisseur : la borne monte.
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), essai ? 90000 : 30000);
    const r = await fetch(`${API}/ml/vision-tiers${essai}`, {
      headers: h, cache: 'no-store', signal: ctl.signal,
    });
    clearTimeout(to);

    if (!r.ok) {
      return NextResponse.json(
        { error: `le backend a refuse (HTTP ${r.status})` },
        { status: r.status },
      );
    }
    return NextResponse.json(await r.json());
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || 'backend injoignable') },
      { status: 502 },
    );
  }
}
