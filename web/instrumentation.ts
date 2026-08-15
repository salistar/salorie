// Point d'entree d'instrumentation de Next.js : execute une seule fois au
// demarrage du serveur, avant toute requete. C'est ici qu'on charge la config
// Sentry correspondant au runtime — le bundle Node et le bundle Edge sont
// distincts, un seul fichier ne couvrirait pas les deux.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Remonte les erreurs de rendu des Server Components, que le try/catch classique
// n'attrape pas.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
