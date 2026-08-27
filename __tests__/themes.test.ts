// Le systeme de themes ne peut pas diverger silencieusement.
//
// Trois choses sont verifiees ici, et chacune correspond a une facon reelle de
// se tromper :
//   1. les fichiers generes correspondent bien a design/themes.json ;
//   2. la palette du selecteur web correspond aux memes valeurs ;
//   3. chaque theme porte tous ses jetons.
//
// Sans (1), quelqu'un edite le fichier genere et son travail disparait a la
// prochaine generation. Sans (2), les pastilles annoncent une couleur que le
// theme n'a pas. Sans (3), un ecran au hasard s'affiche sans fond.
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const RACINE = path.resolve(__dirname, '..');
const source = JSON.parse(
  fs.readFileSync(path.join(RACINE, 'design', 'themes.json'), 'utf8'),
);

const REQUIS = [
  'bg', 'surface', 'surface2', 'border', 'text', 'textMuted',
  'accent', 'accent2', 'accentSoft', 'success', 'warning', 'danger',
];

describe('themes', () => {
  it('les fichiers generes correspondent a la source', () => {
    // On appelle le generateur en mode verification plutot que de recomparer a
    // la main : le test valide ainsi l'outil ET les sorties.
    expect(() =>
      execFileSync('node', ['scripts/generer-themes.js', '--verifier'], {
        cwd: RACINE, stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it('chaque theme porte tous ses jetons', () => {
    for (const cle of source.ordreAffichage) {
      const t = source.themes[cle];
      expect(t).toBeDefined();
      for (const jeton of REQUIS) {
        expect(`${cle}.${jeton} = ${t[jeton]}`).toMatch(/= #[0-9A-Fa-f]{6}$/);
      }
      expect(t.gradientHero).toHaveLength(2);
    }
  });

  it('les six themes sont uniques et ordonnes', () => {
    const ordre: string[] = source.ordreAffichage;
    expect(ordre).toHaveLength(6);
    expect(new Set(ordre).size).toBe(6);
    expect(Object.keys(source.themes).sort()).toEqual([...ordre].sort());
  });

  it('les defauts pointent vers des themes existants', () => {
    // Un defaut qui pointe vers un theme absent ne leve pas : il produit une
    // page SANS AUCUNE couleur. C'est le pire des cas, et le plus silencieux.
    expect(source.themes[source.themeParDefautClair]).toBeDefined();
    expect(source.themes[source.themeParDefautSombre]).toBeDefined();
    expect(source.themes[source.themeParDefautClair].sombre).toBe(false);
    expect(source.themes[source.themeParDefautSombre].sombre).toBe(true);
  });

  it('la palette du selecteur web correspond a la source', () => {
    const f = fs.readFileSync(
      path.join(RACINE, 'web', 'components', 'ui', 'SelecteurTheme.tsx'), 'utf8',
    );
    for (const cle of source.ordreAffichage) {
      const t = source.themes[cle];
      const ligne = f.split('\n').find((l) => l.includes(`cle: '${cle}'`));
      expect(ligne).toBeDefined();
      // La pastille montre le FOND du theme et son accent : si l'un des deux
      // ment, l'utilisateur choisit autre chose que ce qu'il voit.
      expect(ligne!.toUpperCase()).toContain(t.bg.toUpperCase());
      expect(ligne!.toUpperCase()).toContain(t.accent.toUpperCase());
    }
  });

  it('les alias de compatibilite existent dans le CSS genere', () => {
    // Les navigateurs des utilisateurs contiennent encore `light` / `dark`.
    // Retirer ces alias ferait taire leur preference, sans erreur.
    const css = fs.readFileSync(
      path.join(RACINE, 'web', 'app', 'themes.generated.css'), 'utf8',
    );
    expect(css).toContain("[data-theme='light']");
    expect(css).toContain("[data-theme='dark']");
  });
});
