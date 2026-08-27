// La politique d'images ne tient que si un test la fait respecter.
//
// Ce test existe parce que le contrôle a la main a echoue : les noms de fichiers
// MENTENT. `weightlifting.jpg` est une photo aerienne de vagues,
// `gain_weight.jpg` montrait deux personnes. Quatre images non conformes
// vivaient sur douze emplacements sans que rien ne les signale.
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const RACINE = path.resolve(__dirname, '..');
const manifeste = JSON.parse(
  fs.readFileSync(path.join(RACINE, 'assets', 'images.manifest.json'), 'utf8'),
);

describe('politique d images', () => {
  it('aucune image non conforme n est utilisee', () => {
    expect(() =>
      execFileSync('node', ['scripts/manifeste-images.js', '--verifier'], {
        cwd: RACINE, stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it('toute image utilisee existe sur le disque', () => {
    // Une image absente ne casse pas le build Metro : elle produit un carre vide
    // a l'ecran, en production, sans un mot dans le journal.
    const absentes = Object.entries(manifeste.images)
      .filter(([, v]: any) => !v.existe)
      .map(([k]) => k);
    expect(absentes).toEqual([]);
  });

  it('les quatre images retirees ne reviennent pas', () => {
    // Un copier-coller depuis un ancien ecran suffirait a les ramener.
    const interdites = Object.keys(manifeste._retirees).filter((k) => !k.startsWith('_'));
    const utilisees = Object.keys(manifeste.images);
    for (const i of interdites) expect(utilisees).not.toContain(i);
  });

  it('le manifeste est a jour vis-a-vis du code', () => {
    // Si quelqu'un ajoute une image sans regenerer, elle n'est verifiee par
    // personne. On regenere en memoire et on compare la liste des cles.
    const avant = Object.keys(manifeste.images).sort();
    execFileSync('node', ['scripts/manifeste-images.js'], { cwd: RACINE, stdio: 'pipe' });
    const apres = Object.keys(
      JSON.parse(fs.readFileSync(path.join(RACINE, 'assets', 'images.manifest.json'), 'utf8')).images,
    ).sort();
    expect(apres).toEqual(avant);
  });

  it('les visuels abstraits sont verifies et conformes', () => {
    const abstraits = Object.entries(manifeste.images).filter(([k]) => k.startsWith('abstraits/'));
    expect(abstraits.length).toBeGreaterThanOrEqual(4);
    for (const [cle, v] of abstraits as any) {
      expect(`${cle}:${v.conforme}`).toBe(`${cle}:true`);
    }
  });
});
