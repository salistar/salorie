/**
 * Les deux moitiés de l'interrupteur disent-elles la même chose ?
 * ---------------------------------------------------------------------------
 * Éteindre une fonctionnalité demande DEUX gestes, dans deux fichiers :
 *
 *   lib/navFlags.ts        masque la TUILE dans les hubs.
 *   useScreenGate(cle)     ferme l'ÉCRAN lui-même.
 *
 * Aucun des deux ne suffit, et les oublier séparément produit deux pannes
 * opposées — dont aucune ne lève d'erreur :
 *
 *   TUILE SANS GARDE   l'admin éteint, la tuile disparaît, et l'écran reste
 *                      joignable par lien profond ou par un autre écran qui le
 *                      cite. L'interrupteur ment.
 *   GARDE SANS TUILE   l'écran se ferme, mais sa tuile reste affichée. On tape
 *                      dessus, on reçoit « fonctionnalité désactivée ». C'est le
 *                      cul-de-sac que `navFlags` a été écrit pour éviter.
 *
 * Le second cas n'est pas théorique : `/import-data` se protégeait avec le
 * drapeau `import-recipe` — celui d'une AUTRE fonctionnalité — jusqu'au
 * 09/09/2026. Éteindre l'import de recettes fermait la migration de données,
 * en laissant sa tuile bien visible.
 */
import fs from 'fs';
import path from 'path';
import { FLAG_KEYS, flagForRoute, NON_EXTINGUIBLES } from '../lib/navFlags';

const RACINE = path.join(__dirname, '..');
const DOSSIER = path.join(RACINE, 'app', '(app)');

/** Chaque écran de app/(app) : sa route, sa clé de garde si elle existe. */
const ECRANS = fs.readdirSync(DOSSIER)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => {
    const src = fs.readFileSync(path.join(DOSSIER, f), 'utf8');
    const m = src.match(/useScreenGate\('([^']+)'\)/);
    return { route: f.replace(/\.tsx$/, ''), garde: m ? m[1] : null };
  });

describe('drapeaux : la tuile et l ecran s accordent', () => {
  it('toute cle de garde figure dans FLAG_KEYS', () => {
    // Sans ça, la tuile reste affichée alors que l'écran se ferme.
    const orphelines = ECRANS
      .filter((e) => e.garde && !FLAG_KEYS.has(e.garde))
      .map((e) => `${e.route} garde sur « ${e.garde} », absente de FLAG_KEYS`);
    expect(orphelines).toEqual([]);
  });

  it('un ecran garde est masquable depuis les hubs par la MEME cle', () => {
    // `flagForRoute` est ce que lisent les hubs. Si elle rend une autre clé que
    // celle du garde, on peut éteindre l'une sans l'autre — l'incident
    // `import-data` / `import-recipe` exactement.
    const desaccords = ECRANS
      .filter((e) => e.garde)
      .map((e) => ({ ...e, hub: flagForRoute('/' + e.route) }))
      .filter((e) => e.hub !== e.garde)
      .map((e) => `${e.route} : ecran=« ${e.garde} » hub=« ${e.hub} »`);
    expect(desaccords).toEqual([]);
  });

  it('toute cle de FLAG_KEYS commande au moins un ecran', () => {
    // Une clé que rien n'écoute donne à l'admin un bouton qui ne fait rien.
    const utilisees = new Set(ECRANS.map((e) => e.garde).filter(Boolean));
    for (const e of ECRANS) {
      const f = flagForRoute('/' + e.route);
      if (f) utilisees.add(f);
    }
    const fantomes = [...FLAG_KEYS].filter((k) => !utilisees.has(k));
    expect(fantomes).toEqual([]);
  });
});

describe('drapeaux : ce qui ne doit JAMAIS pouvoir s eteindre', () => {
  // ⚠ CETTE LISTE EST UNE PROTECTION, PAS UN INVENTAIRE.
  // Le risque de ce système n'est pas seulement d'oublier un interrupteur :
  // c'est d'en poser un là où il ne faut pas. Un admin qui coupe l'un de ces
  // écrans ne dégrade pas l'application, il la casse — ou fait sauter sa
  // conformité au magasin.
  // Lue depuis `navFlags`, PAS recopiee ici : deux listes censees s'accorder
  // finissent toujours par diverger, et c'est justement le defaut que ce fichier
  // existe pour attraper ailleurs.
  const INTOUCHABLES = Object.entries(NON_EXTINGUIBLES).filter(([r]) => r !== '');

  it.each(INTOUCHABLES)('« %s » n est pas extinguible (%s)', (route) => {
    expect(FLAG_KEYS.has(route)).toBe(false);
    expect(flagForRoute('/' + route)).toBeNull();
  });

  it('aucun ecran intouchable ne pose de garde', () => {
    const noms = INTOUCHABLES.map(([r]) => r);
    const fautifs = ECRANS
      .filter((e) => e.garde && noms.includes(e.route))
      .map((e) => `${e.route} garde sur « ${e.garde} »`);
    expect(fautifs).toEqual([]);
  });
});
