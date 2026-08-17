// Recopie les modules PURS partages entre le telephone et le web.
//
// Pourquoi une copie plutot qu'un import : le contexte de build Docker du web est
// `./web`. Un import qui sort de ce dossier passe en local et echoue dans le
// conteneur — deux deploiements perdus a le decouvrir.
//
// La copie n'est pas une duplication assumee : `__tests__/partageSync.test.ts`
// compare les deux fichiers et echoue s'ils different. La source reste `lib/`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const FICHIERS = ['importParsers.ts', 'rapportSanteHtml.ts'];
const ENTETE = (f) => `// ⚠️ COPIE GENEREE — NE PAS MODIFIER ICI.
//
// La source est \`lib/${f}\` a la racine du depot. Cette copie existe
// parce que le contexte de build Docker du web est \`./web\` : un import qui sort
// de ce dossier donne « module not found » dans le conteneur, alors qu'il passe
// en local. Constate en production le 17 aout 2026, deux deploiements de suite.
//
// \`npm run sync:partage\` regenere ce fichier, et un test compare les deux :
// s'ils divergent, la suite echoue. La duplication est donc impossible a laisser
// filer, ce qui etait tout l'enjeu — surtout pour le rapport medical.
// ───── fin de l'entete generee, la source commence ici ─────
`;

mkdirSync('web/lib/partage', { recursive: true });
for (const f of FICHIERS) {
  writeFileSync(`web/lib/partage/${f}`, ENTETE(f) + readFileSync(`lib/${f}`, 'utf8'));
  console.log('sync', f);
}
