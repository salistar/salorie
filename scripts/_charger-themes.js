// Charge les themes depuis la SOURCE (design/themes.json) pour les scripts Node.
//
// On lit la source et non `constants/themesGeneres.ts` : ce dernier est du
// TypeScript, que Node ne sait pas exiger tel quel. Lire la source evite aussi
// de valider un fichier genere contre lui-meme — ce qui ne prouverait rien.
const fs = require('fs');
const path = require('path');

const def = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'design', 'themes.json'), 'utf8'),
);

module.exports = {
  THEMES: def.themes,
  ORDRE_THEMES: def.ordreAffichage,
};
