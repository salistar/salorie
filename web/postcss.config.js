// PostCSS — arrive avec la fusion de la landing (20/08/2026).
// Tailwind v4 n'emet que les utilitaires UTILISES, et sa feuille n'est
// importee que par app/(landing)/layout.tsx : son reset (preflight) ne
// s'applique donc que sur les pages publiques, jamais sur /admin ni /me.
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
