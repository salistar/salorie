// La cle RevenueCat du build est-elle une VRAIE cle de production ?
// ---------------------------------------------------------------------------
// POURQUOI CE CONTROLE EXISTE
// `PurchasesService.initialize()` refuse de configurer le SDK si la cle est
// absente ou commence par `test_`. Ce refus est SILENCIEUX pour l'utilisateur :
// l'application se lance, le bouton « s'abonner » s'affiche, et il ne se passe
// rien quand on appuie dessus. Aucune erreur, aucun message — juste un
// abonnement inachetable, decouvert par un utilisateur qui voulait payer.
//
// Le `.env` local porte legitimement une cle `test_` : le paywall doit rester
// inerte en developpement. Le danger est qu'un build de RELEASE parte avec la
// meme, ou avec rien du tout si le secret n'est pas branche.
//
// Ce script transforme une panne invisible a l'execution en un echec visible au
// build. Il ne LIT jamais la cle : il n'en regarde que le prefixe, et n'en
// affiche jamais la valeur — un journal de CI est consultable par quiconque a
// acces au depot.
//
// Usage :  node scripts/verifier-cle-achats.js
//   (attend EXPO_PUBLIC_REVENUE_CAT_API_KEY_ANDROID / _IOS dans l'environnement)

// ⚠ MEME REGLE QUE `isProductionKey` DANS lib/PurchasesService.ts.
// Elle y est reimplementee plutot qu'importee : ce script tourne sous Node nu,
// avant tout transpileur, et le fichier TypeScript tire React Native avec lui.
// Toute modification de l'une doit etre reportee dans l'autre.
const estCleProduction = (cle) => {
  if (!cle) return false;
  if (cle.startsWith('test_')) return false; // RevenueCat Test Store
  return /^(goog_|appl_|amzn_|rcb_)/.test(cle);
};

// iOS n'est pas bloquant tant qu'aucune version iOS n'est publiee : le signaler
// sans arreter la chaine evite de bloquer les builds Android pour une plateforme
// qui n'est pas encore de la partie.
const PLATEFORMES = [
  { nom: 'Android', variable: 'EXPO_PUBLIC_REVENUE_CAT_API_KEY_ANDROID', bloquant: true },
  { nom: 'iOS', variable: 'EXPO_PUBLIC_REVENUE_CAT_API_KEY_IOS', bloquant: false },
];

let bloque = false;

for (const { nom, variable, bloquant } of PLATEFORMES) {
  const cle = process.env[variable] || '';
  // Ce qu'on affiche : de quoi diagnostiquer, jamais de quoi s'authentifier.
  const forme = !cle ? 'ABSENTE'
    : cle.startsWith('test_') ? 'cle de TEST (test_…)'
    : estCleProduction(cle) ? `production (${cle.slice(0, 5)}…, ${cle.length} caracteres)`
    : `prefixe inconnu (${cle.slice(0, 5)}…)`;

  const ok = estCleProduction(cle);
  console.log(`  ${nom.padEnd(8)} ${ok ? 'OK  ' : 'NON '} ${forme}`);
  if (!ok && bloquant) bloque = true;
}

if (bloque) {
  console.error('');
  console.error('  ECHEC : le build Android partirait avec un paywall INERTE.');
  console.error('  PurchasesService refuse de configurer le SDK sans cle de production,');
  console.error('  et ce refus est invisible : le bouton « s abonner » ne fait rien.');
  console.error('');
  console.error('  Corriger le secret EXPO_PUBLIC_REVENUE_CAT_API_KEY_ANDROID dans');
  console.error('  les parametres du depot. Une cle Android de production commence');
  console.error('  par `goog_`.');
  process.exit(1);
}

console.log('\n  Le paywall sera actif dans ce build.');
