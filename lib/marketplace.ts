// Marketplace UGC (petites annonces communautaires) — 100% Firestore, best-effort.
//
// MODÈLE (1 collection top-level) :
//  - `marketplace_listings` : une annonce publiée par un user (repas maison, coaching,
//     matériel, produits, service…). approved:false à la création → modération admin
//     (même pattern que sport_fields / community_routes : PAS d'auto-approbation).
//     Une fois approved==true && status=='active', l'annonce est visible dans le catalogue.
//
//  `ownerUid` = email sanitizé (emailToDocId) — même convention de clé que partout dans l'app.
//
//  PAS de paiement in-app : le détail affiche un bouton "Contacter le vendeur" (le contact
//  se fait hors app). Aucune donnée bancaire, aucune transaction.
//
// SÉCURITÉ (règles Firestore, cf. firestore.rules) :
//  - read   : annonces APPROUVÉES (tout connecté) OU les SIENNES (tout statut).
//  - create : seulement au nom de l'auteur (ownerUid == uid) ET approved forcé à false
//             ET status forcé à 'active' → impossible de s'auto-approuver.
//  - update : STRICTEMENT borné au propriétaire (resource.data.ownerUid == uid) — sert à
//             markSold/removeListing (le vendeur change son propre statut). La modération
//             (approved) passe par l'admin (firebase-admin SDK, qui bypass les règles).
//  - delete : réservé au propriétaire.
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  serverTimestamp,
  limit as fsLimit,
} from 'firebase/firestore';
import { db, emailToDocId } from './firebase';

const norm = (e: string) => (e || '').trim().toLowerCase();

export type ListingCategory =
  | 'meal'
  | 'coaching'
  | 'gear'
  | 'produce'
  | 'service'
  | 'other';

export const LISTING_CATEGORIES: ListingCategory[] = [
  'meal', 'coaching', 'gear', 'produce', 'service', 'other',
];

export type ListingStatus = 'active' | 'sold' | 'removed';

export interface MarketplaceListing {
  id: string;
  ownerUid: string;        // = email sanitizé (emailToDocId)
  title: string;
  description: string;
  category: ListingCategory;
  price: number;           // en MAD
  currency: 'MAD';
  placeName?: string;
  imageUrl?: string;       // data URI (base64) ou URL — optionnel
  approved: boolean;       // false à la création → modération admin
  status: ListingStatus;
  createdTs: number;
}

// ---- helpers de sanitisation -------------------------------------------------

const sanitizeCategory = (c?: string): ListingCategory =>
  (LISTING_CATEGORIES as string[]).includes(c || '') ? (c as ListingCategory) : 'other';

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function normalizeListing(id: string, d: any): MarketplaceListing {
  return {
    id,
    ownerUid: d?.ownerUid || '',
    title: d?.title || '',
    description: d?.description || '',
    category: sanitizeCategory(d?.category),
    price: num(d?.price),
    currency: 'MAD',
    placeName: d?.placeName || undefined,
    imageUrl: d?.imageUrl || undefined,
    approved: d?.approved === true,
    status: (['active', 'sold', 'removed'] as string[]).includes(d?.status) ? d.status : 'active',
    createdTs: num(d?.createdTs) || 0,
  };
}

// =============================================================================
// CRÉATION
// =============================================================================

/**
 * Publie une annonce (approved:false → modération admin ; status:'active').
 * L'annonce n'est visible du public qu'une fois approuvée par un admin.
 * Best-effort : renvoie l'id créé ou null (jamais de crash).
 */
export async function createListing(
  email: string,
  input: {
    title: string;
    description?: string;
    category?: ListingCategory | string;
    price?: number;
    placeName?: string;
    imageUrl?: string;
  }
): Promise<string | null> {
  const uid = emailToDocId(norm(email));
  const title = (input?.title || '').trim().slice(0, 120);
  if (!uid || !title) return null;
  try {
    const payload: any = {
      ownerUid: uid,
      title,
      description: (input.description || '').trim().slice(0, 2000),
      category: sanitizeCategory(String(input.category)),
      price: num(input?.price),
      currency: 'MAD',
      placeName: (input.placeName || '').trim().slice(0, 120) || undefined,
      imageUrl: input.imageUrl || undefined,
      approved: false, // modération admin — pas d'auto-approbation
      status: 'active',
      createdTs: Date.now(),
      createdAt: serverTimestamp(),
    };
    // Firestore refuse `undefined` → on nettoie.
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
    const ref = await addDoc(collection(db, 'marketplace_listings'), payload);
    return ref.id;
  } catch (e) {
    console.warn('[marketplace] createListing failed', e);
    return null;
  }
}

// =============================================================================
// LECTURE
// =============================================================================

/**
 * Liste les annonces APPROUVÉES et ACTIVES (catalogue public). `category` filtre côté
 * client. Tri client par date de création décroissante (plus récent d'abord).
 * Best-effort → [] si erreur.
 */
export async function listListings(
  opts: { category?: ListingCategory | string } = {}
): Promise<MarketplaceListing[]> {
  try {
    const ref = collection(db, 'marketplace_listings');
    // where seul (pas d'orderBy) → évite d'exiger un index composite ; tri client.
    const q = query(ref, where('approved', '==', true), where('status', '==', 'active'), fsLimit(100));
    const snap = await getDocs(q);
    let rows = snap.docs.map((d) => normalizeListing(d.id, d.data()));
    if (opts.category) {
      const want = sanitizeCategory(String(opts.category));
      rows = rows.filter((l) => l.category === want);
    }
    rows.sort((a, b) => b.createdTs - a.createdTs);
    return rows;
  } catch (e) {
    console.warn('[marketplace] listListings failed', e);
    return [];
  }
}

/**
 * Mes annonces (tout statut : active/sold/removed) — pour le suivi de modération et la
 * gestion (marquer vendu / retirer). Tri client par date décroissante. Best-effort → [].
 */
export async function myListings(email: string): Promise<MarketplaceListing[]> {
  const uid = emailToDocId(norm(email));
  if (!uid) return [];
  try {
    const ref = collection(db, 'marketplace_listings');
    const q = query(ref, where('ownerUid', '==', uid), fsLimit(100));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => normalizeListing(d.id, d.data()));
    rows.sort((a, b) => b.createdTs - a.createdTs);
    return rows;
  } catch (e) {
    console.warn('[marketplace] myListings failed', e);
    return [];
  }
}

/** Lit une annonce par id (best-effort). Renvoie null si absente/erreur. */
export async function getListing(id: string): Promise<MarketplaceListing | null> {
  const clean = (id || '').trim();
  if (!clean) return null;
  try {
    const snap = await getDoc(doc(db, 'marketplace_listings', clean));
    if (!snap.exists()) return null;
    return normalizeListing(snap.id, snap.data());
  } catch (e) {
    console.warn('[marketplace] getListing failed', e);
    return null;
  }
}

// =============================================================================
// GESTION (propriétaire uniquement)
// =============================================================================

/**
 * Marque une annonce comme VENDUE — RÉSERVÉ au propriétaire (vérifié côté client ET
 * côté règles Firestore). Best-effort. Renvoie { ok, reason? }.
 */
export async function markSold(
  email: string,
  id: string
): Promise<{ ok: boolean; reason?: 'empty' | 'notfound' | 'forbidden' | 'error' }> {
  const uid = emailToDocId(norm(email));
  const clean = (id || '').trim();
  if (!uid || !clean) return { ok: false, reason: 'empty' };
  try {
    const ref = doc(db, 'marketplace_listings', clean);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, reason: 'notfound' };
    if ((snap.data() as any)?.ownerUid !== uid) return { ok: false, reason: 'forbidden' };
    await setDoc(ref, { status: 'sold', updatedAt: serverTimestamp() }, { merge: true });
    return { ok: true };
  } catch (e) {
    console.warn('[marketplace] markSold failed', e);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Retire une annonce du catalogue (status:'removed') — RÉSERVÉ au propriétaire.
 * On ne supprime PAS le doc (traçabilité) ; il sort simplement du catalogue public.
 * Best-effort. Renvoie { ok, reason? }.
 */
export async function removeListing(
  email: string,
  id: string
): Promise<{ ok: boolean; reason?: 'empty' | 'notfound' | 'forbidden' | 'error' }> {
  const uid = emailToDocId(norm(email));
  const clean = (id || '').trim();
  if (!uid || !clean) return { ok: false, reason: 'empty' };
  try {
    const ref = doc(db, 'marketplace_listings', clean);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, reason: 'notfound' };
    if ((snap.data() as any)?.ownerUid !== uid) return { ok: false, reason: 'forbidden' };
    await setDoc(ref, { status: 'removed', updatedAt: serverTimestamp() }, { merge: true });
    return { ok: true };
  } catch (e) {
    console.warn('[marketplace] removeListing failed', e);
    return { ok: false, reason: 'error' };
  }
}
