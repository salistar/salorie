/**
 * Le masquage avant envoi vers Sentry — et l'interdiction de diverger.
 * ---------------------------------------------------------------------------
 * Deux choses sont vérifiées ici, et la seconde est la raison d'être du fichier.
 *
 * 1. **Que le masquage fasse son travail**, dans les deux sens : effacer ce qui
 *    ne doit pas sortir, et surtout ne PAS effacer ce qui rend une erreur
 *    lisible. Un filtre trop large produit des rapports de plantage où il ne
 *    reste rien à lire — ce qui revient à ne pas avoir de Sentry du tout.
 *
 * 2. ⚠ **Que ce module reste identique à `lib/sentryMasquage.ts`**, à la racine
 *    du dépôt. Il en est une COPIE, imposée par la structure : le contexte de
 *    build du conteneur est `./backend` et son `tsconfig.build.json` fixe
 *    `rootDir: "src"`. Une règle qui protège des données de santé ne doit pas
 *    exister en deux versions qui divergent — alors à défaut de pouvoir la
 *    partager, on interdit la dérive par un test.
 */
import * as fs from 'fs';
import * as path from 'path';
import { masquerEvenement, masquerPourSentry } from './sentryMasquage';

describe('masquerPourSentry — ce qui ne doit pas sortir', () => {
  it('efface les adresses de courriel', () => {
    // L'identifiant de compte de cette application EST le courriel : il apparait
    // dans les chemins Firestore, donc dans la moitie des messages d'erreur.
    expect(masquerPourSentry('echec pour idriss@salistar.com'))
      .toBe('echec pour [courriel]');
    expect(masquerPourSentry('users/a.b+tag@exemple.co.uk/logs'))
      .toBe('users/[courriel]/logs');
  });

  it('efface les photos de repas', () => {
    const image = 'data:image/jpeg;base64,' + 'A'.repeat(120);
    expect(masquerPourSentry(`envoi ${image} refuse`)).toBe('envoi [image] refuse');
  });

  it('efface un gros bloc base64 sans en-tete', () => {
    const brut = 'Z'.repeat(500);
    expect(masquerPourSentry(`corps: ${brut}`)).toBe('corps: [donnees]');
  });

  it('⚠ GARDE LE MOT QUI PRECEDE — MAIS SEULEMENT S IL EN EST SEPARE', () => {
    // Le prefixe est CAPTURE plutot qu'avale, pour que la ligne reste lisible.
    // Mais la capture s'arrete au premier caractere HORS de la classe base64,
    // et cette classe contient les lettres, les chiffres, `+`, `/` ET `=`.
    //
    // Consequence mesuree, qui n'est pas evidente : `corps=XXXX` disparait EN
    // ENTIER, parce que « corps= » est lui-meme fait de caracteres base64. Un
    // deux-points, une espace ou un guillemet suffisent a sauver le mot.
    //
    // Ce n'est pas grave — le message reste tronque, pas faux — mais il vaut
    // mieux le savoir que de croire le mot toujours preserve. Ma premiere
    // version de ce test l'affirmait ; elle etait fausse.
    expect(masquerPourSentry('corps=' + 'Q'.repeat(500))).toBe('[donnees]');
    expect(masquerPourSentry('photo : ' + 'Q'.repeat(500))).toContain('photo : ');
    expect(masquerPourSentry('utilisateur ' + 'Q'.repeat(500))).toContain('utilisateur ');
    expect(masquerPourSentry('body="' + 'Q'.repeat(500))).toContain('body="');
  });

  it('efface les jetons porteurs et les JWT nus', () => {
    expect(masquerPourSentry('Authorization: Bearer abcdefghijklmnopqrst'))
      .toBe('Authorization: Bearer [jeton]');
    expect(masquerPourSentry('jeton eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeK'))
      .toBe('jeton [jwt]');
  });

  it('⚠ EFFACE LES CLES DE FOURNISSEUR — le cas propre a ce backend', () => {
    // La cascade de vision renvoie le CORPS D'ERREUR des fournisseurs, et
    // ceux-ci recopient la cle recue. C'est le chemin par lequel une cle
    // partirait chez un tiers sans que personne ne l'ait voulu.
    expect(masquerPourSentry('Incorrect API key provided: sk-proj-AbCdEfGhIjKlMnOpQr'))
      .toBe('Incorrect API key provided: [cle]');
    expect(masquerPourSentry('key=AIzaSyA1B2C3D4E5F6G7H8I9J0KlMnOpQrStUv'))
      .toBe('key=[cle]');
    expect(masquerPourSentry('achat goog_AbCdEfGhIjKlMnOpQrSt refuse'))
      .toBe('achat [cle] refuse');
  });
});

describe('⚠ masquerPourSentry — ce qu il ne doit PAS effacer', () => {
  it('laisse un message d erreur ordinaire intact', () => {
    // Le sens meme du fichier : un filtre qui mange le diagnostic ramene au
    // probleme qu'on voulait resoudre.
    for (const m of [
      'ECONNREFUSED 127.0.0.1:6379',
      'Cannot read properties of undefined (reading \'calories\')',
      'refus HTTP 429 : rate limit exceeded',
      'timeout apres 90000 ms sur /ml/vision',
      'Firestore: 5 NOT_FOUND: no entity to update',
    ]) {
      expect(masquerPourSentry(m)).toBe(m);
    }
  });

  it('ne prend pas un mot ordinaire pour une cle', () => {
    // Les prefixes `sk`, `pk`, `test_` exigent une longueur minimale, justement
    // pour ne pas devorer du texte courant.
    for (const m of ['sk-1', 'pk_test', 'test_court', 'skiing', 'AIza']) {
      expect(masquerPourSentry(m)).toBe(m);
    }
  });

  it('ne touche ni au vide ni a ce qui n est pas une chaine', () => {
    expect(masquerPourSentry('')).toBe('');
    expect(masquerPourSentry(null as any)).toBeNull();
    expect(masquerPourSentry(undefined as any)).toBeUndefined();
  });
});

describe('masquerEvenement — appliquer a un evenement entier', () => {
  it('masque le message, les exceptions et le fil d Ariane', () => {
    const ev = {
      message: 'echec pour idriss@salistar.com',
      exception: { values: [{ value: 'cle sk-proj-AbCdEfGhIjKlMnOpQr invalide' }] },
      breadcrumbs: [{ message: 'GET /users/a@b.com' }, { message: 'sans donnee' }],
    };
    const sorti = masquerEvenement(ev);
    expect(sorti.message).toBe('echec pour [courriel]');
    expect(sorti.exception.values[0].value).toBe('cle [cle] invalide');
    expect(sorti.breadcrumbs[0].message).toBe('GET /users/[courriel]');
    expect(sorti.breadcrumbs[1].message).toBe('sans donnee');
  });

  it('⚠ NE JETTE JAMAIS : un rapport non masque vaut mieux que pas de rapport', () => {
    // Si ce code a un defaut, il ne doit pas faire disparaitre en silence la
    // remontee d'erreurs de tout le backend.
    const casse: any = { get message() { throw new Error('accesseur casse'); } };
    expect(() => masquerEvenement(casse)).not.toThrow();
    expect(masquerEvenement({} as any)).toEqual({});
    expect(masquerEvenement({ exception: {} } as any)).toEqual({ exception: {} });
  });
});

describe('⚠ la copie ne doit PAS diverger de la racine', () => {
  /** Le corps de `masquerPourSentry`, commentaires et espaces retires. */
  function reglesDe(chemin: string): string {
    const src = fs.readFileSync(chemin, 'utf8');
    const debut = src.indexOf('export function masquerPourSentry');
    expect(debut).toBeGreaterThan(-1);
    return src
      .slice(debut)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  it('les regles des deux fichiers sont IDENTIQUES', () => {
    // Ce test est la seule chose qui empeche les deux versions de partir
    // chacune de leur cote. Il echouera le jour ou quelqu'un ajoutera une regle
    // ici sans l'ajouter la-bas — ou l'inverse — et c'est exactement ce qu'on
    // veut d'une protection de donnees de sante.
    const ici = path.join(__dirname, 'sentryMasquage.ts');
    const racine = path.join(__dirname, '..', '..', 'lib', 'sentryMasquage.ts');
    expect(fs.existsSync(racine)).toBe(true);
    expect(reglesDe(ici)).toBe(reglesDe(racine));
  });

  it('et le backend appelle bien ce masquage avant d envoyer', () => {
    // Un module parfait qu'aucun `beforeSend` n'appelle ne protege rien.
    const instrument = fs.readFileSync(path.join(__dirname, 'instrument.ts'), 'utf8');
    expect(instrument).toMatch(/beforeSend:/);
    expect(instrument).toMatch(/masquerEvenement/);
  });
});
