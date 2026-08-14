import { filtrerMessage, expliquerRefus, LONGUEUR_MAX } from './moderation-chat';

// Le filtre de chat est du code de SÉCURITÉ : il est la seule barrière entre un
// utilisateur et la diffusion d'un message à toute une course. Un trou ici sort
// directement dans l'app, et les deux risques ne se valent pas — laisser passer une
// arnaque est grave, bloquer un message innocent fait taire quelqu'un. Les deux sens
// sont donc testés.
describe('filtrerMessage', () => {
  describe('laisse passer les messages légitimes', () => {
    const legitimes = [
      'Bravo pour ton 10 km !',
      'يالله نكملو السباق 💪',
      'On se retrouve demain au parc ?',
      'J’ai fini en 1h12, content de moi',
      'Allez les amis, plus que 3 km',
      // Contient « point » sans être une URL — piège classique d'un filtre trop large.
      'À ce point je suis mort de fatigue',
      // Un nombre long mais qui n'est pas un numéro : distance en mètres.
      'On a couru 42195 mètres au total',
    ];
    it.each(legitimes)('accepte : %s', (texte) => {
      expect(filtrerMessage(texte).ok).toBe(true);
    });
  });

  describe('refuse les liens, sous toutes leurs formes', () => {
    const liens = [
      'Regarde https://arnaque.example',
      'va sur www.truc.ma',
      'mon site truc.com',
      'écris-moi sur t.me/quelquun',
      // Contournements courants : espaces, crochets, « point » écrit en toutes lettres.
      'visite truc [.] com',
      'visite truc point com',
    ];
    it.each(liens)('refuse : %s', (texte) => {
      const v = filtrerMessage(texte);
      expect(v.ok).toBe(false);
      expect(v.motif).toBe('lien');
    });
  });

  describe('refuse les coordonnées personnelles', () => {
    it.each([
      'appelle-moi au 0612345678',
      'mon numéro : +212 6 12 34 56 78',
      'écris à moi@exemple.com',
    ])('refuse : %s', (texte) => {
      const v = filtrerMessage(texte);
      expect(v.ok).toBe(false);
      expect(v.motif).toBe('coordonnees');
    });
  });

  it('refuse les insultes en français et en darija', () => {
    expect(filtrerMessage('espèce de connard').motif).toBe('insulte');
    expect(filtrerMessage('nta 9ahba').motif).toBe('insulte');
  });

  it('refuse le vide et borne la longueur', () => {
    expect(filtrerMessage('').motif).toBe('vide');
    expect(filtrerMessage('   ').motif).toBe('vide');
    expect(filtrerMessage(null).motif).toBe('vide');
    expect(filtrerMessage('a'.repeat(LONGUEUR_MAX + 1)).motif).toBe('trop-long');
    expect(filtrerMessage('a'.repeat(LONGUEUR_MAX)).ok).toBe(true);
  });

  it('normalise les espaces au lieu de refuser', () => {
    // Un message tapé avec des retours à la ligne reste légitime : on le nettoie.
    expect(filtrerMessage('  Bravo   \n  à  tous ')).toEqual({ ok: true, texte: 'Bravo à tous' });
  });
});

describe('expliquerRefus', () => {
  it('parle la langue de l’utilisateur', () => {
    expect(expliquerRefus('lien', 'fr')).toContain('liens');
    expect(expliquerRefus('lien', 'en')).toContain('Links');
    expect(expliquerRefus('lien', 'ar')).toContain('الروابط');
  });

  it('retombe sur le français pour une langue inconnue', () => {
    expect(expliquerRefus('lien', 'es')).toBe(expliquerRefus('lien', 'fr'));
  });

  it('couvre les motifs qui ne viennent pas du filtre de contenu', () => {
    // « muet » et « debit » sont décidés par la gateway, pas par filtrerMessage :
    // ils doivent malgré tout avoir un message lisible.
    expect(expliquerRefus('muet', 'fr')).not.toBe(expliquerRefus('insulte', 'fr'));
    expect(expliquerRefus('debit', 'fr')).not.toBe(expliquerRefus('insulte', 'fr'));
  });
});
