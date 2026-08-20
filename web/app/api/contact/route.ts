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

export async function POST(req: Request) {
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
