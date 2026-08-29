// Les regles Firestore, mises a l'epreuve contre le moteur reel.
// ---------------------------------------------------------------------------
// POURQUOI CE FICHIER EXISTE
// Le 24/08/2026, un joker `{document=**}` couvrait AUSSI le document parent
// `users/{uid}`. Firestore autorise des qu'UNE regle autorise : ce joker
// annulait donc les cinq garde-fous ecrits juste au-dessus, et n'importe qui
// pouvait s'accorder le Premium en une ecriture sur son propre document.
//
// Les garde-fous etaient sinceres, lisibles, commentes — et morts depuis le jour
// de leur ecriture. Rien dans le code ne le disait. Seul le MOTEUR pouvait le
// dire, et personne ne le lui demandait.
//
// C'est tout l'objet de ce fichier : ne plus jamais croire une regle sur parole.
//
// Lancement :  npm run test:regles
//   (firebase emulators:exec demarre l'emulateur, charge firestore.rules, et
//    execute ce script contre lui.)

const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection } = require('firebase/firestore');
const fs = require('fs');

const ALICE = 'alice_at_exemple_com';
const BOB = 'bob_at_exemple_com';

let env;
let echecs = 0;
let reussites = 0;

/** Un cas nomme. On journalise, on n'interrompt pas : le rapport complet vaut
 *  mieux que le premier echec, quand on juge un jeu de regles entier. */
async function cas(nom, fn) {
  try {
    await fn();
    reussites++;
    console.log('  ok    ' + nom);
  } catch (e) {
    echecs++;
    console.log('  ECHEC ' + nom);
    console.log('        ' + String(e.message || e).split('\n')[0].slice(0, 160));
  }
}

/** Pose un document en CONTOURNANT les regles : c'est l'etat de depart, pas
 *  l'objet du test. */
const semer = (chemin, donnees) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), chemin), donnees));

async function main() {
  env = await initializeTestEnvironment({
    projectId: 'salorie-regles',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 },
  });

  const alice = env.authenticatedContext(ALICE).firestore();
  const bob = env.authenticatedContext(BOB).firestore();
  const anonyme = env.unauthenticatedContext().firestore();

  // ── LE DOCUMENT UTILISATEUR : PII ET SANTE ───────────────────────────────
  await semer('users/' + ALICE, { email: 'alice@exemple.com', poids: 72, premiumOverride: false });

  await cas('un tiers ne lit pas le document utilisateur d autrui', () =>
    assertFails(getDoc(doc(bob, 'users/' + ALICE))));

  await cas('le proprietaire lit le sien', () =>
    assertSucceeds(getDoc(doc(alice, 'users/' + ALICE))));

  // ⚠ LE CAS QUI ETAIT MORT. Sans lui, la regression repasse inapercue.
  await cas('on ne s accorde PAS le Premium sur son propre document', () =>
    assertFails(updateDoc(doc(alice, 'users/' + ALICE), { premiumOverride: true })));

  await cas('on ne s accorde PAS un essai Premium', () =>
    assertFails(updateDoc(doc(alice, 'users/' + ALICE), { premiumTrialUntil: 9e12 })));

  await cas('on ne se fabrique PAS un abonnement', () =>
    assertFails(updateDoc(doc(alice, 'users/' + ALICE), { subscription: 'annual' })));

  await cas('on ne gonfle PAS son compteur de parrainage', () =>
    assertFails(updateDoc(doc(alice, 'users/' + ALICE), { referralCount: 999 })));

  await cas('mais on modifie bien ses propres donnees', () =>
    assertSucceeds(updateDoc(doc(alice, 'users/' + ALICE), { poids: 71 })));

  // ── L AMITIE SE DEMANDE ──────────────────────────────────────────────────
  await cas('un tiers SONNE : il s ajoute aux demandes, et rien de plus', () =>
    assertSucceeds(updateDoc(doc(bob, 'users/' + ALICE), { friend_requests: [BOB] })));

  await cas('un tiers ne fait pas sonner QUELQU UN D AUTRE', () =>
    assertFails(updateDoc(doc(bob, 'users/' + ALICE), { friend_requests: [BOB, 'carole'] })));

  // Sans invitation prealable d'Alice, Bob ne devient pas son ami.
  await cas('un tiers ne s ajoute PAS aux amis sans invitation', () =>
    assertFails(updateDoc(doc(bob, 'users/' + ALICE), { friends: [BOB] })));

  // Avec l'invitation d'Alice, il le peut : le consentement des DEUX cotes.
  await semer('users/' + ALICE, {
    email: 'alice@exemple.com', premiumOverride: false, friends: [], friend_pending: [BOB],
  });
  await cas('un invite ACCEPTE et rejoint les amis', () =>
    assertSucceeds(updateDoc(doc(bob, 'users/' + ALICE), { friends: [BOB] })));

  // ── LES SECRETS ──────────────────────────────────────────────────────────
  await semer('secrets/llm', { cle: 'sk-interdite' });
  await cas('les cles des providers sont illisibles, meme connecte', () =>
    assertFails(getDoc(doc(alice, 'secrets/llm'))));

  // ── LES JETONS STRAVA ────────────────────────────────────────────────────
  // Un `refresh_token` Strava vaut un acces permanent au compte sportif. Meme
  // le proprietaire n'a aucune raison de le lire depuis l'app : seul le serveur
  // s'en sert. Un doc lisible, et le trousseau part avec tout ce qui peut lire
  // le Firestore du telephone.
  await semer('strava_tokens/' + ALICE, { refresh_token: 'r-interdit' });
  await cas('nul ne lit ses propres jetons Strava, pas meme leur proprietaire', () =>
    assertFails(getDoc(doc(alice, 'strava_tokens/' + ALICE))));
  await cas('nul n ecrit dans les jetons Strava', () =>
    assertFails(setDoc(doc(alice, 'strava_tokens/' + ALICE), { refresh_token: 'x' })));

  // ── LE CLASSEMENT HEBDOMADAIRE ───────────────────────────────────────────
  await semer('leagues/S35/members/' + ALICE, { uid: ALICE, xp: 100 });
  await cas('l XP ne se fixe pas a une valeur arbitraire', () =>
    assertFails(updateDoc(doc(alice, 'leagues/S35/members/' + ALICE), { uid: ALICE, xp: 999999 })));
  await cas('l XP ne DIMINUE pas', () =>
    assertFails(updateDoc(doc(alice, 'leagues/S35/members/' + ALICE), { uid: ALICE, xp: 50 })));
  await cas('un increment normal passe', () =>
    assertSucceeds(updateDoc(doc(alice, 'leagues/S35/members/' + ALICE), { uid: ALICE, xp: 350 })));
  await cas('on n ecrit pas la ligne d un autre joueur', () =>
    assertFails(setDoc(doc(bob, 'leagues/S35/members/' + ALICE), { uid: ALICE, xp: 5 })));

  // ── LES ANNONCES : PAS D AUTO-APPROBATION ────────────────────────────────
  await cas('une annonce ne nait pas approuvee', () =>
    assertFails(setDoc(doc(alice, 'marketplace_listings/a1'), {
      ownerUid: ALICE, approved: true, status: 'active',
    })));
  await cas('une annonce nait en attente', () =>
    assertSucceeds(setDoc(doc(alice, 'marketplace_listings/a2'), {
      ownerUid: ALICE, approved: false, status: 'active',
    })));
  await cas('le proprietaire ne s auto-approuve pas apres coup', () =>
    assertFails(updateDoc(doc(alice, 'marketplace_listings/a2'), { approved: true })));

  // ── LE PARRAINAGE : +1, PAS DAVANTAGE ────────────────────────────────────
  await semer('referrals/CODE1', { ownerUid: ALICE, count: 0 });
  await cas('le filleul incremente de UN', () =>
    assertSucceeds(updateDoc(doc(bob, 'referrals/CODE1'), { count: 1 })));
  await cas('le filleul ne saute pas a cent', () =>
    assertFails(updateDoc(doc(bob, 'referrals/CODE1'), { count: 100 })));
  await cas('personne ne prend le controle d un code', () =>
    assertFails(updateDoc(doc(bob, 'referrals/CODE1'), { ownerUid: BOB })));

  // ── LES PARCOURS COMMUNAUTAIRES ──────────────────────────────────────────
  await cas('un parcours ne nait pas approuve', () =>
    assertFails(setDoc(doc(alice, 'community_routes/r1'), {
      authorId: ALICE, status: 'approved',
    })));
  await cas('un parcours nait en attente', () =>
    assertSucceeds(setDoc(doc(alice, 'community_routes/r2'), {
      authorId: ALICE, status: 'pending',
    })));

  // ── LES SIGNALEMENTS : ON DEPOSE, ON NE RELIT PAS ────────────────────────
  await cas('on signale en son propre nom', () =>
    assertSucceeds(setDoc(doc(alice, 'reports/s1'), {
      reporterId: ALICE, targetType: 'listing', targetId: 'a2',
    })));
  await cas('on ne signale pas au nom d un autre', () =>
    assertFails(setDoc(doc(bob, 'reports/s2'), {
      reporterId: ALICE, targetType: 'listing', targetId: 'a2',
    })));
  await cas('un signalement depose est illisible au client', () =>
    assertFails(getDoc(doc(alice, 'reports/s1'))));

  // ── L ANONYME N ENTRE NULLE PART ─────────────────────────────────────────
  await cas('un non-connecte ne lit pas les profils publics', () =>
    assertFails(getDoc(doc(anonyme, 'public_profiles/' + ALICE))));
  await cas('un non-connecte n ecrit pas', () =>
    assertFails(setDoc(doc(anonyme, 'users/' + BOB), { email: 'x' })));

  await env.cleanup();

  console.log('');
  console.log('  ' + reussites + ' conformes, ' + echecs + ' non conformes');
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
