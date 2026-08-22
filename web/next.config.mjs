import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // firebase-admin is server-only; keep it out of the client bundle (Next 14 key).
  experimental: { serverComponentsExternalPackages: ['firebase-admin'] },
  // En-têtes de sécurité (anti-clickjacking, anti-sniff, fuite de referrer).
  // CSP stricte volontairement omise (Next + styles/scripts inline) pour ne rien casser.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
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
  // Masque le DSN et les requetes Sentry derriere une route du site : les
  // bloqueurs de publicite coupent les appels vers *.sentry.io, ce qui ferait
  // disparaitre une partie des erreurs navigateur sans qu'on le sache.
  tunnelRoute: '/monitoring',
  // Retire les traces de debogage du SDK du bundle. Remplace `disableLogger`,
  // deprecie et supprime dans une version a venir.
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});
