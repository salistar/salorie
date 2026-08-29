import { StravaService } from './strava.service';

/**
 * Ce qui est mis à l'épreuve ici : la SIGNATURE DU `state`.
 *
 * L'URL de retour de Strava est publique — elle le doit, le navigateur redirigé
 * ne porte pas notre jeton. Tout ce qui empêche alors de rattacher un compte
 * Strava à la personne de son choix tient dans ces quelques lignes de HMAC. Un
 * `state` non signé, et l'intégration devient un détournement de compte servi
 * dans une barre d'adresse.
 *
 * Le reste (appels HTTP à Strava, normalisation) n'est pas couvert ici : cela
 * demanderait un compte Strava réel et des jetons. Ce fichier ne prétend pas au
 * contraire.
 */

const faireService = () => {
  process.env.FEATURES_USER_SECRET = 'secret-de-test';
  process.env.STRAVA_CLIENT_ID = '12345';
  process.env.STRAVA_CLIENT_SECRET = 'sc';
  process.env.STRAVA_REDIRECT_URI = 'https://api.salorie.com/strava/retour';
  return new StravaService({ db: () => ({}) } as any);
};

const stateDe = (url: string) => new URL(url).searchParams.get('state')!;

describe('Strava — la signature du state', () => {
  it('accepte le state que le serveur a lui-même émis', () => {
    const s = faireService();
    const state = stateDe(s.urlAutorisation('alice@exemple.com'));
    expect(s.verifierState(state)).toBe('alice@exemple.com');
  });

  it('REFUSE un state fabriqué de toutes pièces', () => {
    const s = faireService();
    // Ce qu'un attaquant écrirait s'il croyait le state lisible en clair.
    const forge = Buffer.from('victime@exemple.com.' + Date.now()).toString('base64url') + '.signature';
    expect(() => s.verifierState(forge)).toThrow();
  });

  it("REFUSE un state dont on a change l'utilisateur en gardant la signature", () => {
    const s = faireService();
    const state = stateDe(s.urlAutorisation('alice@exemple.com'));
    const [charge, signature] = state.split('.');
    const detourne =
      Buffer.from(
        Buffer.from(charge, 'base64url').toString().replace('alice', 'victime'),
      ).toString('base64url') + '.' + signature;
    expect(() => s.verifierState(detourne)).toThrow();
  });

  it('REFUSE un state expiré', () => {
    const s = faireService();
    const state = stateDe(s.urlAutorisation('alice@exemple.com'));
    // Onze minutes plus tard : au-delà de la fenêtre de dix.
    const vrai = Date.now;
    Date.now = () => vrai() + 11 * 60 * 1000;
    try {
      expect(() => s.verifierState(state)).toThrow(/expiré/);
    } finally {
      Date.now = vrai;
    }
  });

  it('REFUSE de signer si le secret du serveur est absent', () => {
    const s = faireService();
    delete process.env.FEATURES_USER_SECRET;
    // Signer avec une chaîne vide reviendrait à ne pas signer : mieux vaut
    // refuser d'ouvrir le flux que l'ouvrir sans garde.
    expect(() => s.urlAutorisation('alice@exemple.com')).toThrow(/FEATURES_USER_SECRET/);
  });

  it("n'annonce pas l'intégration quand elle n'est pas configurée", () => {
    const s = faireService();
    delete process.env.STRAVA_CLIENT_SECRET;
    expect(s.estConfigure()).toBe(false);
  });

  it('demande activity:read_all, sans quoi les sorties privées manqueraient', () => {
    const s = faireService();
    const url = s.urlAutorisation('alice@exemple.com');
    expect(url).toContain('activity%3Aread_all');
  });
});
