import { PipelineController } from '../src/pipeline/pipeline.controller';

/**
 * Filet contre l'oubli d'authentification sur /pipeline.
 *
 * Ce contrôleur ne peut pas être protégé par un garde Nest unique : il porte TROIS
 * mécanismes distincts — clé admin (`x-admin-key`), clé utilisateur pour la route
 * `features/:userId`, et signature HMAC pour le webhook, appelé par un tiers qui ne
 * connaît pas la clé admin. Un `@UseGuards` global casserait le webhook.
 *
 * Le risque restant est donc humain : une méthode ajoutée demain SANS appeler l'une
 * des trois vérifications serait ouverte au monde, et aucune revue automatique ne le
 * verrait — la protection étant une ligne à l'intérieur du corps.
 *
 * Ce test énumère les méthodes du prototype : toute route nouvelle est couverte
 * d'office, sans que personne ait à penser à l'ajouter ici. Une méthode qui doit
 * réellement rester publique doit être inscrite dans PUBLIQUES ci-dessous — un choix
 * explicite, visible en revue, plutôt qu'un oubli.
 */
const PUBLIQUES = new Set<string>([
  // (vide) — aucune route de /pipeline n'est publique aujourd'hui.
]);

describe('PipelineController — aucune route ouverte par accident', () => {
  const methodes = Object.getOwnPropertyNames(PipelineController.prototype).filter(
    (n) => n !== 'constructor' && typeof (PipelineController.prototype as any)[n] === 'function',
  );

  // Un service factice : si une méthode l'atteint, c'est que l'authentification a été
  // franchie — donc que la route est ouverte.
  const service: any = new Proxy(
    {},
    { get: () => () => { throw new Error('ATTEINT LE SERVICE SANS AUTHENTIFICATION'); } },
  );

  it('expose au moins une route (sinon le test ne prouve rien)', () => {
    expect(methodes.length).toBeGreaterThan(0);
  });

  // Certaines méthodes sont `async` : elles REJETTENT au lieu de lever de façon
  // synchrone. Une première version de ce test ne couvrait que le cas synchrone et
  // faisait tomber le processus sur un rejet non géré — il faut traiter les deux.
  it.each(methodes)('%s refuse un appel sans identifiant', async (nom) => {
    if (PUBLIQUES.has(nom)) return;
    const c = new PipelineController(service);
    let refus: any;
    try {
      // Appelée sans en-tête ni signature : les arguments valent tous undefined.
      await (c as any)[nom]();
    } catch (e: any) {
      refus = e;
    }
    expect(refus).toBeDefined();
    expect(String(refus?.message || refus)).not.toContain('ATTEINT LE SERVICE');
  });
});
