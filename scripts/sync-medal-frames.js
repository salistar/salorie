// Source de vérité du générateur de médailles = lib/medalFrames.ts.
// Le build Docker du web ne voit que web/ → on copie (au lieu de dupliquer à la main).
// Usage : npm run sync:medals  (à lancer après toute modif de lib/medalFrames.ts)
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'lib', 'medalFrames.ts');
const dst = path.join(__dirname, '..', 'web', 'lib', 'medalFrames.ts');
const banner = '// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer ici. Source : lib/medalFrames.ts (npm run sync:medals)\n';
fs.writeFileSync(dst, banner + fs.readFileSync(src, 'utf8'));
console.log('✅ web/lib/medalFrames.ts synchronisé depuis lib/medalFrames.ts');
