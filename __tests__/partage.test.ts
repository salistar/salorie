/**
 * Le partage sortant : WhatsApp, Facebook, et le repli système.
 *
 * Ce code s'exécute chez l'utilisateur, dans une main, au moment où il a envie
 * de montrer un résultat. S'il échoue, il échoue silencieusement — rien ne
 * s'ouvre et personne ne sait pourquoi. D'où ces tests.
 */

const mockLinking = { canOpenURL: jest.fn(), openURL: jest.fn() };
const mockShare = { share: jest.fn() };

jest.mock('react-native', () => ({
  Linking: mockLinking,
  Share: mockShare,
  Platform: { OS: 'android' },
}));

import { versWhatsApp, versFacebook, versNatif, partager, reseauxInstalles, lienPartage } from '../lib/partage';

beforeEach(() => {
  jest.clearAllMocks();
  mockLinking.openURL.mockResolvedValue(undefined);
  mockLinking.canOpenURL.mockResolvedValue(false);
  mockShare.share.mockResolvedValue({ action: 'sharedAction' });
});

describe('WhatsApp', () => {
  it("ouvre l'application quand elle répond", async () => {
    expect(await versWhatsApp('Bonjour', 'https://salorie.com/x')).toBe(true);
    expect(mockLinking.openURL).toHaveBeenCalledTimes(1);
    expect(mockLinking.openURL.mock.calls[0][0]).toMatch(/^whatsapp:\/\/send\?text=/);
  });

  it('retombe sur wa.me quand le schéma natif échoue', async () => {
    // C'est le cas d'un téléphone sans WhatsApp : le lien web ouvre le
    // navigateur plutôt que de ne rien faire.
    mockLinking.openURL.mockRejectedValueOnce(new Error('pas de gestionnaire'));
    expect(await versWhatsApp('Bonjour')).toBe(true);
    expect(mockLinking.openURL).toHaveBeenCalledTimes(2);
    expect(mockLinking.openURL.mock.calls[1][0]).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  it('rend faux plutôt que de jeter quand rien ne répond', async () => {
    mockLinking.openURL.mockRejectedValue(new Error('rien'));
    expect(await versWhatsApp('Bonjour')).toBe(false);
  });

  it('met le lien seul sur sa ligne — sinon pas d’aperçu riche', async () => {
    await versWhatsApp('Mon score du jour', 'https://salorie.com/x');
    const envoye = decodeURIComponent(mockLinking.openURL.mock.calls[0][0].split('text=')[1]);
    expect(envoye).toBe('Mon score du jour\n\nhttps://salorie.com/x');
  });

  it('encode ce qui casserait l’URL', async () => {
    await versWhatsApp('100 % & plus #objectif');
    const url = mockLinking.openURL.mock.calls[0][0];
    expect(url).not.toContain('#');
    expect(url).not.toContain(' ');
    expect(decodeURIComponent(url.split('text=')[1])).toBe('100 % & plus #objectif');
  });

  it("n'envoie que le lien quand il n'y a pas de texte", async () => {
    await versWhatsApp('', 'https://salorie.com/x');
    expect(decodeURIComponent(mockLinking.openURL.mock.calls[0][0].split('text=')[1])).toBe(
      'https://salorie.com/x'
    );
  });
});

describe('Facebook', () => {
  it('passe par le partageur web, qui marche sans application', async () => {
    expect(await versFacebook('https://salorie.com/x')).toBe(true);
    expect(mockLinking.openURL.mock.calls[0][0]).toContain('facebook.com/sharer');
  });
});

describe('feuille de partage du système', () => {
  it('inclut le lien DANS le message sur Android', async () => {
    // Android ignore le champ `url` de Share.share : un lien passé à part y
    // disparaîtrait purement et simplement.
    await versNatif('Regarde', 'https://salorie.com/x');
    expect(mockShare.share.mock.calls[0][0].message).toContain('https://salorie.com/x');
  });

  it('rend faux si l’utilisateur annule ou si ça échoue', async () => {
    mockShare.share.mockRejectedValue(new Error('annulé'));
    expect(await versNatif('Regarde')).toBe(false);
  });
});

describe('reseauxInstalles', () => {
  it("n'avale pas une sonde qui jette", async () => {
    // `canOpenURL` jette sur certains constructeurs quand le schéma est inconnu.
    // Une exception ne doit pas emporter la détection des autres réseaux.
    mockLinking.canOpenURL.mockImplementation(async (url: string) => {
      if (url.startsWith('instagram')) throw new Error('schéma inconnu');
      return url.startsWith('whatsapp');
    });
    const trouves = await reseauxInstalles();
    expect(trouves).toContain('whatsapp');
    expect(trouves).not.toContain('instagram');
  });

  it('rend une liste vide quand rien n’est installé', async () => {
    expect(await reseauxInstalles()).toEqual([]);
  });
});

describe('lienPartage', () => {
  it('marque la source pour distinguer le social du direct', () => {
    expect(lienPartage('defi/42', 'whatsapp')).toBe(
      'https://salorie.com/defi/42?utm_source=whatsapp&utm_medium=partage'
    );
  });

  it('enchaîne avec & quand le chemin porte déjà une requête', () => {
    expect(lienPartage('r?code=AB12', 'whatsapp')).toContain('r?code=AB12&utm_source=');
  });

  it('ne double jamais la barre oblique', () => {
    expect(lienPartage('/defi/42', 'x')).not.toContain('.com//');
  });
});

describe('partager', () => {
  it('route vers le réseau demandé, et vers le système par défaut', async () => {
    await partager({ texte: 'a', reseau: 'whatsapp' });
    expect(mockLinking.openURL).toHaveBeenCalled();

    jest.clearAllMocks();
    await partager({ texte: 'a' });
    expect(mockShare.share).toHaveBeenCalled();
    expect(mockLinking.openURL).not.toHaveBeenCalled();
  });

  it('retombe sur le système si Facebook est demandé sans lien', async () => {
    // Le partageur Facebook n'a de sens qu'avec une URL : sans elle, mieux vaut
    // la feuille du système qu'un bouton qui ne fait rien.
    await partager({ texte: 'a', reseau: 'facebook' });
    expect(mockShare.share).toHaveBeenCalled();
  });
});
