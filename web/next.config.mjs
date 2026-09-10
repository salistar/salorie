import path from 'node:path';
import { fileURLToPath } from 'node:url';
// ⚠ IMPORTE DEPUIS `@sentry/nextjs/config`, PAS DEPUIS LA RACINE.
// Le SDK 10.74 avertit que l'import racine cessera de fonctionner en v11 : la
// racine embarque le runtime du SDK, ce fichier n'a besoin que du plugin de
// build.
import { withSentryConfig } from '@sentry/nextjs/config';

const ICI = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ⚠ SANS CETTE LIGNE, LE BUILD PASSE EN LOCAL ET ECHOUE EN CONTENEUR.
  // Next 16 compile avec Turbopack, qui « ne resout PAS les fichiers hors de la
  // racine du projet » et devine cette racine en cherchant un fichier de
  // verrouillage (`package-lock.json`, `pnpm-lock.yaml`, ...).
  //
  // Les pages de /me importent les modules de calcul du depot mobile
  // (`../../../../lib/nutriScore`, `../../../../assets/data/local-foods.json`).
  //   • En local, `salorie/package-lock.json` existe : la racine devinee est le
  //     depot entier, et `salorie/lib` est dedans. Le build passe.
  //   • Dans l'image, seul `web/package-lock.json` est copie : la racine devinee
  //     est `web/` seul, et les memes imports tombent dehors. Neuf « Module not
  //     found », build casse — constate le 10/09/2026 au premier deploiement
  //     apres la montee en Next 16.
  //
  // On la fixe donc explicitement au PARENT de `web/`, ce qui donne le depot en
  // local et `/app` dans l'image : le meme arbre des deux cotes, et plus rien
  // qui depende de l'endroit ou traine un fichier de verrouillage.
  turbopack: { root: path.join(ICI, '..') },
  // firebase-admin is server-only; keep it out of the client bundle (Next 14 key).
  // ⚠ RENOMME EN NEXT 15 : `experimental.serverComponentsExternalPackages`
  // est devenu `serverExternalPackages`, a la racine. L'ancienne cle n'est
  // plus lue — silencieusement — et `firebase-admin` repartait alors dans le
  // bundle client, ce qui casse le build ou expose du code serveur.
  serverExternalPackages: ['firebase-admin'],
  // En-têtes de sécurité (anti-clickjacking, anti-sniff, fuite de referrer).
  // CSP stricte volontairement omise (Next + styles/scripts inline) pour ne rien casser.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // HSTS : le navigateur refuse ensuite tout http:// vers ce domaine, sans
          // meme tenter la requete. Caddy redirige deja 80 vers 443, mais cette
          // premiere requete en clair reste interceptable — c'est exactement la
          // fenetre que HSTS ferme.
          //
          // `preload` VOLONTAIREMENT ABSENT : il inscrit le domaine dans une liste
          // embarquee dans les navigateurs, dont on ne sort qu'apres des mois. Un
          // an de max-age donne la meme protection et reste reversible.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // `()` = liste vide = AUCUNE origine, pas meme la notre. Ecrit avant que
          // le web sache appeler, cet en-tete interdisait a l'app son propre micro
          // et sa propre camera : `navigator.permissions.query` repondait `denied`
          // et `getUserMedia` echouait, quoi que fasse l'utilisateur dans son
          // navigateur. Les appels du duo ne pouvaient donc PAS fonctionner — le
          // defaut ressemblait a une autorisation refusee a la main (constate le
          // 22/08/2026, apres avoir envoye l'utilisateur quatre fois vers le
          // cadenas de la barre d'adresse pour rien).
          //
          // `(self)` n'ouvre qu'a NOTRE origine : une iframe tierce reste exclue,
          // ce qui etait le but de cet en-tete. La geolocalisation reste fermee :
          // c'est le TELEPHONE qui mesure le parcours, cet ecran ne fait
          // qu'afficher la distance qu'il envoie.
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(self), camera=(self)' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};
// `withSentryConfig` branche le plugin de build : il enveloppe les routes API et
// le rendu serveur, et peut televerser les source maps.
//
// Le televersement des source maps exige un SENTRY_AUTH_TOKEN, qui n'est PAS
// configure ici. Sans lui, le build fonctionne normalement — les traces seront
// simplement minifiees dans Sentry. `silent` evite un avertissement a chaque
// build de production pour une fonctionnalite qu'on n'utilise pas encore.
export default withSentryConfig(nextConfig, {
  org: 'salistarcompany',
  project: 'salorie-admin',
  silent: !process.env.CI,
  // ⚠ `tunnelRoute` A ETE RETIREE D'ICI, ET CE N'EST PAS UN ABANDON.
  // Le tunnel masque les requetes Sentry derriere une route du site, les
  // bloqueurs de publicite coupant les appels vers *.sentry.io. Mais cette
  // option n'agit QUE par le plugin webpack du SDK
  // (`_sentryRewritesTunnelPath`, defini dans son seul `config/webpack.js`) :
  // sous Turbopack, elle est lue, acceptee, et sans le moindre effet. La
  // laisser ici ferait croire a une protection qui n'existe plus.
  //
  // Le tunnel est donc ecrit a la main : `app/monitoring/route.ts` pour le
  // relais, `tunnel: '/monitoring'` dans `instrumentation-client.ts` pour que
  // le navigateur l'emprunte, et une sortie dediee dans `proxy.ts` pour
  // qu'il ne finisse pas redirige vers /login.
  // Retire les traces de debogage du SDK du bundle. Remplace `disableLogger`,
  // deprecie et supprime dans une version a venir.
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
  // ── Elagage de Replay : pose, MAIS SANS EFFET MESURABLE ─────────────────
  //
  // `instrumentation-client.ts` eteint Replay des deux cotes
  // (`replaysSessionSampleRate` et `replaysOnErrorSampleRate` a 0), et c'est
  // deliberе : l'ecran de moderation affiche des donnees sensibles. Mettre un
  // taux a zero n'ENLEVE toutefois pas le code du bundle, d'ou ces drapeaux.
  //
  // MESURE DU 26/08/2026, avant / apres : le chunk Sentry fait 364 Ko dans les
  // DEUX cas. Aucun gain. Ces options n'excluent que des sous-modules de Replay
  // (canvas, iframe, shadow DOM, worker), qui sont petits. Le poids reel est le
  // coeur du SDK plus le TRACAGE navigateur, et `tracesSampleRate: 0.1` le
  // garde actif.
  //
  // On les laisse : elles sont justes sur le principe, et sans elles quelqu'un
  // refera l'essai en croyant tenir la solution. Mais le vrai levier n'est pas
  // un reglage, c'est un arbitrage : 364 Ko sur CHAQUE chargement valent-ils
  // 10 % de traces navigateur ? A comparer avec Clerk + Firebase, 366 Ko dans
  // le meme ordre de grandeur, eux indispensables.
  bundleSizeOptimizations: {
    excludeReplayCanvas: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
    excludeDebugStatements: true,
  },
});