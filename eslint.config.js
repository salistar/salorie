// https://docs.expo.dev/guides/using-eslint/
//
// ⚠ CE FICHIER NE POUVAIT PAS SE CHARGER JUSQU'AU 28/08/2026.
// Il importait `eslint/config` et `eslint-config-expo/flat`, deux choses
// absentes de l'ESLint 8.57 et de l'eslint-config-expo 8.0.1 que le depot
// installait. `expo lint` echouait donc au demarrage, avant d'avoir lu la
// moindre regle — pendant des semaines, en silence.
//
// La cause profonde etait ailleurs : un `override` de package.json forcait
// ajv 8 partout, alors qu'ESLint utilise ajv 6. Meme apres la montee en
// version, le lint plantait sur « NOT SUPPORTED: option missingRefs ». L'ajv 6
// est desormais epingle pour ESLint seulement ; la racine garde ajv 8.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // `web/` a sa propre chaine (Next.js) et ses propres regles.
    ignores: ['dist/*', '.expo/*', 'web/*'],
  },

  // ── Les couleurs en dur ────────────────────────────────────────────────────
  //
  // POURQUOI CETTE REGLE EXISTE
  // L'audit d'aout 2026 a compte pres de 2 000 hexadecimaux ecrits a la main
  // dans les ecrans. Ce n'etait pas une negligence : jusqu'a l'arrivee de
  // `constants/tokens.ts`, il n'existait aucun moyen de dire « la surface d'une
  // carte ». Chacun ecrivait donc `isDark ? '#1f2833' : '#fff'`, avec a chaque
  // fois une variante legerement differente. La couche semantique existe
  // maintenant, et les six themes en decoulent.
  //
  // ⚠ EN AVERTISSEMENT, PAS EN ERREUR — et c'est delibere.
  // Passer les ~2 000 occurrences en erreur rendrait le lint rouge en
  // permanence, donc inutile : un controle qu'on ignore ne controle rien. La
  // consigne d'audit etait explicite — NE PAS tout refactoriser.
  //
  // Le PLAFOND, lui, est tenu par `scripts/couleurs-en-dur.js`, qui echoue si
  // le compteur monte. Les deux se completent : l'avertissement se voit pendant
  // qu'on ecrit, le plafond bloque au moment de livrer.
  //
  // Hors perimetre : `constants/` (c'est la que les couleurs DOIVENT etre
  // ecrites), `scripts/`, et les tests.
  {
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          // Une chaine qui n'est QU'un hexadecimal : '#fff', '#1f2833',
          // '#0f141980'. Celles qui en contiennent un au milieu d'autre chose
          // (un degrade, une URL) ne sont pas visees — les traquer produirait
          // surtout du bruit.
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message:
            'Couleur ecrite en dur. Utiliser useTokens() : bg, surface, text, ' +
            'accent, border, danger… Les six themes ne peuvent pas atteindre ' +
            'une valeur figee ici — l ecran restera vert sur un theme dore.',
        },
      ],
    },
  },
]);
