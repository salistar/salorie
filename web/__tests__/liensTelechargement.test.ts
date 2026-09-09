/**
 * Aucun lien de téléchargement ne doit viser une release FIGÉE.
 * ---------------------------------------------------------------------------
 * `releaseMeta.ts` existe pour une raison écrite dans son propre en-tête : la
 * landing pointait vers `releases/download/v1.0.0`, dont les fichiers dataient
 * du 9 juin 2026. Quiconque installait Salorie depuis le site obtenait une
 * version antérieure au consentement d'amitié et au correctif de la faille
 * Premium.
 *
 * Le 27/08/2026, deux des trois liens ont été branchés sur la release
 * dynamique. LE TROISIÈME — le bouton principal du hero, le plus visible du
 * site — est resté sur l'URL figée jusqu'au 09/09/2026.
 *
 * ⚠ POURQUOI RIEN NE L'A SIGNALÉ, ET POURQUOI CE TEST EST LA SEULE PARADE.
 * L'asset `v1.0.0` n'a jamais été supprimé : le lien répondait 200. Un contrôle
 * de liens morts l'aurait déclaré sain. Le bouton affichait même, juste à côté,
 * la TAILLE du build courant lue dans `meta` — donc l'incohérence était visible
 * à l'œil et personne ne l'a vue.
 *
 * On interdit donc la FORME : un `href` de téléchargement doit passer par
 * `meta`, jamais viser une constante d'URL directement.
 */
import fs from 'fs';
import path from 'path';

const LANDING = path.join(__dirname, '..', 'app', '(landing)', 'Landing.tsx');
const source = fs.readFileSync(LANDING, 'utf8');

describe('les liens de telechargement suivent la derniere release', () => {
  it('aucun href ne vise directement une constante d URL figee', () => {
    // On cherche `href={APK_URL}` / `href={AAB_URL}` — c'est-a-dire la constante
    // SEULE, sans le `meta?...  ??` qui la releguerait au rang de repli.
    const enDur = [...source.matchAll(/href=\{\s*(APK_URL|AAB_URL)\s*\}/g)]
      .map((m) => m[1]);
    expect(enDur).toEqual([]);
  });

  it('chaque lien de telechargement consulte `meta` d abord', () => {
    const liens = [...source.matchAll(/href=\{([^}]*(?:APK_URL|AAB_URL)[^}]*)\}/g)]
      .map((m) => m[1].trim());
    // Il en reste bien (les constantes servent de repli quand l'API GitHub est
    // injoignable) — mais chacun doit commencer par interroger `meta`.
    expect(liens.length).toBeGreaterThan(0);
    for (const l of liens) expect(l).toMatch(/meta\?\.\w+\?\.url\s*\?\?/);
  });

  it('l URL de repli reste une constante unique, pas une copie eparpillee', () => {
    // Trois copies d'une meme URL, c'est trois endroits ou la corriger — et le
    // defaut d'origine venait precisement d'un oubli sur l'un des trois.
    const litterales = [...source.matchAll(/releases\/download\/[^"'`\s]+/g)];
    expect(litterales.length).toBeLessThanOrEqual(1);
  });
});
