// Sentry — cote navigateur du back-office.
// Ce DSN part dans le bundle client : c'est prevu et sans risque (ecriture seule).
//
// ⚠ CE FICHIER S'APPELAIT `sentry.client.config.ts`, ET IL N'ETAIT PLUS CHARGE.
// Next 15.5 declare cette convention depreciee ; sous Turbopack — le bundler par
// defaut depuis Next 16 — elle cesse purement et simplement d'etre lue. Le build
// passe, rien ne casse, et la surveillance navigateur s'arrete.
//
// Mesure du 10/09/2026, apres la montee en Next 16 : le DSN n'apparaissait dans
// AUCUN fichier de `.next/static/`. Aucune erreur navigateur du back-office ne
// pouvait donc remonter. La landing, elle, avait deja fait ce renommage — et son
// DSN etait bien dans son bundle. Le meme piege, evite d'un cote et pas de
// l'autre.
import * as Sentry from '@sentry/nextjs';
import { masquerEvenement } from '../lib/sentryMasquage';

const dsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  'https://3ab9cffb80c59c027358fcf098a67ff6@o4509622074081280.ingest.de.sentry.io/4511913448767568';

if (dsn) {
  Sentry.init({
    dsn,
    // Voir `backend/src/instrument.ts` : sans release, une erreur n'appartient
    // a aucune version. Vercel et GitHub exposent chacun le SHA du deploiement.
    release:
      process.env.SENTRY_RELEASE
      || process.env.VERCEL_GIT_COMMIT_SHA
      || process.env.GITHUB_SHA
      || undefined,
    environment: process.env.NODE_ENV || 'development',
    // Rien depuis le poste de dev : la console affiche deja tout.
    enabled: process.env.NODE_ENV === 'production',
    // ⚠ LE TUNNEL SE DECLARE ICI, PLUS DANS `next.config.mjs`.
    // `withSentryConfig({ tunnelRoute })` n'agit que par le plugin WEBPACK
    // (verifie dans le SDK : `_sentryRewritesTunnelPath` ne vit que dans
    // `config/webpack.js`). Next 16 compilant avec Turbopack, la cle etait lue,
    // acceptee, et sans effet : le navigateur repartait en direct vers Sentry,
    // c'est-a-dire dans le bloqueur de publicite. La route est desormais ecrite
    // a la main — voir `app/monitoring/route.ts`.
    tunnel: '/monitoring',
    tracesSampleRate: 0.1,
    // Pas de Session Replay : l'ecran de moderation affiche des donnees
    // d'utilisateurs, on ne veut pas les rejouer dans un service tiers.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    // ⚠ `sendDefaultPii: false` NE COUVRE PAS CE QUE NOTRE CODE ECRIT.
    // Ce reglage empeche le SDK d'ajouter DE LUI-MEME l'adresse IP, les
    // en-tetes et les cookies. Il ne touche pas a ce qu'un `throw new
    // Error('echec pour ' + email)` place dans le message — et ce back-office
    // manipule des courriels, des donnees de sante et des cles de fournisseur.
    //
    // Le masquage vit dans `lib/sentryMasquage.ts`, A LA RACINE DU DEPOT, et
    // n'est PAS recopie ici : une regle qui protege des donnees de sante ne
    // doit pas exister en deux versions qui divergent. C'est le meme module que
    // l'application mobile, et le meme que les pages /me importent deja pour
    // leurs calculs.
    beforeSend: (evenement) => masquerEvenement(evenement as any) as any,
  });
}
