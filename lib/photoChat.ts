import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Joindre une photo à un message de course.
 *
 * ## Pourquoi on redimensionne avant d'envoyer
 *
 * Une photo prise au téléphone pèse 3 à 8 Mo. Envoyée telle quelle, elle
 * bloquerait le socket pendant plusieurs secondes sur une 4G marocaine, et le
 * serveur la refuserait de toute façon. On la ramène donc à 1024 px de large en
 * JPEG — largement assez pour une photo de fin de course affichée dans une bulle
 * de chat, et environ quarante fois plus légère.
 *
 * Le serveur revérifie tout de son côté. Ce redimensionnement est un service
 * rendu à l'utilisateur, pas une mesure de sécurité : un client modifié
 * n'exécuterait pas ce fichier.
 *
 * ## Pourquoi le JPEG, et pas le format d'origine
 *
 * Un PNG de photo pèse trois fois plus lourd pour un résultat identique à l'œil.
 * Le serveur accepte PNG et WebP — pour les images qui arriveraient d'ailleurs —
 * mais ce que NOUS produisons est toujours du JPEG.
 */

/** Ce que le serveur accepte. Doit rester aligné sur `social.gateway.ts`. */
export const POIDS_MAX_BASE64 = 280000;

export type PhotoPrete = { base64: string; type: string };

/**
 * Ouvre la galerie, redimensionne, rend la photo prête à envoyer.
 *
 * Rend `null` dans tous les cas où il n'y a rien à envoyer : refus de la
 * permission, annulation, ou échec de lecture. L'appelant n'a donc qu'un seul
 * cas à traiter, et jamais d'exception à attraper.
 */
export async function choisirPhoto(): Promise<PhotoPrete | null> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;

    const choix = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      // Pas de recadrage imposé : on ne sait pas ce que la personne veut montrer.
      allowsEditing: false,
    });
    if (choix.canceled || !choix.assets?.[0]?.uri) return null;

    return await preparer(choix.assets[0].uri);
  } catch {
    return null;
  }
}

/** Prend une photo avec l'appareil, même traitement. */
export async function prendrePhoto(): Promise<PhotoPrete | null> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    const choix = await ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: false });
    if (choix.canceled || !choix.assets?.[0]?.uri) return null;
    return await preparer(choix.assets[0].uri);
  } catch {
    return null;
  }
}

/**
 * Redimensionne puis encode.
 *
 * Deux passes si nécessaire : une photo très détaillée peut rester au-dessus de
 * la limite même à 1024 px. Plutôt que de la refuser, on baisse la qualité une
 * fois. Au-delà on abandonne — s'acharner produirait une image illisible.
 */
async function preparer(uri: string): Promise<PhotoPrete | null> {
  for (const qualite of [0.7, 0.45]) {
    const r = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }], {
      compress: qualite,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    if (r.base64 && r.base64.length <= POIDS_MAX_BASE64) {
      return { base64: r.base64, type: 'image/jpeg' };
    }
  }
  return null;
}

/** L'adresse à passer à `<Image source={{ uri }} />`. */
export function uriAffichage(base64: string, type: string): string {
  return `data:${type || 'image/jpeg'};base64,${base64}`;
}
