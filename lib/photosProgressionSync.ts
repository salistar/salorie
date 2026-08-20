// Photos de progression — synchronisation vers Firebase Storage.
// ---------------------------------------------------------------------------
// Miroir exact de `web/lib/photosProgression.ts` : MÊME chemin
// (`progress_photos/{uid}/…`), MÊME convention de nom (`YYYY-MM-DD_xxxxxx.jpg`),
// MÊMES règles de sécurité. C'est ce qui fait que le téléphone et le navigateur
// voient la même galerie.
//
// ⚠ Ce fichier change une PROMESSE faite aux gens. Le sous-titre de l'écran
// disait « stockée sur ton appareil, privée ». À partir du moment où une photo
// part vers un serveur, cette phrase devient fausse, et l'écran doit le dire.
//
// D'où le choix central ici : les photos DÉJÀ prises ne sont PAS téléversées
// automatiquement. Elles ont été prises sous l'ancienne promesse ; les envoyer
// en silence sur un serveur reviendrait à trahir rétroactivement ce qu'on avait
// annoncé. Elles restent locales jusqu'à ce que quelqu'un demande explicitement
// de les envoyer.
import { getDownloadURL, getStorage, listAll, ref, uploadBytes, deleteObject } from 'firebase/storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { app, emailToDocId } from './firebase';

export const LARGEUR_MAX = 1200;
export const TAILLE_MAX_OCTETS = 8 * 1024 * 1024;

export interface PhotoDistante {
  nom: string;
  date: string;
  url: string;
}

const stockage = () => getStorage(app);
const dossier = (uid: string) => `progress_photos/${uid}`;

/** Le bucket est-il configuré ? Sans lui, tout appel échoue sur une erreur
 *  interne du SDK qui ne dit rien de la vraie cause. */
export function stockageConfigure(): boolean {
  try {
    return Boolean((stockage() as any)?.app?.options?.storageBucket);
  } catch {
    return false;
  }
}

/**
 * Téléverse une photo locale. Renvoie le nom du fichier distant.
 *
 * L'image est réduite à 1200 px avant l'envoi, comme côté web : moins d'octets
 * stockés, c'est moins d'octets exposés — et c'est amplement suffisant pour
 * comparer deux silhouettes.
 */
export async function televerser(email: string, uriLocale: string, jour: string): Promise<string> {
  const uid = emailToDocId(email);
  if (!uid) throw new Error('non-connecte');
  if (!stockageConfigure()) throw new Error('stockage-absent');

  const reduite = await ImageManipulator.manipulateAsync(
    uriLocale,
    [{ resize: { width: LARGEUR_MAX } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );

  // `fetch` sur une URI de fichier local donne un Blob : c'est la seule voie
  // qui marche avec le SDK JS de Firebase en React Native, `uploadBytes`
  // n'acceptant pas un chemin de fichier.
  const blob = await (await fetch(reduite.uri)).blob();
  if (blob.size > TAILLE_MAX_OCTETS) throw new Error('trop-lourde');

  const suffixe = Math.random().toString(36).slice(2, 8);
  const nom = `${jour}_${suffixe}.jpg`;
  await uploadBytes(ref(stockage(), `${dossier(uid)}/${nom}`), blob, {
    contentType: 'image/jpeg',
    cacheControl: 'private, max-age=0, no-store',
  });
  return nom;
}

/** Photos distantes, de la plus ancienne à la plus récente. */
export async function listerDistantes(email: string): Promise<PhotoDistante[]> {
  const uid = emailToDocId(email);
  if (!uid || !stockageConfigure()) return [];
  try {
    const res = await listAll(ref(stockage(), dossier(uid)));
    const items = res.items.slice().sort((a, b) => a.name.localeCompare(b.name));
    const sorties: PhotoDistante[] = [];
    for (const item of items) {
      try {
        sorties.push({ nom: item.name, date: item.name.slice(0, 10), url: await getDownloadURL(item) });
      } catch {
        // Une photo illisible ne doit pas faire disparaitre les autres.
      }
    }
    return sorties;
  } catch {
    return [];
  }
}

export async function supprimerDistante(email: string, nom: string): Promise<void> {
  const uid = emailToDocId(email);
  if (!uid || !nom) return;
  await deleteObject(ref(stockage(), `${dossier(uid)}/${nom}`));
}

/** Jour local `YYYY-MM-DD`, identique à `jourLocal()` du web. */
export function jourLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
