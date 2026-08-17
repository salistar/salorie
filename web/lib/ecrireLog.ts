// Écriture dans `users/{uid}/logs` depuis le web.
// ---------------------------------------------------------------------------
// Jusqu'ici le web LISAIT le journal (`useJournal`) sans jamais y écrire : tout
// ce qui s'ajoutait venait du téléphone. Quatre écrans de ce lot ont besoin
// d'écrire — saisie manuelle, détail d'un aliment, eau, hydratation.
//
// Ils passent tous par ici, et pas chacun par son propre `addDoc`, pour une
// raison précise : le mobile lit ces mêmes documents. Un champ mal nommé ou une
// date au mauvais format ne casse rien à l'écriture — la ligne apparaît sur le
// web — mais elle devient invisible ou fausse sur le téléphone. Un seul point
// d'écriture, c'est un seul endroit où cette correspondance peut se vérifier.
import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore';
import { firestore } from './firebaseClient';
import { jourLocal } from './useFirestoreMe';

/** Les trois seuls types que le mobile sait interpréter. */
export type TypeLog = 'meal' | 'activity' | 'water';

/** Créneaux du Diary mobile. Une valeur hors de cette liste range le repas nulle part. */
export type Creneau = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface NouveauLog {
  type: TypeLog;
  name: string;
  /** kcal pour meal/activity — MILLILITRES pour water (voir plus bas). */
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  slot?: Creneau;
  intensity?: string;
  /** Jour visé, au format `YYYY-MM-DD`. Par défaut aujourd'hui, en heure LOCALE. */
  date?: string;
}

const nombre = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * Ajoute une ligne au journal.
 *
 * ⚠ Pour `type: 'water'`, la quantité en millilitres se met dans `calories`.
 * C'est contre-intuitif, mais c'est ce que fait le mobile et ce que lit
 * `totaux()` (`eauMl` additionne `calories` des lignes `water`). Utiliser un
 * champ `ml` séparé donnerait un verre d'eau que le web afficherait et que le
 * téléphone compterait pour zéro.
 */
export async function ajouterLog(uid: string, log: NouveauLog): Promise<string | null> {
  if (!uid || !log?.type || !log?.name?.trim()) return null;
  const ligne: Record<string, any> = {
    date: log.date || jourLocal(),
    type: log.type,
    name: log.name.trim().slice(0, 120),
    calories: nombre(log.calories),
    // `timestamp` sert au tri à l'intérieur d'une journée. Le mobile l'écrit en
    // millisecondes ; un `serverTimestamp()` ici donnerait un objet Firestore
    // que son tri numérique ne saurait pas comparer.
    timestamp: Date.now(),
  };
  if (log.type === 'meal') {
    ligne.protein = nombre(log.protein);
    ligne.carbs = nombre(log.carbs);
    ligne.fat = nombre(log.fat);
    if (log.slot) ligne.slot = log.slot;
  }
  if (log.type === 'activity' && log.intensity) ligne.intensity = log.intensity;

  const ref = await addDoc(collection(firestore(), 'users', uid, 'logs'), ligne);
  return ref.id;
}

/** Supprime une ligne. Le journal est un registre du jour : on doit pouvoir
 *  corriger une saisie fausse, pas seulement en empiler une autre. */
export async function supprimerLog(uid: string, id: string): Promise<void> {
  if (!uid || !id) return;
  await deleteDoc(doc(firestore(), 'users', uid, 'logs', id));
}

/** Raccourci pour l'eau, avec le piège du champ `calories` déjà refermé. */
export function ajouterEau(uid: string, ml: number, nom = 'Eau') {
  return ajouterLog(uid, { type: 'water', name: nom, calories: nombre(ml) });
}
