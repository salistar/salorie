/**
 * Ce qui part vers Sentry ne doit contenir aucune donnée personnelle.
 * ---------------------------------------------------------------------------
 * `sendDefaultPii: false` empêche le SDK d'ajouter DE LUI-MÊME l'adresse IP,
 * les en-têtes et les cookies. Il ne touche pas à ce que NOTRE code écrit dans
 * un message d'erreur — et cette application manipule des poids, des glycémies,
 * des adresses de courriel et des photos de repas en base64.
 *
 * Une fuite ici n'est pas un bug qu'on voit : c'est une donnée de santé qui
 * part chez un tiers, hors du Maroc, pour une durée de rétention qu'on ne
 * choisit pas. Elle ne lève aucune erreur et ne se voit sur aucun écran.
 *
 * ⚠ ON TESTE LA FORME, PAS UNE LISTE DE CHAMPS. Une liste de clés sensibles
 * laisserait passer celle qu'on aurait oublié d'y mettre — et c'est toujours
 * celle-là qui fuit.
 */
import { masquerPourSentry, masquerEvenement } from '../lib/sentryMasquage';

describe('masquerPourSentry', () => {
  it('efface une adresse de courriel, ou qu elle soit', () => {
    // L'identifiant de compte de l'application : le plus susceptible d'atterrir
    // dans un `throw new Error('echec pour ' + email)`.
    expect(masquerPourSentry('echec pour idriss@salistar.com'))
      .toBe('echec pour [courriel]');
    expect(masquerPourSentry('a.b+tag@sous.domaine.co.uk fin'))
      .toBe('[courriel] fin');
  });

  it('efface une photo de repas en base64', () => {
    const image = 'data:image/jpeg;base64,' + 'A'.repeat(120);
    expect(masquerPourSentry(`upload KO ${image}`)).toBe('upload KO [image]');
  });

  it('efface un long bloc base64 meme sans en-tete', () => {
    // Le cas reel : `imageBase64` passe nu dans un message, sans prefixe MIME.
    const brut = 'Q'.repeat(600);
    expect(masquerPourSentry(`corps : ${brut}`)).toBe('corps : [donnees]');
    expect(masquerPourSentry(`"photo":"${brut}"`)).toBe('"photo":"[donnees]"');
  });

  it('⚠ une etiquette COLLEE au bloc est masquee avec lui, et c est voulu', () => {
    // `corps=QQQ…` : « corps » et « = » appartiennent a la meme classe de
    // caracteres que le base64. AUCUNE forme ne les distingue — seul un
    // delimiteur hors classe (espace, guillemet, virgule) le pourrait.
    //
    // On assume donc de masquer un peu trop : pour un masqueur, sur-masquer
    // coute une etiquette dans un rapport, sous-masquer laisse partir une
    // donnee de sante. Le bon sens de l'erreur n'est pas discutable.
    const brut = 'Q'.repeat(600);
    expect(masquerPourSentry(`corps=${brut}`)).toBe('[donnees]');
  });

  it('efface un jeton porteur et un JWT nu', () => {
    expect(masquerPourSentry('Authorization: Bearer abcdefghijklmnopqrstuvwxyz'))
      .toBe('Authorization: Bearer [jeton]');
    // Un vrai JWT : chaque segment depasse largement les 8 caracteres exiges.
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      + '.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IklkcmlzcyJ9'
      + '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(masquerPourSentry(`jeton ${jwt} expire`)).toBe('jeton [jwt] expire');
  });

  it('ne touche PAS a ce qui rend le rapport utile', () => {
    // Masquer trop rendrait Sentry inutilisable : il faut encore pouvoir lire
    // la pile d'appel et le nom du module fautif.
    const pile = "TypeError: undefined is not a function\n  at FridgeService.analyze (fridge.service.ts:120:8)";
    expect(masquerPourSentry(pile)).toBe(pile);
    expect(masquerPourSentry('HTTP 500 sur /ml/vision apres 38012 ms'))
      .toBe('HTTP 500 sur /ml/vision apres 38012 ms');
  });

  it('chaine vide ou absente : rendue telle quelle, sans jeter', () => {
    expect(masquerPourSentry('')).toBe('');
    expect(masquerPourSentry(undefined as any)).toBe(undefined);
  });
});

describe('masquerEvenement', () => {
  it('nettoie le message, les exceptions ET les fils d Ariane', () => {
    // Les trois endroits ou du texte de notre cru peut se glisser.
    const e = masquerEvenement({
      message: 'plantage pour a@b.com',
      exception: { values: [{ value: 'echec pour c@d.com' }] },
      breadcrumbs: [{ message: 'requete de e@f.com' }, { message: 'ok' }],
    });
    expect(e.message).toBe('plantage pour [courriel]');
    expect(e.exception!.values![0].value).toBe('echec pour [courriel]');
    expect(e.breadcrumbs![0].message).toBe('requete de [courriel]');
    expect(e.breadcrumbs![1].message).toBe('ok');
  });

  it('un evenement mal forme ne fait PAS disparaitre le rapport', () => {
    // ⚠ Masquer est une protection. Si elle echoue, on veut un rapport non
    // masque plutot que pas de rapport : l'inverse eteindrait silencieusement
    // la remontee d'erreurs le jour ou ce code a un defaut.
    const piege: any = { message: 'ok' };
    Object.defineProperty(piege, 'breadcrumbs', {
      get() { throw new Error('acces interdit'); },
    });
    expect(() => masquerEvenement(piege)).not.toThrow();
    expect(masquerEvenement(piege)).toBe(piege);
  });

  it('evenement vide : rendu tel quel', () => {
    const vide = {};
    expect(masquerEvenement(vide)).toBe(vide);
  });
});
