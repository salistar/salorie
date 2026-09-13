/**
 * Le back-office masque aussi ce qu'il envoie à Sentry.
 * ---------------------------------------------------------------------------
 * `sendDefaultPii: false` était déjà posé sur les trois runtimes. Il empêche le
 * SDK d'ajouter **de lui-même** l'adresse IP, les en-têtes et les cookies — et
 * c'est tout. Il ne touche pas à ce que notre propre code place dans un message
 * d'erreur, et ce back-office manipule des courriels d'utilisateurs, des données
 * de santé et des clés de fournisseur.
 *
 * ⚠ TROIS RUNTIMES, TROIS `Sentry.init`, ET IL EN SUFFIT D'UN OUBLI.
 * Next.js en a un pour le serveur, un pour l'Edge (le portail d'authentification
 * y tourne) et un pour le navigateur. Une erreur non masquée peut donc sortir
 * par trois portes ; ce test les vérifie une par une.
 *
 * ⚠ ET LE MODULE N'EST PAS RECOPIÉ ICI. Il vit à la racine du dépôt
 * (`lib/sentryMasquage.ts`) et sert aussi à l'application mobile — comme les
 * modules de calcul que les pages `/me` importent déjà. Une règle qui protège
 * des données de santé ne doit pas exister en deux versions qui divergent.
 */
import fs from 'fs';
import path from 'path';
import { masquerEvenement, masquerPourSentry } from '../../lib/sentryMasquage';

const RACINE = path.join(__dirname, '..');
const CONFIGS = ['sentry.server.config.ts', 'sentry.edge.config.ts', 'instrumentation-client.ts'];

describe('les trois runtimes masquent avant d envoyer', () => {
  for (const fichier of CONFIGS) {
    it(`${fichier} pose un beforeSend`, () => {
      const src = fs.readFileSync(path.join(RACINE, fichier), 'utf8');
      expect(src).toMatch(/beforeSend:/);
      expect(src).toMatch(/masquerEvenement/);
      expect(src).toMatch(/sendDefaultPii:\s*false/);
    });
  }

  it('⚠ TOUS IMPORTENT LE MODULE DE LA RACINE, AUCUN N EN FAIT UNE COPIE', () => {
    // Le jour ou quelqu'un recopie la fonction dans `web/lib/` « pour eviter un
    // import qui remonte », les deux versions commencent a diverger — et c'est
    // celle qu'on ne regarde plus qui laisse passer un courriel.
    for (const fichier of CONFIGS) {
      const src = fs.readFileSync(path.join(RACINE, fichier), 'utf8');
      expect(src).toMatch(/from '\.\.\/lib\/sentryMasquage'/);
    }
    expect(fs.existsSync(path.join(RACINE, 'lib', 'sentryMasquage.ts'))).toBe(false);
  });
});

describe('ce que le masquage efface, vu depuis le back-office', () => {
  it('les courriels — qui sont les identifiants de comptes ici', () => {
    // L'ecran `/users/<courriel>` est litteralement indexe par courriel : la
    // moitie des messages d'erreur du back-office en contient un.
    expect(masquerPourSentry('echec getUser(idriss@salistar.com)'))
      .toBe('echec getUser([courriel])');
  });

  it('les cles de fournisseur', () => {
    expect(masquerPourSentry('Incorrect API key provided: sk-proj-AbCdEfGhIjKlMnOpQr'))
      .toBe('Incorrect API key provided: [cle]');
  });

  it('les jetons de session', () => {
    expect(masquerPourSentry('cookie=eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeK'))
      .toBe('cookie=[jwt]');
  });

  it('⚠ MAIS PAS CE QUI REND UNE ERREUR LISIBLE', () => {
    // Un filtre trop large produit des rapports ou il ne reste rien a lire, ce
    // qui revient a ne pas avoir de Sentry du tout.
    for (const m of [
      'MongoServerError: E11000 duplicate key error',
      'Cannot read properties of null (reading \'role\')',
      '/users/[id] 500 en 1240 ms',
      'Firestore: 7 PERMISSION_DENIED',
    ]) {
      expect(masquerPourSentry(m)).toBe(m);
    }
  });

  it('un evenement entier passe par le meme filtre', () => {
    const ev = masquerEvenement({
      message: 'moderation refusee pour a@b.com',
      breadcrumbs: [{ message: 'POST /api/flags' }],
    });
    expect(ev.message).toBe('moderation refusee pour [courriel]');
    expect(ev.breadcrumbs![0].message).toBe('POST /api/flags');
  });

  it('⚠ ET IL NE JETTE JAMAIS : un rapport non masque vaut mieux que rien', () => {
    // Si ce code a un defaut, il ne doit pas eteindre en silence la remontee
    // d'erreurs de tout le back-office.
    const casse: any = { get message() { throw new Error('accesseur casse'); } };
    expect(() => masquerEvenement(casse)).not.toThrow();
  });
});
