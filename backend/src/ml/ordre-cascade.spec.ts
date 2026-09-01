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

// Le catalogue, avec sa classe de cout — copie fidele de ml.service.ts.
const COUT = { gratuit: 0, bonMarche: 1, cher: 2 };
const CATALOGUE = [
  { nom: 'food4k', cout: COUT.gratuit },
  { nom: 'cloudflare', cout: COUT.gratuit },
  { nom: 'ollama', cout: COUT.gratuit },
  { nom: 'zhipu', cout: COUT.bonMarche },
  { nom: 'moonshot', cout: COUT.bonMarche },
  { nom: 'openai', cout: COUT.bonMarche },
  // Ajoutes le 31/08/2026, jamais mesures : places entre le connu-bon (OpenAI,
  // 64,7 %) et le connu-mauvais (Mistral, 14,0 %).
  { nom: 'qwen', cout: COUT.bonMarche },
  { nom: 'minimax', cout: COUT.bonMarche },
  { nom: 'mistral', cout: COUT.bonMarche },
  { nom: 'xai', cout: COUT.cher },
  { nom: 'anthropic', cout: COUT.cher },
  { nom: 'foodapi', cout: COUT.cher },
];

/** L'ordre par defaut, derive du cout — jamais ecrit a la main. */
function ordreParCout(primary?: string): string[] {
  const trie = CATALOGUE.map((t, i) => ({ ...t, i }))
    .sort((a, b) => a.cout - b.cout || a.i - b.i)
    .map((t) => t.nom);
  return primary === 'ollama'
    ? ['ollama', ...trie.filter((n) => n !== 'ollama')]
    : trie;
}

const TOUS = ordreParCout();

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
    // A cout egal, l'ordre du catalogue tranche, et il place Mistral en
    // dernier des paliers bon marche : mesure du 31/08/2026, 14,0 % contre
    // 65,5 % pour OpenAI sur les memes cas difficiles.
    for (const meilleur of ['zhipu', 'moonshot', 'openai']) {
      expect(o.indexOf(meilleur)).toBeLessThan(o.indexOf('mistral'));
    }
  });
});

describe("la regle : toujours du gratuit vers le payant", () => {
  it('ne place aucun palier payant avant un palier gratuit', () => {
    const o = ordreParCout();
    const cout = (n: string) => CATALOGUE.find((t) => t.nom === n)!.cout;
    for (let i = 1; i < o.length; i++) {
      // ⚠ C'EST LA REGLE QUE MISTRAL A VIOLEE PENDANT DES MOIS.
      // Ecrite comme une liste figee, elle devenait fausse au premier
      // changement. Derivee du cout, elle ne peut plus l'etre.
      expect(cout(o[i])).toBeGreaterThanOrEqual(cout(o[i - 1]));
    }
  });

  // ⚠ A COUT EGAL, LA LATENCE TRANCHE.
  it('appelle Cloudflare (GPU) avant Ollama (CPU), tous deux gratuits', () => {
    const o = ordreParCout();
    expect(o.indexOf('cloudflare')).toBeLessThan(o.indexOf('ollama'));
  });

  it('commence par les paliers sans facture', () => {
    expect(ordreParCout().slice(0, 3).sort())
      .toEqual(['cloudflare', 'food4k', 'ollama']);
  });

  it('VISION_PRIMARY=ollama remonte l auto-heberge en tete', () => {
    expect(ordreParCout('ollama')[0]).toBe('ollama');
    // Et sans perdre personne au passage.
    expect([...ordreParCout('ollama')].sort()).toEqual([...TOUS].sort());
  });

  // ⚠ GROQ EST ABSENT DU CATALOGUE, ET C'EST DELIBERE.
  it('n inclut pas Groq : il n a aucun modele de vision', () => {
    // Sonde du 31/08/2026 : cle valide, 14 modeles, aucun multimodal. Le garder
    // dans la cascade ajoutait un aller-retour pour un `null` garanti.
    expect(ordreParCout()).not.toContain('groq');
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
