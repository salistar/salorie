// Sentry — côté serveur du back-office (routes API, rendu serveur).
// Charge par `instrumentation.ts`, que Next.js execute avant tout le reste.
import * as Sentry from '@sentry/nextjs';
import { masquerEvenement } from '../lib/sentryMasquage';

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
    // Voir `backend/src/instrument.ts` : sans release, une erreur n'appartient
    // a aucune version. Vercel et GitHub exposent chacun le SHA du deploiement.
    release:
      process.env.SENTRY_RELEASE
      || process.env.VERCEL_GIT_COMMIT_SHA
      || process.env.GITHUB_SHA
      || undefined,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    // Le back-office manipule des donnees d'utilisateurs (moderation, feedback,
    // emails support) : on veut la pile d'appel, jamais le contenu.
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
