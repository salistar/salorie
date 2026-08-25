import { texteDeLaReponse } from './ai.service';

/**
 * La lecture d'une reponse de fournisseur.
 *
 * Ce fichier existe pour UN cas, celui du 25/08/2026 : Cloudflare rend
 * `result.response` DEJA ANALYSE quand le modele emet du JSON. L'ancienne
 * version faisait `String(text)` — qui vaut « [object Object] » sur un objet.
 * Quinze caracteres, non vides : la cascade les acceptait, journalisait
 * « texte servi par cloudflare », et toute fonctionnalite demandant du JSON
 * retombait en silence sur son contenu hors-ligne.
 *
 * Le test qui compte est « un objet devient du JSON ». S'il redevient
 * « [object Object] », les analyses hebdomadaires et les plans de repas
 * cessent de fonctionner — sans qu'aucune erreur n'apparaisse nulle part.
 */
describe('texteDeLaReponse', () => {
  it('lit la forme OpenAI', () => {
    expect(texteDeLaReponse({ choices: [{ message: { content: '  bonjour  ' } }] })).toBe('bonjour');
  });

  it('lit la forme Cloudflare en prose', () => {
    expect(texteDeLaReponse({ result: { response: 'les fibres aident au transit' } }))
      .toBe('les fibres aident au transit');
  });

  it('un objet devient du JSON, jamais « [object Object] »', () => {
    // Le cas reel : Cloudflare a analyse le JSON du modele avant de le rendre.
    const j = { result: { response: { healthScore: 80, fr: { summary: 'Bonne semaine' } } } };
    const t = texteDeLaReponse(j);
    expect(t).not.toContain('[object Object]');
    expect(JSON.parse(t)).toEqual({ healthScore: 80, fr: { summary: 'Bonne semaine' } });
  });

  it('un tableau aussi', () => {
    expect(texteDeLaReponse({ result: { response: [1, 2] } })).toBe('[1,2]');
  });

  it('lit la forme Anthropic, en recollant les morceaux', () => {
    expect(texteDeLaReponse({ content: [{ text: 'deux ' }, { text: 'morceaux' }] })).toBe('deux morceaux');
  });

  it('rend une chaine vide quand il n y a rien — l appelant passe au suivant', () => {
    // Une chaine vide fait tomber `ask()` sur le fournisseur suivant. Rendre
    // autre chose que '' ferait accepter une reponse qui n'existe pas.
    expect(texteDeLaReponse({})).toBe('');
    expect(texteDeLaReponse(null)).toBe('');
    expect(texteDeLaReponse({ result: { response: '   ' } })).toBe('');
    expect(texteDeLaReponse({ choices: [{ message: { content: '' } }] })).toBe('');
  });

  it('prefere OpenAI a Cloudflare quand les deux formes coexistent', () => {
    expect(texteDeLaReponse({
      choices: [{ message: { content: 'openai' } }],
      result: { response: 'cloudflare' },
    })).toBe('openai');
  });
});
