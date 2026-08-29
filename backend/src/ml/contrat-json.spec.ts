/**
 * La regle qui decide si un palier a REPONDU A LA QUESTION.
 *
 * POURQUOI ELLE EXISTE
 * La cascade acceptait n'importe quel texte non vide. Elle escaladait donc sur
 * le silence d'un palier, jamais sur une reponse inutilisable — et comme
 * Cloudflare repond toujours quelque chose, les fournisseurs places derriere
 * n'etaient jamais atteints. Mesure du 29/08/2026 : sur 101 plats, Cloudflare
 * rend du markdown (« **Name:** Fried Doughnuts ») la ou le prompt exige un
 * JSON strict. L'app ne sait pas le lire, et la cascade s'arretait la.
 *
 * Ce fichier eprouve la frontiere. Elle doit etre exacte dans les deux sens :
 * trop laxiste, rien ne change ; trop stricte, on escalade sans raison vers des
 * paliers payants, ou on casse les usages qui attendent une phrase.
 *
 * La logique est reimplementee ici a l'identique de ml.service.ts : elle vit au
 * milieu d'une methode de plusieurs centaines de lignes qui exige Redis,
 * Firebase et huit fournisseurs. La sortir pour la tester la sortirait aussi de
 * son contexte ; ce commentaire est le prix de ce choix, et toute modification
 * de l'une doit etre reportee dans l'autre.
 */

const exigeJson = (prompt: string) =>
  /STRICT JSON|Return .{0,40}JSON|JSON with these keys/i.test(prompt || '');

const jsonUtilisable = (texte: string): any => {
  const t = String(texte || '').trim();
  const sansCloture = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const debut = sansCloture.indexOf('{');
  const fin = sansCloture.lastIndexOf('}');
  if (debut < 0 || fin <= debut) return null;
  try {
    const o = JSON.parse(sansCloture.slice(debut, fin + 1));
    return o && typeof o === 'object' && String(o.name || '').trim() ? o : null;
  } catch { return null; }
};

describe('quand la cascade doit-elle exiger du JSON', () => {
  it('le reconnait dans le prompt reel de l app', () => {
    // L'extrait exact de scan-analysis.tsx.
    expect(exigeJson('Return STRICT JSON with these keys:\n{ "name": "..." }')).toBe(true);
  });

  it('ne l exige PAS pour les usages qui attendent une phrase', () => {
    // `/ai/vision` sert aussi a decrire du materiel de sport ou un contenu de
    // frigo. Exiger du JSON partout casserait ces ecrans-la.
    expect(exigeJson('Describe the sports equipment visible in this image.')).toBe(false);
    expect(exigeJson('Quels aliments vois-tu dans ce frigo ?')).toBe(false);
  });
});

describe('ce qui compte comme une reponse utilisable', () => {
  it('accepte une fiche JSON nue', () => {
    expect(jsonUtilisable('{"name":"Pizza margherita","calories":270}')).toBeTruthy();
  });

  it('accepte une fiche enrobee dans une cloture markdown', () => {
    // Les modeles enrobent volontiers leur JSON. Escalader pour cette seule
    // raison ferait payer un palier superieur alors que la reponse est bonne.
    expect(jsonUtilisable('```json\n{"name":"Sushi","calories":150}\n```')).toBeTruthy();
  });

  it('accepte une fiche precedee d une phrase de politesse', () => {
    expect(jsonUtilisable('Voici l analyse :\n{"name":"Couscous","calories":180}')).toBeTruthy();
  });

  // ⚠ LE CAS QUI A MOTIVE TOUT CECI.
  it('REFUSE le markdown que rend Cloudflare', () => {
    const reel = '**Food Description**\n\n* **Name:** Fried Doughnuts with sugar\n* **Calories:** 300';
    expect(jsonUtilisable(reel)).toBeNull();
  });

  it('REFUSE de la prose, meme juste', () => {
    expect(jsonUtilisable('Cette photo montre une pizza margherita.')).toBeNull();
  });

  it('REFUSE un JSON sans nom : une coquille n apprend rien a personne', () => {
    expect(jsonUtilisable('{"calories":300,"protein":12}')).toBeNull();
    expect(jsonUtilisable('{"name":"   "}')).toBeNull();
  });

  it('REFUSE un JSON tronque', () => {
    // Une reponse coupee par une limite de jetons : accepter la moitie d une
    // fiche remplirait le journal de valeurs partielles.
    expect(jsonUtilisable('{"name":"Tajine","calories":')).toBeNull();
  });

  it('REFUSE le vide et le silence', () => {
    expect(jsonUtilisable('')).toBeNull();
    expect(jsonUtilisable('   ')).toBeNull();
  });
});
