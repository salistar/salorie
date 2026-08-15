// Sentry — côté serveur du back-office (routes API, rendu serveur).
// Charge par `instrumentation.ts`, que Next.js execute avant tout le reste.
import * as Sentry from '@sentry/nextjs';

// Le DSN n'est pas un secret : ecriture seule, et la variante client finit de
// toute facon dans le bundle navigateur. Valeur par defaut en clair, surchargeable
// par l'environnement ; une chaine vide desactive Sentry proprement.
const dsn =
  process.env.SENTRY_DSN ||
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  'https://3ab9cffb80c59c027358fcf098a67ff6@o4509622074081280.ingest.de.sentry.io/4511913448767568';

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    // Le back-office manipule des donnees d'utilisateurs (moderation, feedback,
    // emails support) : on veut la pile d'appel, jamais le contenu.
    sendDefaultPii: false,
  });
}
