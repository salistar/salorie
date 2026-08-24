// L'amitié, telle que le SERVEUR la constate.
// ---------------------------------------------------------------------------
// Une seule définition, lue par le mur comme par les appels du duo : on est amis
// quand CHACUN a l'autre dans sa liste. Deux raisons de l'exiger des deux côtés.
//
// 1. Le consentement. Les règles Firestore n'autorisent un tiers à s'inscrire
//    dans votre `friends` que si vous l'avez invité — mais chacun reste libre
//    d'écrire ce qu'il veut dans SA PROPRE liste. Sans la réciprocité, il
//    suffirait de s'ajouter quelqu'un pour voir son mur.
//
// 2. Le retrait. Retirer un ami ne modifie que sa propre liste : les règles
//    interdisent — à raison — d'aller effacer quoi que ce soit chez autrui.
//    Tant que le serveur se contentait d'UNE liste, celui qui vous avait retiré
//    restait votre ami de son côté. La réciprocité fait que le retrait vaut
//    immédiatement pour les deux.
//
// En cas d'erreur de lecture, tout ici répond « pas amis » / liste vide. On
// montre moins, jamais plus, quand on n'est pas sûr.
import type * as admin from 'firebase-admin';

type Base = admin.firestore.Firestore;

/**
 * `emailToDocId` côté app est `trim().toLowerCase()`, et RIEN d'autre — vérifié
 * dans `lib/firebase.ts`. Une transformation inventée lirait un document
 * inexistant, donc une liste vide, donc un refus de tout : une panne totale qui
 * aurait l'air d'une sécurité qui marche.
 */
export const idDoc = (x: unknown) => String(x ?? '').trim().toLowerCase();

const listeAmis = (snap: admin.firestore.DocumentSnapshot | undefined): string[] =>
  ((snap?.data()?.friends as string[]) || []).map(idDoc).filter(Boolean);

/** Ces deux comptes se reconnaissent-ils mutuellement comme amis ? */
export async function sontAmis(base: Base, a: unknown, b: unknown): Promise<boolean> {
  const x = idDoc(a);
  const y = idDoc(b);
  if (!x || !y || x === y) return false;
  const [da, db] = await base.getAll(
    base.collection('users').doc(x),
    base.collection('users').doc(y),
  );
  return listeAmis(da).includes(y) && listeAmis(db).includes(x);
}

/** Les amis confirmés de `uid` — ceux qui l'ont aussi dans leur liste. */
export async function amisConfirmes(base: Base, uid: unknown): Promise<string[]> {
  const moi = idDoc(uid);
  if (!moi) return [];
  const snap = await base.collection('users').doc(moi).get();
  const declares = [...new Set(listeAmis(snap))].filter((e) => e !== moi);
  if (declares.length === 0) return [];
  // UN seul aller-retour pour les N documents. Une boucle de `get()` ferait
  // grimper le temps du mur avec le nombre d'amis, et ce chemin est sur le
  // rendu de la page.
  const docs = await base.getAll(...declares.map((e) => base.collection('users').doc(e)));
  return declares.filter((_, i) => listeAmis(docs[i]).includes(moi));
}
