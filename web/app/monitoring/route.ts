/**
 * Le tunnel Sentry, écrit à la main — parce que celui du SDK ne marche plus.
 * ---------------------------------------------------------------------------
 * Les bloqueurs de publicité coupent les requêtes vers `*.sentry.io`. Sans
 * relais, une partie des erreurs NAVIGATEUR disparaît sans laisser de trace :
 * pas d'échec visible, juste moins d'erreurs — la pire forme de silence.
 * `withSentryConfig({ tunnelRoute: '/monitoring' })` existait pour ça.
 *
 * ⚠ `tunnelRoute` EST UNE OPTION WEBPACK, ET NEXT 16 COMPILE AVEC TURBOPACK.
 * Vérifié dans le SDK lui-même (10.74.0) : `_sentryRewritesTunnelPath` n'est
 * défini que dans `config/webpack.js`. Sous Turbopack, la clé est lue, acceptée,
 * et sans le moindre effet — aucun avertissement. La route n'existait donc plus
 * (404) et le navigateur repartait en direct vers Sentry, c'est-à-dire dans le
 * bloqueur. Constaté le 10/09/2026, après la montée en Next 16.
 *
 * ⚠ CETTE ROUTE EST PUBLIQUE PAR NÉCESSITÉ — elle sort du portail dans
 * `proxy.ts`. Les erreurs à remonter sont justement celles des visiteurs
 * NON connectés : la landing, `/me`, et la page de connexion elle-même.
 *
 * ⚠ ELLE NE DOIT DONC RELAYER QUE VERS NOTRE PROJET.
 * Une route publique qui repost le corps reçu vers l'hôte que le corps indique
 * est un relais ouvert : n'importe qui s'en servirait pour faire émettre notre
 * serveur vers n'importe où. L'enveloppe annonce son DSN dans sa première
 * ligne ; on le compare au nôtre, hôte ET numéro de projet, et on refuse tout
 * le reste.
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
// Rien à mettre en cache ici, et surtout rien à pré-rendre.
export const dynamic = 'force-dynamic';

/** Le seul DSN autorisé : celui du back-office, comme côté navigateur. */
const DSN_ATTENDU =
  process.env.NEXT_PUBLIC_SENTRY_DSN
  || 'https://3ab9cffb80c59c027358fcf098a67ff6@o4509622074081280.ingest.de.sentry.io/4511913448767568';

/** Une enveloppe d'erreur pèse quelques kilo-octets ; 1 Mo est déjà très large. */
const TAILLE_MAX = 1_000_000;

type Cible = { hote: string; projet: string };

function lireDsn(dsn: string): Cible | null {
  try {
    const u = new URL(dsn);
    const projet = u.pathname.replace(/^\//, '');
    if (!u.hostname || !/^\d+$/.test(projet)) return null;
    return { hote: u.hostname, projet };
  } catch {
    return null;
  }
}

const NOTRE_CIBLE = lireDsn(DSN_ATTENDU);

export async function POST(req: NextRequest) {
  try {
    const enveloppe = await req.text();
    if (!enveloppe || enveloppe.length > TAILLE_MAX) {
      return new NextResponse(null, { status: 413 });
    }

    // Première ligne de l'enveloppe = son en-tête JSON, qui porte le DSN.
    const [entete] = enveloppe.split('\n', 1);
    const annonce = lireDsn(JSON.parse(entete)?.dsn ?? '');

    // Un DSN absent, illisible, ou qui n'est pas le nôtre : on ne relaie pas.
    if (!annonce || !NOTRE_CIBLE
        || annonce.hote !== NOTRE_CIBLE.hote
        || annonce.projet !== NOTRE_CIBLE.projet) {
      return new NextResponse(null, { status: 403 });
    }

    const amont = `https://${NOTRE_CIBLE.hote}/api/${NOTRE_CIBLE.projet}/envelope/`;
    const r = await fetch(amont, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: enveloppe,
    });

    // On rend le statut d'amont : le SDK sait alors s'il doit réessayer.
    return new NextResponse(null, { status: r.status });
  } catch {
    // Un rapport d'erreur perdu ne doit jamais provoquer une erreur de plus.
    return new NextResponse(null, { status: 204 });
  }
}
