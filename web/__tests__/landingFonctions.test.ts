/**
 * Autant d'icônes que de fonctions, et les trois langues d'accord entre elles.
 * ---------------------------------------------------------------------------
 * La section « Fonctions » rend son icône par `FEAT_ICONS[i]`. Une fonction
 * ajoutée sans son icône affiche donc une **pastille vide** — et comme les
 * ajouts se font naturellement en tête de liste (on met en avant ce qui compte),
 * c'est la PREMIÈRE carte de la page qui la porterait.
 *
 * Le 10/09/2026, deux fonctions ont été ajoutées d'un coup dans les trois
 * langues : la reconnaissance des 71 plats marocains et le mode Ramadan. Ils
 * existaient depuis des mois et n'étaient mentionnés nulle part sur la landing
 * — le seul avantage qu'aucun concurrent ne peut copier, et il était invisible.
 * L'ajout a fait passer la liste de 9 à 11 sans toucher aux icônes.
 *
 * ⚠ LE DÉSACCORD ENTRE LANGUES EST PIRE QUE LE MANQUE D'ICÔNE.
 * Les trois listes sont indexées sur la MÊME table d'icônes. Si la version
 * arabe a une fonction de plus que la française, l'arabe décale toutes ses
 * icônes d'un cran : chaque carte porte alors l'icône de sa voisine, sans que
 * rien ne casse ni ne s'affiche en rouge.
 */
import fs from 'fs';
import path from 'path';

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'app', '(landing)', 'Landing.tsx'),
  'utf8',
);

/** Nombre d'entrées `{ t: … }` dans la liste `features` d'une langue. */
function compterFonctions(langue: string): number {
  const bloc = SOURCE.split(`  ${langue}: {`)[1];
  if (!bloc) throw new Error(`langue introuvable : ${langue}`);
  const liste = bloc.split('features: [')[1]?.split('    ],')[0] ?? '';
  return (liste.match(/\{ t:/g) || []).length;
}

const NB_ICONES = (
  SOURCE.match(/const FEAT_ICONS = \[([\s\S]*?)\];/)?.[1].match(/key=/g) || []
).length;

describe('landing — la section Fonctions', () => {
  it('declare au moins une icone', () => {
    expect(NB_ICONES).toBeGreaterThan(0);
  });

  it.each(['fr', 'en', 'ar'])('%s : autant de fonctions que d icones', (langue) => {
    expect(compterFonctions(langue)).toBe(NB_ICONES);
  });

  it('les trois langues annoncent le MEME nombre de fonctions', () => {
    // Sinon les icônes se décalent dans la langue la plus longue, et chaque
    // carte porte celle de sa voisine.
    const comptes = ['fr', 'en', 'ar'].map(compterFonctions);
    expect(new Set(comptes).size).toBe(1);
  });

  it('l atout marocain est bien present dans les trois langues', () => {
    // Ce n'est pas du décor : c'est le seul avantage qu'aucun concurrent ne
    // peut copier. Il a manqué des mois ; qu'il ne reparte pas en silence.
    expect(SOURCE).toContain('71 plats marocains');
    expect(SOURCE).toContain('71 Moroccan dishes');
    expect(SOURCE).toMatch(/71 طبقًا مغربيًا/);
  });
});
