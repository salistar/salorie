/**
 * L'ordre des paliers de vision — la regle qui decide ou part chaque requete.
 *
 * POURQUOI CE FICHIER EXISTE
 * Mistral a ete descendu dans la cascade le 30/08/2026 sur mesure : sur 303
 * photos, il servait 43 requetes et n'avait raison que 14 fois sur cent, la ou
 * `tier0` etait a 71,8 %. Il recevait ce trafic parce qu'il etait le premier
 * apres Cloudflare — un accident de rang, pas un choix.
 *
 * Comme la qualite des paliers jamais atteints (Zhipu, Moonshot, xAI) n'est PAS
 * mesuree, l'ordre est devenu reglable par `VISION_ORDER` : revenir en arriere
 * ne doit pas demander un redeploiement.
 *
 * Ce qui est eprouve ici est simple et vital : on ne doit jamais PERDRE un
 * palier. Une faute de frappe dans la variable d'environnement ne doit pas
 * couper silencieusement un fournisseur — la cascade se degraderait sans que
 * rien ne le signale, exactement comme Groq et Ollama absents pendant des mois.
 *
 * La logique est reimplementee a l'identique de ml.service.ts : elle vit au
 * milieu d'une methode qui exige Redis, Firebase et huit fournisseurs. Toute
 * modification de l'une doit etre reportee dans l'autre.
 */

const TOUS = ['food4k', 'cloudflare', 'groq', 'ollama', 'zhipu', 'moonshot',
  'xai', 'openai', 'mistral', 'anthropic', 'foodapi'];

function calculerOrdre(visionOrder: string | undefined, ordreDefaut = TOUS): string[] {
  const connus = new Set(ordreDefaut);
  const demandes = [...new Set(String(visionOrder || '')
    .split(',').map((x) => x.trim().toLowerCase()).filter((x) => connus.has(x)))];
  return [...demandes, ...ordreDefaut.filter((n) => !demandes.includes(n))];
}

describe("l'ordre par defaut", () => {
  it('place le palier auto-heberge en tete : il est gratuit et le meilleur mesure', () => {
    expect(calculerOrdre(undefined)[0]).toBe('food4k');
  });

  it('place Cloudflare avant Mistral', () => {
    const o = calculerOrdre(undefined);
    expect(o.indexOf('cloudflare')).toBeLessThan(o.indexOf('mistral'));
  });

  // ⚠ LE CHANGEMENT DU 30/08/2026, ET SA RAISON.
  it('ne laisse plus Mistral recevoir en premier ce que Cloudflare decline', () => {
    const o = calculerOrdre(undefined);
    // Mesure : mistral 14,0 % juste sur 43 requetes servies. Il reste dans la
    // cascade — une reponse faible vaut mieux qu'aucune — mais apres les autres.
    for (const meilleur of ['zhipu', 'moonshot', 'xai', 'openai']) {
      expect(o.indexOf(meilleur)).toBeLessThan(o.indexOf('mistral'));
    }
  });
});

describe('VISION_ORDER', () => {
  it('respecte l ordre demande', () => {
    const o = calculerOrdre('cloudflare,food4k');
    expect(o[0]).toBe('cloudflare');
    expect(o[1]).toBe('food4k');
  });

  // ⚠ LE CAS QUI COMPTE : ne jamais perdre un palier.
  it('conserve TOUS les paliers, meme ceux qui ne sont pas cites', () => {
    const o = calculerOrdre('mistral');
    expect(o[0]).toBe('mistral');
    expect([...o].sort()).toEqual([...TOUS].sort());
    expect(new Set(o).size).toBe(TOUS.length); // aucun doublon
  });

  it('ignore un nom inconnu sans rien casser', () => {
    // Une faute de frappe ne doit pas couper un fournisseur en silence.
    const o = calculerOrdre('cloudfl4re,mistral');
    expect(o[0]).toBe('mistral');
    expect([...o].sort()).toEqual([...TOUS].sort());
  });

  it('tolere les espaces, la casse et les virgules vides', () => {
    const o = calculerOrdre('  CloudFlare , , food4k ,');
    expect(o.slice(0, 2)).toEqual(['cloudflare', 'food4k']);
    expect([...o].sort()).toEqual([...TOUS].sort());
  });

  it('vide ou absent rend l ordre par defaut', () => {
    expect(calculerOrdre('')).toEqual(TOUS);
    expect(calculerOrdre(undefined)).toEqual(TOUS);
  });

  // Ce test portait un nom qui contredisait son assertion : il verifiait que le
  // doublon EXISTAIT tout en s'intitulant « n est pas duplique ». Le code
  // dupliquait bel et bien, donc appelait le palier deux fois de suite. Corrige
  // des deux cotes.
  it('un nom cite deux fois n est pas duplique', () => {
    const o = calculerOrdre('mistral,mistral');
    expect(o.filter((x) => x === 'mistral').length).toBe(1);
    expect([...o].sort()).toEqual([...TOUS].sort());
  });
});
