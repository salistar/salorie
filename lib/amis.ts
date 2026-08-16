import { doc, getDoc, setDoc, arrayRemove } from 'firebase/firestore';
import { db, emailToDocId } from './firebase';
import { readPublicProfile } from './publicProfile';

/**
 * La liste d'amis — lire, retirer, et surtout VÉRIFIER.
 *
 * `lib/social.ts` savait déjà ajouter un ami. Il manquait le reste, et le
 * manquant le plus important n'était pas la suppression : c'était de pouvoir
 * répondre à la question « ai-je le droit d'appeler cette personne ? ».
 *
 * ## Pourquoi un appel doit être réservé aux amis
 *
 * Un appel audio ou vidéo ouvre le micro et la caméra de quelqu'un, en direct.
 * Si n'importe qui peut composer n'importe quel identifiant de duo, il suffit
 * d'en deviner un pour tomber dans le salon d'inconnus — et ce sont souvent des
 * mineurs qui utilisent une app de sport. C'est aussi la première chose que Play
 * regarde sur une fonctionnalité de communication en direct.
 *
 * `sontAmis()` est donc appelée AVANT d'ouvrir le média, jamais après.
 *
 * ## Ce que cette barrière ne fait pas
 *
 * Elle vit côté client, donc elle protège l'usage normal, pas un attaquant
 * déterminé qui parlerait au socket directement. La vraie barrière serveur est à
 * poser dans `duo:join` de la passerelle — c'est écrit ici pour que personne ne
 * croie le problème réglé.
 */

const norm = (e: string) => String(e || '').trim().toLowerCase();

export type Ami = { email: string; nom: string };

/** Les e-mails de mes amis. Tableau vide si le compte n'a pas de doc. */
export async function listerEmailsAmis(monEmail: string): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, 'users', emailToDocId(norm(monEmail))));
    const bruts = (snap.data()?.friends as string[]) || [];
    // Dédoublonné et normalisé : un même compte a pu être ajouté deux fois avec
    // des casses différentes, et il apparaîtrait alors deux fois dans la liste.
    return [...new Set(bruts.map(norm).filter(Boolean))];
  } catch {
    return [];
  }
}

/**
 * Mes amis avec leur nom d'affichage.
 *
 * Le nom vient du profil PUBLIC : le document privé d'autrui n'est pas lisible,
 * et c'est voulu. Un ami dont le profil public n'existe pas encore garde la
 * partie gauche de son e-mail — mieux qu'une ligne vide.
 */
export async function listerAmis(monEmail: string): Promise<Ami[]> {
  const emails = await listerEmailsAmis(monEmail);
  const amis = await Promise.all(
    emails.map(async (email) => {
      try {
        const p = await readPublicProfile(emailToDocId(email));
        return { email, nom: p?.name || email.split('@')[0] };
      } catch {
        return { email, nom: email.split('@')[0] };
      }
    }),
  );
  return amis.sort((a, b) => a.nom.localeCompare(b.nom));
}

/**
 * Cette personne est-elle mon amie ?
 *
 * À appeler AVANT d'ouvrir un micro ou une caméra. En cas d'erreur de lecture on
 * répond FAUX : devant une incertitude, on refuse l'appel plutôt que de
 * l'autoriser. Un appel manqué se rejoue ; un appel avec un inconnu, non.
 */
export async function sontAmis(monEmail: string, autreEmail: string): Promise<boolean> {
  const autre = norm(autreEmail);
  if (!autre || autre === norm(monEmail)) return false;
  const mes = await listerEmailsAmis(monEmail);
  return mes.includes(autre);
}

/**
 * Retirer un ami, des DEUX CÔTÉS.
 *
 * Retirer d'un seul côté laisserait l'autre croire au lien, continuer à voir mon
 * activité et pouvoir m'appeler. Une rupture unilatérale qui ne rompt rien est
 * pire que pas de bouton du tout.
 *
 * `arrayRemove` plutôt qu'une réécriture du tableau : deux suppressions
 * simultanées depuis deux appareils s'écraseraient l'une l'autre, et un ami
 * supprimé réapparaîtrait.
 */
export async function retirerAmi(
  monEmail: string,
  amiEmail: string,
): Promise<{ ok: boolean; motif?: 'invalide' | 'erreur' }> {
  const moi = norm(monEmail);
  const ami = norm(amiEmail);
  if (!moi || !ami || moi === ami) return { ok: false, motif: 'invalide' };
  try {
    await setDoc(doc(db, 'users', emailToDocId(moi)), { friends: arrayRemove(ami) }, { merge: true });
    await setDoc(doc(db, 'users', emailToDocId(ami)), { friends: arrayRemove(moi) }, { merge: true });
    return { ok: true };
  } catch (e) {
    console.warn('[amis] retrait impossible', e);
    return { ok: false, motif: 'erreur' };
  }
}
