import { doc, setDoc, getDoc } from 'firebase/firestore';
import { firestore } from './firebaseClient';

/**
 * Rendre un compte trouvable comme ami, même s'il n'a jamais ouvert l'app mobile.
 *
 * ## Le trou que ça bouche
 *
 * `addFriend` refuse d'ajouter quelqu'un dont le PROFIL PUBLIC n'existe pas — et
 * c'est volontaire : sans cette règle, on pourrait ajouter n'importe quelle
 * adresse e-mail et découvrir, par le message d'erreur, si elle a un compte.
 *
 * Mais ce profil n'était créé que par `publishStats`, appelé depuis deux écrans
 * de l'app MOBILE. Quelqu'un qui n'utilise que l'espace web restait donc
 * introuvable, et son ami lisait « aucun compte Salorie avec cette adresse » —
 * un message faux, et impossible à comprendre.
 *
 * ## Ce qu'on écrit, et ce qu'on n'écrit pas
 *
 * Le strict nécessaire pour qu'une recherche d'ami aboutisse : un nom
 * d'affichage. Aucune donnée de santé, aucun repas, aucun poids. Le profil
 * public est lisible par d'autres comptes — c'est tout son intérêt, et c'est
 * exactement pourquoi il ne doit contenir que ça.
 *
 * On n'écrase jamais un profil existant : l'app mobile y met des statistiques
 * (série, jours suivis) que le web ne connaît pas et effacerait.
 */
export async function assurerProfilPublic(docId: string, nom: string): Promise<void> {
  if (!docId) return;
  try {
    const ref = doc(firestore(), 'public_profiles', docId);
    const existant = await getDoc(ref);
    if (existant.exists()) return;
    await setDoc(
      ref,
      { name: String(nom || docId.split('@')[0]).slice(0, 40), createdAt: Date.now() },
      { merge: true },
    );
  } catch {
    // Best-effort : ne jamais bloquer l'ouverture de l'espace web pour ça. Au
    // pire, le compte reste introuvable comme ami — l'état d'avant.
  }
}
