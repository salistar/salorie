import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Les copies partagees avec le web sont-elles a jour ?
 *
 * ## Pourquoi il y a des copies
 *
 * Le contexte de build Docker du web est `./web`. Un import qui sort de ce
 * dossier passe en local — le fichier existe sur disque — et echoue dans le
 * conteneur avec « module not found ». Deux deploiements ont ete perdus a le
 * decouvrir, le 17 aout 2026.
 *
 * ## Pourquoi ce test existe
 *
 * Une copie qu'on oublie de mettre a jour est exactement ce qu'on cherchait a
 * eviter en partageant le code. Ici la copie est ADMISE mais VERIFIEE : si les
 * deux fichiers divergent, ce test echoue et la suite passe au rouge.
 *
 * Ca compte surtout pour `rapportSanteHtml` : c'est un rapport MEDICAL. Deux
 * rendus differents, ce sont deux documents differents remis au meme medecin, et
 * personne ne s'en apercevrait avant que ca compte.
 *
 * Pour reparer : `npm run sync:partage`.
 */

const PARTAGES = [
  'importParsers.ts',
  'rapportSanteHtml.ts',
  'exercicesPlus.ts',
  // L'arborescence est conservee : `localRecipes.ts` garde son import
  // `./objective/scoring` sans reecriture, donc la copie reste comparable a la
  // source caractere par caractere.
  'objective/scoring.ts',
  'localRecipes.ts',
  'adaptiveTDEE.ts',
  'projections.ts',
];
const racine = join(__dirname, '..');

/**
 * Le corps du fichier, sans l'en-tête « copie générée ».
 *
 * On coupe sur un MARQUEUR explicite, jamais sur « les commentaires du début » :
 * la source commence elle aussi par un bloc de commentaires, et une découpe
 * heuristique l'emportait avec l'en-tête. Le test échouait alors toujours — et un
 * test toujours rouge finit par être ignoré, ce qui le rend pire qu'absent.
 */
const MARQUEUR = "// ───── fin de l'entete generee, la source commence ici ─────";

function corps(texte: string): string {
  const i = texte.indexOf(MARQUEUR);
  return i === -1 ? texte.trim() : texte.slice(i + MARQUEUR.length).trim();
}

describe('les copies partagees avec le web', () => {
  for (const f of PARTAGES) {
    it(`${f} est identique a sa source`, () => {
      const source = readFileSync(join(racine, 'lib', f), 'utf8');
      const copie = readFileSync(join(racine, 'web', 'lib', 'partage', f), 'utf8');
      // Message explicite : quelqu'un qui voit ce test rouge doit savoir quoi
      // taper, pas partir chercher.
      expect(corps(copie) === source.trim() ? 'a jour' : `DIVERGE — lance : npm run sync:partage`).toBe('a jour');
    });

    it(`${f} porte bien l'avertissement de copie generee`, () => {
      // Sans cet avertissement en tete, quelqu'un modifiera la copie et sa
      // correction disparaitra a la prochaine synchronisation.
      const copie = readFileSync(join(racine, 'web', 'lib', 'partage', f), 'utf8');
      expect(copie.startsWith('// ⚠️ COPIE GENEREE')).toBe(true);
    });
  }
});
