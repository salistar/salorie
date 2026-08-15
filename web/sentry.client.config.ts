// Sentry — cote navigateur du back-office.
// Ce DSN part dans le bundle client : c'est prevu et sans risque (ecriture seule).
import * as Sentry from '@sentry/nextjs';

const dsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  'https://3ab9cffb80c59c027358fcf098a67ff6@o4509622074081280.ingest.de.sentry.io/4511913448767568';

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    // Rien depuis le poste de dev : la console affiche deja tout.
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 0.1,
    // Pas de Session Replay : l'ecran de moderation affiche des donnees
    // d'utilisateurs, on ne veut pas les rejouer dans un service tiers.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}
