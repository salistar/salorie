/**
 * Les étiquettes de tri : ce qui transforme « ça a cassé » en « ça a cassé où ».
 * ---------------------------------------------------------------------------
 * Partie 12 de l'audit : les SDK Sentry étaient bien branchés et bien réglés,
 * mais aucun n'étiquetait ses erreurs. Une erreur sans axe de filtrage se lit
 * « quelque chose a cassé chez quelqu'un » ; avec les bons axes, la même se lit
 * « chez les utilisateurs en arabe, et seulement eux ».
 *
 * ⚠ LES TROIS AXES NE SONT PAS GÉNÉRIQUES : ce sont les trois endroits où cette
 * application a déjà cassé. Le RTL (icônes inversées, titres tronqués en plein
 * mot), les thèmes sombres (deux barres d'onglets invisibles, un titre noir sur
 * noir sur les six palettes), et la cascade de vision à quatre étages.
 */
const poses: Array<{ cle: string; valeur: string }> = [];
let sdkCasse = false;

jest.mock('@sentry/react-native', () => ({
  setTag: jest.fn((cle: string, valeur: string) => {
    if (sdkCasse) throw new Error('SDK non initialise');
    poses.push({ cle, valeur });
  }),
}));

import { poserPalierScan, poserTags, tagsInterface } from '../lib/sentryTags';

beforeEach(() => {
  poses.length = 0;
  sdkCasse = false;
});

describe('tagsInterface — les axes de filtrage', () => {
  it('rend les quatre etiquettes attendues', () => {
    expect(tagsInterface({ theme: 'obsidian', apparence: 'dark', langue: 'fr' })).toEqual({
      theme: 'obsidian',
      apparence: 'dark',
      langue: 'fr',
      rtl: 'false',
    });
  });

  it('⚠ L ARABE EST MARQUE RTL', () => {
    // L'axe qui compte le plus ici : le public vise lit l'arabe, et la
    // quasi-totalite des defauts d'affichage de ce depot etaient des defauts de
    // RTL. Sans cette etiquette, ils se noient dans la masse.
    expect(tagsInterface({ langue: 'ar' }).rtl).toBe('true');
    expect(tagsInterface({ langue: 'fr' }).rtl).toBe('false');
    expect(tagsInterface({ langue: 'en' }).rtl).toBe('false');
  });

  it('la casse et les espaces ne creent pas deux etiquettes pour une', () => {
    // `AR` et `ar` filtreraient separement dans Sentry, et on croirait avoir
    // deux populations distinctes.
    const t = tagsInterface({ theme: '  Obsidian ', apparence: 'DARK', langue: 'AR' });
    expect(t).toEqual({ theme: 'obsidian', apparence: 'dark', langue: 'ar', rtl: 'true' });
  });

  it('⚠ UNE VALEUR ABSENTE VAUT « inconnu », PAS UNE ETIQUETTE MANQUANTE', () => {
    // Dans Sentry, « absent » et « vide » se filtrent differemment. `inconnu`
    // est une INFORMATION : il veut dire que l'erreur est survenue avant que le
    // contexte ne soit pret — ce qui est deja une piste, et justement le moment
    // le plus fragile du demarrage.
    expect(tagsInterface({})).toEqual({
      theme: 'inconnu', apparence: 'inconnu', langue: 'inconnu', rtl: 'inconnu',
    });
    expect(tagsInterface({ theme: '', langue: null })).toMatchObject({
      theme: 'inconnu', langue: 'inconnu', rtl: 'inconnu',
    });
  });

  it('une langue inconnue n est pas declaree RTL par defaut', () => {
    // Se tromper dans ce sens ferait croire a un defaut de RTL la ou il n'y en
    // a pas, et enverrait chercher au mauvais endroit.
    expect(tagsInterface({ langue: 'es' }).rtl).toBe('false');
  });

  it('les autres ecritures de droite a gauche sont reconnues', () => {
    // L'application ne les sert pas encore, mais l'etiquette doit rester juste
    // le jour ou elle le fera.
    for (const l of ['he', 'fa', 'ur']) expect(tagsInterface({ langue: l }).rtl).toBe('true');
  });
});

describe('poserTags — le geste, qui ne doit jamais nuire', () => {
  it('transmet chaque etiquette au SDK', () => {
    poserTags(tagsInterface({ theme: 'ivory', apparence: 'light', langue: 'ar' }));
    expect(poses).toEqual([
      { cle: 'theme', valeur: 'ivory' },
      { cle: 'apparence', valeur: 'light' },
      { cle: 'langue', valeur: 'ar' },
      { cle: 'rtl', valeur: 'true' },
    ]);
  });

  it('⚠ UN SDK NON INITIALISE NE FAIT PAS PLANTER L APPLICATION', () => {
    // Une application qui plante en essayant de bien ranger ses rapports de
    // plantage serait une plaisanterie. Et le cas est reel : les etiquettes
    // sont posees par un effet React qui peut tourner avant que `Sentry.init`
    // n'ait fini, ou en developpement ou le SDK est desactive.
    sdkCasse = true;
    expect(() => poserTags(tagsInterface({ langue: 'fr' }))).not.toThrow();
  });

  it('une etiquette qui echoue n empeche pas les suivantes', () => {
    // Le `try/catch` est DANS la boucle, pas autour : sinon la premiere erreur
    // emporterait les trois autres axes.
    const { setTag } = require('@sentry/react-native');
    (setTag as jest.Mock).mockImplementationOnce(() => { throw new Error('la premiere casse'); });
    poserTags(tagsInterface({ theme: 'ivory', apparence: 'light', langue: 'fr' }));
    expect(poses.map((p) => p.cle)).toEqual(['apparence', 'langue', 'rtl']);
  });
});

describe('poserPalierScan — a quel etage la cascade a repondu', () => {
  it('marque le palier tel qu il est nomme ailleurs', () => {
    // Memes noms que ceux transmis a `submitScanFeedback` : `device`,
    // `backend`, `ai`. Les faire diverger rendrait les deux jeux de donnees
    // incomparables.
    for (const p of ['device', 'backend', 'ai', 'cloudflare']) {
      poses.length = 0;
      poserPalierScan(p);
      expect(poses).toEqual([{ cle: 'palier_scan', valeur: p }]);
    }
  });

  it('un palier absent vaut « inconnu »', () => {
    poserPalierScan(null);
    expect(poses).toEqual([{ cle: 'palier_scan', valeur: 'inconnu' }]);
    poses.length = 0;
    poserPalierScan(undefined);
    expect(poses).toEqual([{ cle: 'palier_scan', valeur: 'inconnu' }]);
  });

  it('ne jette pas davantage quand le SDK est absent', () => {
    sdkCasse = true;
    expect(() => poserPalierScan('device')).not.toThrow();
  });
});

describe('le branchement, verifie sur les sources', () => {
  it('⚠ LE COMPOSANT EST MONTE SOUS LES DEUX FOURNISSEURS', () => {
    // `useTheme()` et `useTranslation()` jettent si on les appelle hors de
    // leurs fournisseurs — au demarrage, sur l'ecran blanc. La position dans
    // l'arbre n'est donc pas cosmetique : c'est la difference entre une
    // etiquette et un ecran de lancement casse.
    const fs = require('fs');
    const path = require('path');
    const layout = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
    const iTheme = layout.indexOf('<ThemeProvider>');
    const iI18n = layout.indexOf('<I18nProvider>');
    const iTags = layout.indexOf('<EtiquettesSentry />');
    expect(iTheme).toBeGreaterThan(-1);
    expect(iI18n).toBeGreaterThan(-1);
    expect(iTags).toBeGreaterThan(iI18n);
    expect(iI18n).toBeGreaterThan(iTheme);
  });

  it('le palier est etiquete la ou il est connu', () => {
    const fs = require('fs');
    const path = require('path');
    const ecran = fs.readFileSync(
      path.join(__dirname, '..', 'app', '(app)', 'log-food-details.tsx'), 'utf8',
    );
    expect(ecran).toMatch(/poserPalierScan\(/);
  });
});
