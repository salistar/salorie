/**
 * La clé qui décide si l'application refait passer l'onboarding.
 * ---------------------------------------------------------------------------
 * Un seul drapeau évite qu'un utilisateur déjà installé refasse l'intégralité
 * de l'onboarding à chaque ouverture : `onboarded_<courriel en minuscules>`.
 * Écrit à la fin de l'onboarding, relu au démarrage, avant même Firebase — c'est
 * lui qui supprime le splash à la reconnexion.
 *
 * ⚠ CE TEST EXISTE POUR UNE LIGNE QUI NE FAIT RIEN, ET QUI DOIT CONTINUER.
 * À la déconnexion, `app/(tabs)/profile.tsx` supprime `onboarded_${user.id}` —
 * l'identifiant Clerk, pas le courriel. **Aucun code n'écrit jamais cette
 * clé-là** : la ligne est donc sans effet. Et c'est une chance : si on la
 * « réparait » en lui donnant le courriel, chaque déconnexion effacerait le
 * drapeau, et la reconnexion suivante renverrait l'utilisateur au début d'un
 * onboarding qu'il a déjà fait — exactement le défaut que le cache par courriel
 * a été écrit pour supprimer.
 *
 * Le test lit donc les SOURCES : c'est une cohérence entre quatre fichiers que
 * rien, dans le code, ne tient ensemble.
 */
import fs from 'fs';
import path from 'path';

const RACINE = path.join(__dirname, '..');
const lire = (...p: string[]) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');

const LAYOUT = lire('app', '_layout.tsx');
const SAUVEGARDE = lire('lib', 'onboardingSave.ts');
const PROFIL = lire('app', '(tabs)', 'profile.tsx');
const CACHE = lire('lib', 'LocalDataStore.ts');

describe('la cle d onboarding — ecrite et relue au meme endroit', () => {
  it('n est ecrite QU EN MINUSCULES', () => {
    // `onboardingSave.ts` est le seul a l'ecrire.
    expect(SAUVEGARDE).toMatch(/onboarded_\$\{user\.email\.toLowerCase\(\)\}/);
  });

  it('⚠ EST RELUE SUR UN COURRIEL DEJA MIS EN MINUSCULES', () => {
    // Les deux lectures de `_layout.tsx` s'ecrivent `onboarded_${email}` sans
    // `.toLowerCase()` visible sur la ligne. Ce n'est PAS un defaut : `email`
    // est construit juste au-dessus avec `?.toLowerCase()`. Le verifier ici
    // evite qu'on supprime un jour cette normalisation en amont en croyant
    // qu'elle ne sert a rien — un courriel Clerk avec une majuscule rendrait
    // alors le drapeau introuvable, et l'onboarding recommencerait.
    const lignes = LAYOUT.split('\n');
    const lectures = lignes
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /onboarded_\$\{email\}/.test(l));
    expect(lectures.length).toBeGreaterThanOrEqual(2);
    for (const { i } of lectures) {
      // La declaration de `email` la plus proche AU-DESSUS doit normaliser.
      const avant = lignes.slice(0, i).reverse();
      const decl = avant.find((l) => /const email\s*=/.test(l));
      expect(decl).toMatch(/toLowerCase\(\)/);
    }
  });

  it('⚠ ET TOUTE CLE DE STOCKAGE BATIE SUR UN COURRIEL EST NORMALISEE', () => {
    // La regle generale dont l'onboarding n'est qu'un cas. Trois formes sont
    // acceptables, et une seule est interdite : le courriel brut.
    //   `emailToDocId(email)`     — normalise (trim + minuscules)
    //   `email.toLowerCase()`     — normalise sur place
    //   `${email}` ou `email` a deja ete mis en minuscules a sa declaration
    //
    // Un seul oubli et l'utilisateur dont l'adresse Clerk porte une majuscule
    // ouvre un cache vide : l'application a l'air d'avoir tout perdu, et le
    // defaut ne se reproduit pas chez qui teste en minuscules.
    const lignes = LAYOUT.split('\n');
    const fautives: string[] = [];
    lignes.forEach((ligne, i) => {
      const cles = [...ligne.matchAll(/`([a-z_]+)_\$\{([^}]+)\}`/g)];
      for (const [, , expr] of cles) {
        if (/emailToDocId|toLowerCase/.test(expr)) continue;
        if (!/email/.test(expr)) continue;
        const avant = lignes.slice(0, i).reverse();
        const decl = avant.find((l) => /const email\s*=/.test(l)) || '';
        if (!/toLowerCase\(\)/.test(decl)) fautives.push(`${i + 1}: ${ligne.trim()}`);
      }
    });
    expect(fautives).toEqual([]);
  });

  it('la purge du cache vise la meme forme', () => {
    // `clearAllLocalData` supprime `onboarded_${email.toLowerCase()}`.
    expect(CACHE).toMatch(/onboarded_\$\{email\.toLowerCase\(\)\}/);
  });
});

describe('⚠ la ligne de deconnexion qui ne fait rien', () => {
  it('supprime une cle indexee sur l identifiant Clerk', () => {
    // Le constat, tel quel.
    expect(PROFIL).toMatch(/removeItem\(`onboarded_\$\{user\.id\}`\)/);
  });

  it('ET AUCUN CODE N ECRIT CETTE CLE', () => {
    // La preuve que la ligne est inerte : on cherche une ecriture indexee sur
    // `user.id` dans tout le code de l'application.
    const fichiers: string[] = [];
    const parcourir = (dossier: string) => {
      for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
        const p = path.join(dossier, e.name);
        if (/node_modules|__tests__|\.next/.test(p)) continue;
        if (e.isDirectory()) parcourir(p);
        else if (/\.tsx?$/.test(e.name)) fichiers.push(p);
      }
    };
    parcourir(path.join(RACINE, 'app'));
    parcourir(path.join(RACINE, 'lib'));

    const ecritures = fichiers.filter((f) => {
      const src = fs.readFileSync(f, 'utf8');
      return /setItem\(\s*`onboarded_\$\{user\.id\}`/.test(src);
    });
    expect(ecritures).toEqual([]);
  });

  it('⚠ ET LA « REPARER » SERAIT UNE REGRESSION', () => {
    // Si cette ligne visait le courriel, chaque deconnexion effacerait le
    // drapeau. Or `_layout.tsx` compte dessus pour eviter le splash a la
    // reconnexion — c'est ecrit noir sur blanc dans ses commentaires, et c'est
    // cette phrase-la qui est verrouillee ici : tant qu'elle est vraie, la
    // deconnexion ne doit PAS toucher au drapeau par courriel.
    expect(LAYOUT).toMatch(/evite totalement le splash a la reconnexion|déjà été onboardé sur ce device/);
    expect(PROFIL).not.toMatch(/removeItem\(`onboarded_\$\{[^}]*email/);
  });
});
