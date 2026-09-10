// Sentry — runtime Edge (middleware). Meme configuration que le serveur, mais
// Next.js charge un bundle distinct : sans ce fichier, le middleware ne remonte rien.
import * as Sentry from '@sentry/nextjs';

const dsn =
  process.env.SENTRY_DSN ||
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
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    sendDefaultPii: false,
  });
}
