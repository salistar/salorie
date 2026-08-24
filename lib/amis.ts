import { doc, getDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, emailToDocId } from './firebase';
import { readPublicProfile } from './publicProfile';

/**
 * La liste d'amis — lire, inviter, accepter, retirer, et surtout VÉRIFIER.
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
 * ## L'amitié se DEMANDE (24/08/2026)
 *
 * Jusqu'ici, saisir une adresse suffisait à devenir l'ami de son propriétaire :
 * on s'inscrivait dans sa liste sans rien lui demander. La barrière ci-dessus
 * tenait donc une porte que le premier venu pouvait s'ouvrir en connaissant une
 * adresse e-mail. Trois états désormais :
 *
 *   `friend_pending`  chez MOI  — j'ai invité, j'attends
 *   `friend_requests` chez MOI  — on m'a invité, je décide
 *   `friends`         des DEUX côtés — le lien, et lui seul ouvre quelque chose
 *
 * Les règles Firestore n'autorisent un tiers à s'inscrire dans mon `friends` que
 * si mon `friend_pending` le nomme : le consentement des deux est exigé par la
 * base, pas seulement par cet écran.
 *
 * ## Ce que cette barrière ne fait pas
 *
 * Elle vit côté client, donc elle protège l'usage normal, pas un attaquant
 * déterminé qui parlerait au socket directement. La vraie barrière est côté
 * serveur (`backend/src/social/amis.ts`, réciprocité exigée) — et elle existe.
 */

const norm = (e: string) => String(e || '').trim().toLowerCase();

export type Ami = { email: string; nom: string };

/** Les trois listes du document, normalisées et dédoublonnées. */
async function listes(monEmail: string): Promise<{
  amis: string[];
  demandes: string[];
  invitations: string[];
}> {
  try {
    const d = (await getDoc(doc(db, 'users', emailToDocId(norm(monEmail))))).data() || {};
    // Dédoublonné et normalisé : un même compte a pu être ajouté deux fois avec
    // des casses différentes, et il apparaîtrait alors deux fois dans la liste.
    const u = (v: unknown) => [...new Set(((v as string[]) || []).map(norm).filter(Boolean))];
    const amis = u(d.friends);
    return {
      amis,
      // Une demande de quelqu'un qui est DÉJÀ mon ami n'a plus lieu d'être
      // affichée — cela arrive quand deux personnes s'invitent en même temps.
      demandes: u(d.friend_requests).filter((e) => !amis.includes(e)),
      invitations: u(d.friend_pending).filter((e) => !amis.includes(e)),
    };
  } catch {
    return { amis: [], demandes: [], invitations: [] };
  }
}

/** Les e-mails de mes amis. Tableau vide si le compte n'a pas de doc. */
export async function listerEmailsAmis(monEmail: string): Promise<string[]> {
  return (await listes(monEmail)).amis;
}

/**
 * Le nom d'affichage vient du profil PUBLIC : le document privé d'autrui n'est
 * pas lisible, et c'est voulu. Quelqu'un dont le profil public n'existe pas
 * encore garde la partie gauche de son e-mail — mieux qu'une ligne vide.
 */
async function nommer(emails: string[]): Promise<Ami[]> {
  const gens = await Promise.all(
    emails.map(async (email) => {
      try {
        const p = await readPublicProfile(emailToDocId(email));
        return { email, nom: p?.name || email.split('@')[0] };
      } catch {
        return { email, nom: email.split('@')[0] };
      }
    }),
  );
  return gens.sort((a, b) => a.nom.localeCompare(b.nom));
}

/** Mes amis avec leur nom d'affichage. */
export async function listerAmis(monEmail: string): Promise<Ami[]> {
  return nommer((await listes(monEmail)).amis);
}

/** Les demandes reçues : ces gens attendent ma réponse. */
export async function listerDemandes(monEmail: string): Promise<Ami[]> {
  return nommer((await listes(monEmail)).demandes);
}

/** Les invitations que j'ai envoyées et qui n'ont pas encore été acceptées. */
export async function listerInvitations(monEmail: string): Promise<Ami[]> {
  return nommer((await listes(monEmail)).invitations);
}

/**
 * Les trois listes en UNE lecture du document.
 *
 * Les appeler séparément relirait trois fois le même document à chaque ouverture
 * de l'écran — trois fois le trajet réseau, pour des données identiques.
 */
export async function listerTout(monEmail: string): Promise<{
  amis: Ami[];
  demandes: Ami[];
  invitations: Ami[];
}> {
  const l = await listes(monEmail);
  const [amis, demandes, invitations] = await Promise.all([
    nommer(l.amis),
    nommer(l.demandes),
    nommer(l.invitations),
  ]);
  return { amis, demandes, invitations };
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
 * Accepter une demande.
 *
 * L'écriture chez l'AUTRE d'abord : si elle échoue — invitation annulée entre
 * temps — la demande reste dans ma liste et je peux réessayer. L'ordre inverse
 * effacerait la demande sans jamais créer le lien.
 */
export async function accepterDemande(
  monEmail: string,
  demandeurEmail: string,
): Promise<{ ok: boolean; motif?: 'invalide' | 'erreur' }> {
  const moi = norm(monEmail);
  const lui = norm(demandeurEmail);
  if (!moi || !lui || moi === lui) return { ok: false, motif: 'invalide' };
  try {
    await setDoc(doc(db, 'users', emailToDocId(lui)), { friends: arrayUnion(moi) }, { merge: true });
    await setDoc(
      doc(db, 'users', emailToDocId(moi)),
      { friends: arrayUnion(lui), friend_requests: arrayRemove(lui) },
      { merge: true },
    );
    return { ok: true };
  } catch (e) {
    console.warn('[amis] acceptation impossible', e);
    return { ok: false, motif: 'erreur' };
  }
}

/** Refuser une demande : elle disparaît de chez moi, sans rien annoncer. */
export async function refuserDemande(
  monEmail: string,
  demandeurEmail: string,
): Promise<{ ok: boolean; motif?: 'invalide' | 'erreur' }> {
  const moi = norm(monEmail);
  const lui = norm(demandeurEmail);
  if (!moi || !lui) return { ok: false, motif: 'invalide' };
  try {
    await setDoc(
      doc(db, 'users', emailToDocId(moi)),
      { friend_requests: arrayRemove(lui) },
      { merge: true },
    );
    return { ok: true };
  } catch (e) {
    console.warn('[amis] refus impossible', e);
    return { ok: false, motif: 'erreur' };
  }
}

/**
 * Annuler une invitation que j'ai envoyée.
 *
 * Les deux côtés, et les deux comptent : sans mon `friend_pending`, la personne
 * ne PEUT plus s'inscrire dans mes amis (c'est la règle Firestore qui le lui
 * interdit) ; sans sa `friend_requests`, elle ne voit plus une invitation qui ne
 * mènerait nulle part.
 */
export async function annulerInvitation(
  monEmail: string,
  cibleEmail: string,
): Promise<{ ok: boolean; motif?: 'invalide' | 'erreur' }> {
  const moi = norm(monEmail);
  const cible = norm(cibleEmail);
  if (!moi || !cible) return { ok: false, motif: 'invalide' };
  try {
    await setDoc(
      doc(db, 'users', emailToDocId(moi)),
      { friend_pending: arrayRemove(cible) },
      { merge: true },
    );
    await setDoc(
      doc(db, 'users', emailToDocId(cible)),
      { friend_requests: arrayRemove(moi) },
      { merge: true },
    );
    return { ok: true };
  } catch (e) {
    console.warn('[amis] annulation impossible', e);
    return { ok: false, motif: 'erreur' };
  }
}

/**
 * Retirer un ami.
 *
 * MON document, et lui seul.
 *
 * L'ancienne version écrivait aussi chez l'autre pour « rompre des deux côtés ».
 * Or les règles Firestore interdisent — à raison — de retirer quoi que ce soit
 * dans le document de quelqu'un d'autre : cette seconde écriture était REFUSÉE à
 * chaque fois, l'exception tombait dans le `catch`, et la fonction rendait
 * `{ ok: false }` alors que le retrait venait de réussir. L'écran affichait donc
 * une erreur à chaque suppression.
 *
 * Ce qui rompt vraiment le lien des deux côtés, c'est la réciprocité exigée par
 * le serveur (`backend/src/social/amis.ts`) : vider ma liste suffit.
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
    // `friend_pending` aussi : sans quoi une ancienne invitation laisserait la
    // personne libre de se réinscrire dans mes amis sans me redemander.
    await setDoc(
      doc(db, 'users', emailToDocId(moi)),
      { friends: arrayRemove(ami), friend_pending: arrayRemove(ami) },
      { merge: true },
    );
    return { ok: true };
  } catch (e) {
    console.warn('[amis] retrait impossible', e);
    return { ok: false, motif: 'erreur' };
  }
}
