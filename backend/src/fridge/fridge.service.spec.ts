import { FridgeService } from './fridge.service';

/**
 * « Frigo → recettes » etait MORT en production, et rien ne le disait.
 * ---------------------------------------------------------------------------
 * Trouve le 10/09/2026 par `api-sentinelle.yml`, le seul controle qui appelle
 * vraiment les routes produit :
 *
 *     CASSE 0     90013 ms  /fridge/analyze
 *     ##[error]/fridge/analyze — HTTP 0 : TIMEOUT
 *
 * Toutes les autres routes repondaient en moins d'une seconde. La cause tenait
 * en une ligne : `analyze()` faisait DEUX passes VISION sur la meme photo.
 * La premiere detecte les ingredients ; la seconde demandait des recettes
 * « Given ingredients [...] » — un travail de TEXTE — en repassant l'image dans
 * le VLM. La sentinelle mesure `/ml/vision` seul a 38 s : deux passes
 * depassaient les 90 s du client.
 *
 * Le commentaire du code disait deja « texte → texte, pas d'image ». Le code
 * envoyait l'image. Ce test verifie le CODE, pas le commentaire.
 *
 * ⚠ POURQUOI UN TEST ET PAS SEULEMENT LA SENTINELLE. La sentinelle passe une
 * fois par jour et parle a la production : elle a mis des semaines a voir la
 * panne, et elle ne peut rien dire avant un deploiement. Celui-ci echoue a
 * l'instant ou quelqu'un remet une passe vision de trop.
 */
describe('FridgeService.analyze — une seule passe vision', () => {
  const image = 'AAAA';

  function monter(reponseVision: string, reponseTexte: string) {
    const ml = {
      visionLocal: jest.fn(async () => ({ text: reponseVision, engine: 'faux-vlm' })),
    };
    const ai = { generate: jest.fn(async () => reponseTexte) };
    const scoring = { scoreFood: jest.fn(() => 0.5) };
    return { ml, ai, service: new FridgeService(ml as any, scoring as any, ai as any) };
  }

  it('appelle la vision UNE fois, et la cascade texte pour les recettes', async () => {
    const { ml, ai, service } = monter(
      '["oeufs","lait","tomate"]',
      '[{"title":"Omelette","uses":["oeufs"],"missing":[],"kcal":300,"protein":20}]',
    );
    await service.analyze(image, 'image/jpeg', null);

    // LE point du test : deux appels vision, c'est le TIMEOUT qui revient.
    expect(ml.visionLocal).toHaveBeenCalledTimes(1);
    expect(ai.generate).toHaveBeenCalledTimes(1);
  });

  it('la passe recettes ne recoit PAS l image', async () => {
    const { ai, service } = monter(
      '["riz","poulet"]',
      '[{"title":"Riz au poulet","uses":["riz","poulet"],"missing":[],"kcal":500,"protein":30}]',
    );
    await service.analyze(image, 'image/jpeg', null);

    // Reenvoyer l'image serait le defaut d'origine sous un autre nom : la
    // cascade texte la traiterait comme un prompt geant, ou l'ignorerait en
    // facturant le transfert.
    const prompt = String(ai.generate.mock.calls[0][0]);
    expect(prompt).not.toContain(image);
    expect(prompt).toContain('riz');
  });

  it('aucun ingredient detecte : on s arrete, sans appeler le texte', async () => {
    const { ai, service } = monter('[]', '[]');
    const r = await service.analyze(image, 'image/jpeg', null);

    // Demander des recettes pour une liste vide brule un appel pour rien.
    expect(ai.generate).not.toHaveBeenCalled();
    expect(r.recipes).toEqual([]);
  });

  it('image absente : reponse vide, aucun appel', async () => {
    const { ml, ai, service } = monter('[]', '[]');
    const r = await service.analyze('', 'image/jpeg', null);
    expect(ml.visionLocal).not.toHaveBeenCalled();
    expect(ai.generate).not.toHaveBeenCalled();
    expect(r).toEqual({ detected: [], recipes: [], shoppingList: [] });
  });

  it('la cascade texte tombe : on rend les ingredients, pas une erreur', async () => {
    const ml = { visionLocal: jest.fn(async () => ({ text: '["pain"]', engine: 'faux-vlm' })) };
    const ai = { generate: jest.fn(async () => { throw new Error('cascade KO'); }) };
    const scoring = { scoreFood: jest.fn(() => 0) };
    const service = new FridgeService(ml as any, scoring as any, ai as any);

    // Perdre les recettes est une degradation ; perdre aussi la detection
    // transformerait une panne partielle en ecran vide.
    const r = await service.analyze(image, 'image/jpeg', null);
    expect(r.detected).toEqual(['pain']);
    expect(r.recipes).toEqual([]);
  });
});
