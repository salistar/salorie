// Liste de courses — locale d'abord, synchronisée ensuite.
// ---------------------------------------------------------------------------
// ## Pourquoi PAS « tout dans Firestore »
//
// Une liste de courses s'utilise dans un supermarché, c'est-à-dire à l'endroit
// exact où le réseau ne passe pas. Le SDK JS Firestore tourne ici avec un cache
// EN MÉMOIRE (`getFirestore` sans cache persistant) : une écriture faite hors
// ligne tient tant que l'app vit, et disparaît au redémarrage. Déplacer la liste
// dans Firestore la rendrait donc MOINS fiable qu'aujourd'hui, pas plus.
//
// AsyncStorage reste donc la source immédiate : instantanée, hors ligne, et elle
// survit à un redémarrage. Firestore ne sert qu'à faire circuler les
// changements entre le téléphone et le web.
//
// ## Pourquoi un document PAR ARTICLE
//
// Un seul document contenant un tableau perdrait des articles : le téléphone
// ajoute « lait », le web ajoute « pain » dans la même seconde, et le second
// écrase le premier. Un document par article laisse les deux arriver.
//
// ## Pourquoi des pierres tombales
//
// Supprimer vraiment un document laisserait un téléphone hors ligne le
// RECRÉER à la synchronisation suivante — il a l'article, le serveur ne l'a
// plus, donc il croit devoir l'envoyer. L'article supprimé revient
// indéfiniment. Un article supprimé est donc marqué `supprime: true` avec sa
// date, et n'est purgé qu'après un délai largement supérieur à toute absence
// de réseau plausible.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, emailToDocId } from './firebase';

/** Même clé qu'avant la synchronisation : les listes déjà saisies sont relues. */
export const CLE_LOCALE = 'shopping_list_v1';

/** Au-delà, une pierre tombale ne sert plus à rien : aucun appareil ne reste
 *  hors ligne trente jours avec la même liste en attente. */
export const JOURS_TOMBE = 30;

export interface ArticleCourses {
  id: string;
  name: string;
  done: boolean;
  /** Millisecondes. Arbitre les conflits : le plus récent gagne. */
  updatedAt: number;
  /** Pierre tombale. Absent ou faux = article vivant. */
  supprime?: boolean;
}

/** Normalise ce qui sort du stockage : l'ancien format n'avait ni `updatedAt`
 *  ni `supprime`, et un `updatedAt` manquant vaudrait 0 — donc perdrait
 *  systématiquement contre n'importe quelle version distante. */
export function normaliser(brut: any, secours = 0): ArticleCourses | null {
  const id = String(brut?.id ?? '').trim();
  const name = String(brut?.name ?? '').trim();
  if (!id || !name) return null;
  const u = Number(brut?.updatedAt);
  return {
    id,
    name: name.slice(0, 120),
    done: !!brut?.done,
    // Les listes d'avant la synchronisation n'ont pas de date. Leur en donner
    // une de secours (le moment de la migration) les met à égalité plutôt que
    // de les faire perdre d'office contre un article distant plus jeune.
    updatedAt: Number.isFinite(u) && u > 0 ? u : secours,
    ...(brut?.supprime ? { supprime: true } : {}),
  };
}

/**
 * Fusionne deux listes, article par article, le plus récent l'emportant.
 *
 * Fonction PURE — c'est la seule partie qui peut faire disparaître les courses
 * de quelqu'un, donc elle est testable sans Firestore ni téléphone.
 */
export function fusionner(a: ArticleCourses[], b: ArticleCourses[]): ArticleCourses[] {
  const par = new Map<string, ArticleCourses>();
  for (const x of [...a, ...b]) {
    const dedans = par.get(x.id);
    if (!dedans) {
      par.set(x.id, x);
      continue;
    }
    if (x.updatedAt > dedans.updatedAt) {
      par.set(x.id, x);
    } else if (x.updatedAt === dedans.updatedAt) {
      // Égalité stricte : une suppression l'emporte sur une modification. Faire
      // l'inverse ferait réapparaître un article qu'on vient d'enlever, ce qui
      // est plus déroutant que d'en perdre un qu'on vient de cocher.
      if (x.supprime) par.set(x.id, x);
    }
  }
  return [...par.values()];
}

/** Ce qu'on affiche : les articles vivants, les plus récents d'abord. */
export function visibles(liste: ArticleCourses[]): ArticleCourses[] {
  return liste.filter((x) => !x.supprime).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Retire les pierres tombales devenues inutiles. */
export function purger(liste: ArticleCourses[], maintenant: number): ArticleCourses[] {
  const seuil = maintenant - JOURS_TOMBE * 86400000;
  return liste.filter((x) => !x.supprime || x.updatedAt >= seuil);
}

// ── Stockage local ───────────────────────────────────────────────────────────

export async function lireLocal(secours = 0): Promise<ArticleCourses[]> {
  try {
    const brut = await AsyncStorage.getItem(CLE_LOCALE);
    if (!brut) return [];
    const l = JSON.parse(brut);
    if (!Array.isArray(l)) return [];
    return l.map((x) => normaliser(x, secours)).filter(Boolean) as ArticleCourses[];
  } catch {
    return [];
  }
}

export async function ecrireLocal(liste: ArticleCourses[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE_LOCALE, JSON.stringify(liste));
  } catch {
    // Un échec d'écriture locale ne doit pas casser l'écran : l'état en mémoire
    // reste juste, et la prochaine action réessaiera.
  }
}

// ── Synchronisation ──────────────────────────────────────────────────────────

const refListe = (uid: string) => collection(db, 'users', uid, 'shopping_list');

/** Lit la liste distante. Rend `null` si la lecture échoue — à distinguer d'une
 *  liste VIDE, qui effacerait tout si on la prenait pour la vérité. */
export async function lireDistant(email: string): Promise<ArticleCourses[] | null> {
  const uid = emailToDocId(email);
  if (!uid) return null;
  try {
    const snap = await getDocs(refListe(uid));
    return snap.docs
      .map((d) => normaliser({ ...(d.data() as any), id: d.id }))
      .filter(Boolean) as ArticleCourses[];
  } catch {
    return null;
  }
}

/** Écrit une liste complète, en un lot. */
export async function ecrireDistant(email: string, liste: ArticleCourses[]): Promise<boolean> {
  const uid = emailToDocId(email);
  if (!uid || !liste.length) return false;
  try {
    // Firestore plafonne un lot à 500 écritures ; on découpe. Une liste de
    // courses n'y arrive jamais, mais un lot refusé en bloc ferait échouer une
    // synchronisation entière pour un cas qu'on n'aurait jamais vu venir.
    for (let i = 0; i < liste.length; i += 400) {
      const lot = writeBatch(db);
      for (const x of liste.slice(i, i + 400)) {
        lot.set(doc(refListe(uid), x.id), {
          name: x.name,
          done: x.done,
          updatedAt: x.updatedAt,
          supprime: !!x.supprime,
        });
      }
      await lot.commit();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Réconcilie local et distant, puis renvoie la liste à afficher.
 *
 * Marche aussi sans compte : dans ce cas rien ne part, rien n'arrive, et la
 * liste locale est simplement rendue telle quelle.
 */
export async function synchroniser(email: string, maintenant = Date.now()): Promise<ArticleCourses[]> {
  const local = await lireLocal(maintenant);
  if (!email) return purger(local, maintenant);

  const distant = await lireDistant(email);
  // Lecture ratée : on garde le local intact. Écraser avec une liste vide
  // effacerait les courses de quelqu'un pour une simple coupure réseau.
  if (distant === null) return purger(local, maintenant);

  const fusion = purger(fusionner(local, distant), maintenant);
  await ecrireLocal(fusion);
  // On renvoie tout, y compris ce que le distant avait déjà : un `set` est
  // idempotent, et comparer article par article pour n'envoyer que les
  // différences coûterait plus de code que d'écritures économisées.
  await ecrireDistant(email, fusion);
  return fusion;
}

/** Suit les changements distants tant que l'écran est ouvert. */
export function suivreDistant(
  email: string,
  surChangement: (liste: ArticleCourses[]) => void,
): Unsubscribe | null {
  const uid = emailToDocId(email);
  if (!uid) return null;
  try {
    return onSnapshot(
      refListe(uid),
      (snap) => {
        const l = snap.docs
          .map((d) => normaliser({ ...(d.data() as any), id: d.id }))
          .filter(Boolean) as ArticleCourses[];
        surChangement(l);
      },
      () => {
        // Une écoute qui tombe laisse l'écran fonctionner en local. Le prochain
        // `synchroniser` rattrapera.
      },
    );
  } catch {
    return null;
  }
}
