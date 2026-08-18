'use client';
// Photos de progression — envoi, liste, suppression.
// ---------------------------------------------------------------------------
// Ces photos sont des photos de corps : la donnée la plus sensible de Salorie.
// Trois décisions en découlent, et elles ne sont pas négociables au fil des
// évolutions de cet écran.
//
// 1. Le chemin est `progress_photos/{uid}/…`, et `storage.rules` n'autorise que
//    le propriétaire. Aucune exception administrateur : un compte d'admin peut
//    lire un journal alimentaire, il n'a aucune raison de voir ces images.
//
// 2. Aucune URL de téléchargement n'est CONSERVÉE nulle part. Une `downloadURL`
//    Firebase porte un jeton qui reste valable tant qu'il n'est pas révoqué :
//    la ranger dans Firestore reviendrait à fabriquer un lien permanent vers
//    une photo de corps, lisible par quiconque le récupère. Les URL sont
//    demandées à l'affichage et vivent le temps de la page.
//
// 3. L'image est compressée AVANT l'envoi. Une photo de téléphone moderne pèse
//    plusieurs mégaoctets ; 1200 px suffisent largement à comparer deux
//    silhouettes, et moins d'octets stockés, c'est moins d'octets exposés.
import {
  deleteObject, getDownloadURL, getStorage, listAll, ref, uploadBytes, type FirebaseStorage,
} from 'firebase/storage';
import { firebaseApp } from './firebaseClient';

export const LARGEUR_MAX = 1200;
export const TAILLE_MAX_OCTETS = 8 * 1024 * 1024;

/**
 * Le bucket est-il configure ?
 *
 * Verification AJOUTEE APRES COUP, et c'est la lecon : cette page a ete ecrite
 * en supposant que Firebase Storage etait actif sur le projet. Il ne l'etait
 * pas — le service n'a jamais ete initialise, et `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
 * etait vide. Sans ce garde-fou, la premiere photo envoyee echouait sur une
 * erreur interne du SDK, sans rien dire de la vraie cause.
 */
export const stockageConfigure = (): boolean =>
  Boolean((process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '').trim());

let memo: FirebaseStorage | null = null;
function stockage(): FirebaseStorage {
  if (!stockageConfigure()) throw new Error('stockage-absent');
  if (!memo) memo = getStorage(firebaseApp());
  return memo;
}

const dossier = (uid: string) => `progress_photos/${uid}`;

export interface PhotoProgression {
  /** Nom du fichier dans le dossier — sert d'identifiant. */
  nom: string;
  /** Date extraite du nom, au format `YYYY-MM-DD`. */
  date: string;
  /** URL temporaire, obtenue à l'affichage et jamais stockée. */
  url: string;
}

/**
 * Compresse une image et renvoie un blob JPEG.
 *
 * Rejette les fichiers non-image AVANT tout envoi : les règles Storage les
 * refuseraient de toute façon, mais échouer ici donne un message clair au lieu
 * d'une erreur de permission incompréhensible.
 */
export function compresser(file: File, largeurMax = LARGEUR_MAX): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('pas-une-image'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = Math.min(1, largeurMax / (img.width || largeurMax));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * ratio));
      c.height = Math.max(1, Math.round(img.height * ratio));
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('canvas-indisponible'));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('compression-echouee'))),
        'image/jpeg',
        0.8,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image-illisible')); };
    img.src = url;
  });
}

/**
 * Envoie une photo. Le nom porte la date EN PREMIER (`2026-08-17_xxxx.jpg`)
 * parce que `listAll` renvoie les fichiers dans l'ordre alphabétique : la date
 * en tête suffit à obtenir un ordre chronologique sans index ni métadonnées.
 */
export async function envoyer(uid: string, file: File, jour: string): Promise<string> {
  if (!uid) throw new Error('non-connecte');
  const blob = await compresser(file);
  if (blob.size > TAILLE_MAX_OCTETS) throw new Error('trop-lourde');
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nom = `${jour}_${suffixe}.jpg`;
  await uploadBytes(ref(stockage(), `${dossier(uid)}/${nom}`), blob, {
    contentType: 'image/jpeg',
    // `cacheControl` privé : sans lui, un proxy intermédiaire pourrait garder
    // une copie de l'image.
    cacheControl: 'private, max-age=0, no-store',
  });
  return nom;
}

/** Liste les photos, de la plus ancienne à la plus récente. */
export async function lister(uid: string): Promise<PhotoProgression[]> {
  if (!uid || !stockageConfigure()) return [];
  const res = await listAll(ref(stockage(), dossier(uid)));
  const items = res.items.slice().sort((a, b) => a.name.localeCompare(b.name));
  const sorties: PhotoProgression[] = [];
  for (const item of items) {
    try {
      sorties.push({
        nom: item.name,
        date: item.name.slice(0, 10),
        url: await getDownloadURL(item),
      });
    } catch {
      // Une photo illisible ne doit pas faire disparaitre les autres.
    }
  }
  return sorties;
}

export async function supprimer(uid: string, nom: string): Promise<void> {
  if (!uid || !nom) return;
  await deleteObject(ref(stockage(), `${dossier(uid)}/${nom}`));
}
