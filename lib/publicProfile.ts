// Profils publics — collection dédiée `public_profiles/{docId}` (docId = emailToDocId(email),
// EXACTEMENT la même clé que le doc user). 100% Firestore, best-effort.
//
// POURQUOI (sécurité) : le doc `users/{docId}` contient de la PII + des données SANTÉ
// (email, goal, conditions, poids, glp1, premiumOverride…). Les règles Firestore
// verrouillent désormais sa LECTURE à son seul propriétaire. Or le social / la famille /
// les ligues / le battle ont besoin de lire quelques champs PUBLICS et NON sensibles
// d'AUTRES utilisateurs (nom, avatar, streak, flux d'activité…). On isole donc ces champs
// ici, dans une collection lisible par TOUT utilisateur connecté et écrite UNIQUEMENT par
// son propriétaire (le code écrit toujours sur SON propre docId).
//
// CONTRAT (les règles Firestore s'appuient dessus — n'y écrire QUE ces champs) :
//   name           : nom affichable
//   imageUrl       : avatar public
//   streak         : série de jours (classement social)
//   daysTracked    : nombre de jours suivis (classement social)
//   recentActivity : flux d'activités NON sensibles (type + km + heure — cf. socialFeed)
//   weeklyScore    : score d'assiduité 0-7 de la semaine (battle 1v1) — extension documentée
//   gage           : gage du perdant, texte court optionnel (battle 1v1) — extension documentée
//   updatedAt      : horodatage (ajouté automatiquement à chaque écriture)
//
// INTERDICTION FORMELLE : email, goal, conditions, poids, glp1, premiumOverride ou toute
// autre donnée privée/santé ne doivent JAMAIS être écrits ici. writePublicProfile applique
// une allowlist défensive : toute clé hors contrat est ignorée, même si un appelant la passe.
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface PublicProfile {
  name?: string;
  imageUrl?: string;
  streak?: number;
  daysTracked?: number;
  recentActivity?: any[];
  weeklyScore?: number;
  gage?: string;
  updatedAt?: number;
}

// Allowlist des clés autorisées dans un doc public (garde-fou anti-fuite PII/santé).
const ALLOWED_KEYS: (keyof PublicProfile)[] = [
  'name', 'imageUrl', 'streak', 'daysTracked', 'recentActivity', 'weeklyScore', 'gage', 'updatedAt',
];

/** Référence au doc profil public d'un user (docId = emailToDocId(email)). */
export function publicProfileRef(docId: string) {
  return doc(db, 'public_profiles', docId);
}

/**
 * Écrit (merge) un patch sur le profil public de SON propre docId, en ajoutant updatedAt.
 * Filtre défensivement toute clé hors allowlist : aucune donnée privée/santé ne peut fuiter
 * ici, même si un appelant passe un champ interdit (email, poids…). Best-effort.
 */
export async function writePublicProfile(
  docId: string,
  patch: Partial<PublicProfile>
): Promise<void> {
  if (!docId) return;
  try {
    const safe: Record<string, any> = {};
    for (const k of ALLOWED_KEYS) {
      if (k === 'updatedAt') continue; // horodatage forcé ci-dessous
      if (patch[k] !== undefined) safe[k] = patch[k];
    }
    safe.updatedAt = Date.now();
    await setDoc(publicProfileRef(docId), safe, { merge: true });
  } catch (e) {
    console.warn('[publicProfile] writePublicProfile failed', e);
  }
}

/** Lit le profil public d'un user (data ou null). Best-effort. */
export async function readPublicProfile(docId: string): Promise<any | null> {
  if (!docId) return null;
  try {
    const snap = await getDoc(publicProfileRef(docId));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('[publicProfile] readPublicProfile failed', e);
    return null;
  }
}
