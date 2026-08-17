// Écriture dans la liste de courses, côté web.
// ---------------------------------------------------------------------------
// La forme des documents était jusqu'ici inline dans `/me/courses`. Le scan de
// ticket de caisse doit y écrire aussi, et une seconde copie de cette forme
// aurait divergé : le mobile FUSIONNE ces documents champ par champ, donc un
// article écrit sans `supprime: false` ou sans `updatedAt` se comporte
// différemment à la synchronisation suivante — il peut réapparaître après
// suppression, ou perdre contre une version distante plus ancienne.
import { doc, writeBatch } from 'firebase/firestore';
import { firestore } from './firebaseClient';

/** Identifiant d'article. Le hasard suffit : deux appareils qui ajoutent en
 *  même temps doivent produire des identifiants différents, pas ordonnés. */
export const nouvelIdArticle = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/** Longueur maximale d'un nom d'article, alignée sur `/me/courses`. */
export const NOM_MAX = 120;

/** Nombre d'articles ajoutables en une fois — borne du lot Firestore. */
export const LOT_MAX = 100;

/**
 * Ajoute plusieurs articles d'un coup. Renvoie le nombre réellement écrit.
 *
 * Les noms vides ou trop longs sont écartés silencieusement plutôt que de
 * faire échouer tout le lot : un ticket de caisse mal lu contient souvent une
 * ligne parasite, et perdre les vingt autres articles pour elle serait absurde.
 */
export async function ajouterArticles(uid: string, noms: string[]): Promise<number> {
  if (!uid || !Array.isArray(noms)) return 0;
  const propres = noms
    .map((n) => String(n || '').trim())
    .filter((n) => n.length > 0 && n.length <= NOM_MAX)
    .slice(0, LOT_MAX);
  if (!propres.length) return 0;

  const lot = writeBatch(firestore());
  const maintenant = Date.now();
  propres.forEach((nom, i) => {
    lot.set(doc(firestore(), 'users', uid, 'shopping_list', nouvelIdArticle()), {
      name: nom,
      done: false,
      // Décalage d'une milliseconde par ligne : sans lui, tous les articles
      // partagent la même date et l'affichage les mélange.
      updatedAt: maintenant + i,
      // `supprime: false` EXPLICITE : la fusion mobile lit ce champ, et un
      // article sans lui serait traité comme indéterminé.
      supprime: false,
    });
  });
  await lot.commit();
  return propres.length;
}
