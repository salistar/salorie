/**
 * Aucun écran ne demande une permission sensible sans l'avoir expliquée.
 * ---------------------------------------------------------------------------
 * Google Play exige une **divulgation préalable** : l'application doit dire
 * elle-même, AVANT que la boîte de dialogue Android n'apparaisse, quelle donnée
 * elle va lire, pour quoi faire, et ce qu'elle en fait. La boîte du système ne
 * suffit pas — elle demande « Autoriser Salorie à accéder au micro ? » sans
 * dire pourquoi. S'en contenter est un motif de rejet documenté.
 *
 * ⚠ AU 10/09/2026, LES DIX POINTS DE DEMANDE APPELAIENT LE SYSTÈME DIRECTEMENT.
 * Trois pour le micro (`ai-coach`, `live-twin`, `voice-log`), sept pour la
 * position (`ar-ghost`, `challenge-ar`, `challenge`, `duo-walk`, `race-live`,
 * `run`). Trois écrans affichaient bien une explication — mais APRÈS un refus,
 * ce qui est l'inverse de ce qui est demandé.
 *
 * ⚠ CE TEST PORTE SUR LA FORME, PARCE QUE LE FOND EST INVÉRIFIABLE ICI.
 * On ne peut pas prouver dans un test unitaire qu'un texte s'affiche avant une
 * boîte native. Ce qu'on PEUT garantir, c'est qu'un seul module parle au
 * système : dix appels directs, c'était dix endroits où l'oubli passait
 * inaperçu ; un seul, c'est un endroit qu'on relit.
 *
 * Un onzième écran qui aurait besoin du micro devra donc passer par
 * `lib/divulgationPermission.ts` — ou faire échouer la CI.
 */
import fs from 'fs';
import path from 'path';

const RACINE = path.join(__dirname, '..');

function fichiers(dossier: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dossier)) return acc;
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (/node_modules|__tests__/.test(p)) continue;
    if (e.isDirectory()) fichiers(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Retire les commentaires : ces fichiers PARLENT de l'API sans l'appeler. */
const sansCommentaires = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/[^\n]*$/gm, '');

const SOURCES = [
  ...fichiers(path.join(RACINE, 'app')),
  ...fichiers(path.join(RACINE, 'components')),
  ...fichiers(path.join(RACINE, 'lib')),
].map((f) => ({
  nom: path.relative(RACINE, f).replace(/\\/g, '/'),
  code: sansCommentaires(fs.readFileSync(f, 'utf8')),
}));

/** La seule porte autorisée. */
const PORTE = 'lib/divulgationPermission.ts';

describe('divulgation prealable — une seule porte vers le systeme', () => {
  it('la porte existe et expose les deux demandes', () => {
    const porte = SOURCES.find((s) => s.nom === PORTE);
    expect(porte).toBeDefined();
    expect(porte!.code).toMatch(/export async function demanderMicro/);
    expect(porte!.code).toMatch(/export async function demanderLocalisation/);
  });

  it('aucun ecran n appelle Audio.requestPermissionsAsync directement', () => {
    const fautifs = SOURCES
      .filter((s) => s.nom !== PORTE)
      .filter((s) => /Audio\.requestPermissionsAsync\s*\(/.test(s.code))
      .map((s) => s.nom);
    expect(fautifs).toEqual([]);
  });

  it('aucun ecran ne demande la position directement', () => {
    const fautifs = SOURCES
      .filter((s) => s.nom !== PORTE)
      .filter((s) => /Location\.request(Foreground|Background)PermissionsAsync\s*\(/.test(s.code))
      .map((s) => s.nom);
    expect(fautifs).toEqual([]);
  });

  it('la divulgation dit CE QUI est lu, POURQUOI, et ce qu on en fait', () => {
    // Les trois elements que Google attend. Une explication qui dit seulement
    // « nous avons besoin du micro » ne vaut pas mieux que la boite du systeme.
    const porte = SOURCES.find((s) => s.nom === PORTE)!.code;
    for (const attendu of [
      /transcrire/i,          // pourquoi (micro)
      /jamais conserv/i,      // ce qu'on en fait (micro)
      /distance/i,            // pourquoi (position)
      /jamais quand l'application est ferm/i, // ce qu'on n'en fait PAS (position)
    ]) {
      expect(porte).toMatch(attendu);
    }
  });

  it('les trois langues sont couvertes', () => {
    // Une divulgation que l'utilisateur ne comprend pas n'en est pas une, et le
    // public vise lit l'arabe et le francais avant l'anglais.
    const porte = SOURCES.find((s) => s.nom === PORTE)!.code;
    for (const langue of ['fr:', 'en:', 'ar:']) expect(porte).toContain(langue);
    expect(porte).toMatch(/الميكروفون/);
  });

  it('fermer la boite sans choisir vaut REFUS', () => {
    // Google exige une action positive. Un `onDismiss` qui resoudrait `true`
    // ferait passer une fermeture accidentelle pour un consentement.
    const porte = SOURCES.find((s) => s.nom === PORTE)!.code;
    expect(porte).toMatch(/onDismiss:\s*\(\)\s*=>\s*resoudre\(false\)/);
  });
});
