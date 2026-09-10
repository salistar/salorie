/**
 * Chaque écran réserve-t-il la place du meuble flottant ?
 * ---------------------------------------------------------------------------
 * La barre d'onglets et le bouton « + » sont en `position: absolute` : ils ne
 * poussent rien et ne réservent aucune place. Chaque écran doit donc la
 * réserver lui-même, et `lib/espaceBas.ts` existe pour qu'il n'ait pas à la
 * deviner.
 *
 * Son en-tête raconte ce qui se passe quand on devine : « chaque écran devinait
 * autre chose : 120, 130, 140, 140. Tous trop peu, et le bouton + recouvrait la
 * fin des listes au repos. »
 *
 * ⚠ LE MODULE A ÉTÉ ÉCRIT, ET UN ÉCRAN EST RESTÉ DEHORS.
 * Le 10/09/2026, sur un émulateur réglé à 320 dp, `defis.tsx` était le seul des
 * cinq onglets à ne pas l'appeler : il gardait `paddingBottom: 130` en dur,
 * l'une des devinettes d'origine, pour une valeur calculée proche de 200.
 *
 * Ce test refuse que ça recommence. Il porte sur la FORME, pas sur le rendu :
 * un écran qui écrit une constante au lieu d'appeler la fonction échoue, même
 * si la constante se trouve juste aujourd'hui — elle ne le restera pas, parce
 * qu'elle ne dépend pas du décalage système, qui varie d'un téléphone à l'autre.
 */
import fs from 'fs';
import path from 'path';

const RACINE = path.join(__dirname, '..');
const ONGLETS = path.join(RACINE, 'app', '(tabs)');

const ECRANS = fs.readdirSync(ONGLETS)
  .filter((f) => f.endsWith('.tsx') && f !== '_layout.tsx')
  .map((f) => ({ nom: f, source: fs.readFileSync(path.join(ONGLETS, f), 'utf8') }));

describe('les ecrans a onglets degagent la barre ET le bouton', () => {
  it('il y a bien cinq onglets a verifier', () => {
    // Si ce nombre change, c'est qu'un onglet est apparu ou a disparu : le
    // reste du fichier merite alors une relecture, pas un ajustement.
    expect(ECRANS.map((e) => e.nom).sort()).toEqual(
      ['analytics.tsx', 'coach.tsx', 'defis.tsx', 'index.tsx', 'profile.tsx'],
    );
  });

  it.each(ECRANS.map((e) => e.nom))('%s appelle useEspaceBas()', (nom) => {
    const e = ECRANS.find((x) => x.nom === nom)!;
    expect(e.source).toMatch(/useEspaceBas\s*\(\s*\)/);
  });

  it('aucun onglet ne code en dur un paddingBottom de « meuble »', () => {
    // On ne vise que les grandes valeurs : `paddingBottom: 8` est de l'air
    // ordinaire, `paddingBottom: 130` est une tentative de deviner la place du
    // bouton « + ». Le seuil est bas exprès — la valeur calculee depasse 190,
    // donc toute constante au-dessus de 100 est forcement une devinette, et
    // forcement trop basse.
    const fautifs: string[] = [];
    for (const e of ECRANS) {
      for (const m of e.source.matchAll(/paddingBottom:\s*(\d+)/g)) {
        if (Number(m[1]) > 100) fautifs.push(`${e.nom} : paddingBottom: ${m[1]}`);
      }
    }
    expect(fautifs).toEqual([]);
  });
});

describe('les ecrans POUSSES ne reservent pas la place deux fois', () => {
  // ⚠ ICI LA REGLE EST L'INVERSE DE CELLE DES ONGLETS, ET C'EST LE PIEGE.
  // Un écran à onglets réserve lui-même. Un écran poussé, non : c'est
  // `app/(app)/_layout.tsx` qui enveloppe TOUT le groupe dans une vue portant
  // `paddingBottom: barreVisible ? useEspaceBasSimple() : 0`. La réserve est
  // donc centrale, et une constante ajoutée dans un écran s'AJOUTE à elle.
  //
  // Cinq écrans le faisaient — activity, healthy-recipes, kitchen, ramadan,
  // workout-details — avec 110 ou 130, soit plus de cent points de vide en trop
  // au bas du défilement. Constaté le 10/09/2026 sur émulateur à 320 dp.
  //
  // ⚠ ET CE POINT NE SE VOIT PAS SOUS LA GRÂCE HORS-LIGNE. L'application s'y
  // croit déconnectée, `PersistentTabBar` rend `null`, `barreVisible` est faux
  // et le layout ne réserve rien : un balayage visuel dans cet état déclarerait
  // tout sain. D'où ce test, qui lit le code et pas l'écran.
  const POUSSES = path.join(RACINE, 'app', '(app)');
  const ecrans = fs.readdirSync(POUSSES)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ nom: f, source: fs.readFileSync(path.join(POUSSES, f), 'utf8') }));

  it('le layout du groupe reserve bien la place, une fois pour tous', () => {
    const layout = fs.readFileSync(path.join(POUSSES, '_layout.tsx'), 'utf8');
    expect(layout).toMatch(/useEspaceBasSimple\s*\(\s*\)/);
    expect(layout).toMatch(/paddingBottom:\s*barreVisible\s*\?/);
  });

  it('aucun ecran pousse n ajoute une constante de « meuble »', () => {
    const fautifs: string[] = [];
    for (const e of ecrans) {
      if (e.nom === '_layout.tsx') continue;
      for (const m of e.source.matchAll(/paddingBottom:\s*(\d+)/g)) {
        if (Number(m[1]) > 100) fautifs.push(`${e.nom} : paddingBottom: ${m[1]}`);
      }
    }
    expect(fautifs).toEqual([]);
  });
});

describe('les valeurs de espaceBas se tiennent', () => {
  const source = fs.readFileSync(path.join(RACINE, 'lib', 'espaceBas.ts'), 'utf8');
  const nombre = (nom: string) => {
    const m = source.match(new RegExp(nom + '\\s*=\\s*(\\d+)'));
    return m ? Number(m[1]) : NaN;
  };

  it('la place reservee depasse la hauteur du bouton et de la barre', () => {
    // `useEspaceBas` = basBarre + 94 + 64 + 16, soit au moins 198 avec le
    // minimum de 24. Si quelqu'un rabote l'une de ces constantes, la fin des
    // listes repasse sous le bouton — sans que rien ne leve d'erreur.
    const auDessus = nombre('BOUTON_AU_DESSUS_DE_LA_BARRE');
    const diametre = nombre('DIAMETRE_BOUTON');
    const respiration = nombre('RESPIRATION');
    const hauteurBarre = nombre('HAUTEUR_BARRE');

    expect(auDessus + diametre + respiration).toBeGreaterThan(hauteurBarre);
    expect(24 + auDessus + diametre + respiration).toBeGreaterThanOrEqual(198);
  });
});
