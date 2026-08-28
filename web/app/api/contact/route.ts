import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Relais du formulaire de contact vers le tableau de bord de salistar.com.
 *
 * POURQUOI UN RELAIS ET PAS UN APPEL DIRECT DEPUIS LE NAVIGATEUR : poster
 * depuis salorie.com vers salistar.com serait une requete inter-origines, donc
 * un pre-vol CORS a maintenir des deux cotes, et un envoi qui casse le jour ou
 * un navigateur durcit sa politique. Ici le navigateur ne parle qu'a
 * salorie.com ; c'est le serveur qui transmet.
 *
 * Les deux sites tournent sur le meme hote : l'appel ne sort pas de la machine.
 */

const CIBLE = process.env.CONTACT_RELAY_URL || 'https://salistar.com/api/contact';

// ── Limitation de debit ────────────────────────────────────────────────────
//
// POURQUOI ELLE ARRIVE MAINTENANT
// Le test `roles.test.ts` signalait ce POST comme non garde. Un garde de ROLE
// y serait faux — le formulaire s'adresse a des visiteurs anonymes — mais
// l'exclure sans rien mettre a la place aurait fait de cette route la seule
// entree publique sans aucune protection : une boucle suffisait a relayer des
// milliers de messages vers salistar.com sous notre nom.
//
// Meme forme que /api/auth/google, deliberement : une seule facon de faire
// dans ce depot vaut mieux qu'une deuxieme, meilleure sur le papier.
//
// ⚠ En memoire du processus : cela suffit contre une boucle depuis une IP, pas
// contre une campagne distribuee. La cible reste seule juge de ce qu'elle
// accepte — cette limite protege le relais, pas le destinataire.
const TENTATIVES = new Map<string, { n: number; reset: number }>();
const FENETRE_MS = 10 * 60 * 1000;
const MAX = 5;

function tropDeMessages(ip: string): boolean {
  const t = Date.now();
  const e = TENTATIVES.get(ip);
  if (!e || t > e.reset) {
    TENTATIVES.set(ip, { n: 1, reset: t + FENETRE_MS });
    return false;
  }
  e.n += 1;
  return e.n > MAX;
}

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'inconnue';
  if (tropDeMessages(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Trop de messages envoyes. Reessaie dans quelques minutes.' },
      { status: 429 },
    );
  }

  let corps: unknown;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Requete invalide.' }, { status: 400 });
  }

  try {
    const reponse = await fetch(CIBLE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `site` est impose ici, jamais repris du client : sans ca, n'importe qui
      // pourrait faire passer ses messages pour venir d'un autre site.
      body: JSON.stringify({ ...(corps as Record<string, unknown>), site: 'salorie.com' }),
      signal: AbortSignal.timeout(15_000),
    });

    const data = await reponse.json().catch(() => ({}));
    return NextResponse.json(data, { status: reponse.status });
  } catch (e) {
    console.error('[contact] relais impossible:', (e as Error).message);
    // Message honnete : on ne pretend pas avoir enregistre ce qui n'est jamais
    // arrive. L'adresse email de repli est indiquee au visiteur.
    return NextResponse.json(
      { ok: false, error: 'Envoi impossible pour le moment. Ecris-nous a support@salorie.com.' },
      { status: 502 },
    );
  }
}
