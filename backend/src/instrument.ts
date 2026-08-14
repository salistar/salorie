// Initialisation de Sentry — DOIT être le tout premier import de main.ts.
//
// Le SDK instrumente Express, Mongoose et le scheduler en monkey-patchant leurs
// modules AU MOMENT du require. Si NestFactory (ou n'importe quel module métier)
// est chargé avant, ces modules sont déjà en mémoire non patchés : les erreurs
// remontent encore, mais sans trace ni contexte de requête.
//
// Pourquoi ce fichier existe : le 13/08/2026, le cron d'insights (`0 3 * * *`)
// échouait CHAQUE NUIT en silence à cause d'une clé Gemini invalide. Aucune
// alerte, aucun log consulté — découvert par hasard des semaines plus tard.
// C'est exactement ce que Sentry est censé attraper.
import * as Sentry from '@sentry/nestjs';

// Le DSN n'est PAS un secret : il est en écriture seule et conçu pour être
// embarqué dans du code client. On le laisse donc en clair, avec une valeur par
// défaut, plutôt que de le faire transiter par un secret GitHub — `gh secret set`
// a déjà enregistré des chaînes vides deux fois sur ce projet.
const dsn =
  process.env.SENTRY_DSN ||
  'https://c0ed23c86fd735f5221fc2266418fa8a@o4509622074081280.ingest.de.sentry.io/4511911712129104';

// Vide explicitement = « je ne veux pas de Sentry » (tests, dev local).
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    // Échantillonnage des traces : 10 % en production suffit à voir les tendances
    // sans consommer le quota gratuit. Les ERREURS, elles, sont toujours envoyées.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    // Ne jamais envoyer le corps des requêtes : on y trouve des photos de repas
    // en base64 et des données de santé. Les en-têtes non plus.
    sendDefaultPii: false,
  });
}
