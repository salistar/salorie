// Sous-collections de suivi — même contrat que `lib/tracking.ts` du mobile.
// ---------------------------------------------------------------------------
// Le mobile range plusieurs mesures dans des sous-collections construites sur
// le même patron : `users/{uid}/{sous}` avec `{...donnees, date, timestamp}`.
// C'est le cas de `body_composition`, et de tout ce que `logEntry` alimente.
//
// ⚠ Le point à ne pas manquer : `timestamp` est un `serverTimestamp()`, pas un
// nombre. `getEntries` TRIE dessus. Écrire `Date.now()` ici produirait des
// documents que Firestore compare mal aux Timestamp existants — les mesures
// saisies depuis le web se rangeraient n'importe où dans l'historique du
// téléphone, sans qu'aucune erreur ne soit levée nulle part.
import {
  addDoc, collection, deleteDoc, doc, getDocs, limit as qlimit, orderBy, query, serverTimestamp,
} from 'firebase/firestore';
import { firestore } from './firebaseClient';
import { jourLocal } from './useFirestoreMe';

/** Ajoute une mesure. `sous` est le nom de la sous-collection (`body_composition`…). */
export async function ajouterMesure(
  uid: string,
  sous: string,
  donnees: Record<string, any>,
): Promise<boolean> {
  if (!uid || !sous) return false;
  try {
    await addDoc(collection(firestore(), 'users', uid, sous), {
      ...donnees,
      date: jourLocal(),
      timestamp: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

/** Dernières mesures, de la plus récente à la plus ancienne. */
export async function lireMesures(uid: string, sous: string, max = 30): Promise<any[]> {
  if (!uid || !sous) return [];
  try {
    const snap = await getDocs(
      query(collection(firestore(), 'users', uid, sous), orderBy('timestamp', 'desc'), qlimit(max)),
    );
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch {
    return [];
  }
}

/** Supprime une mesure — une valeur fausse doit pouvoir disparaître. */
export async function supprimerMesure(uid: string, sous: string, id: string): Promise<boolean> {
  if (!uid || !sous || !id) return false;
  try {
    await deleteDoc(doc(firestore(), 'users', uid, sous, id));
    return true;
  } catch {
    return false;
  }
}
