import { Share, Linking, Platform } from 'react-native';

/**
 * Partager vers l'extérieur — WhatsApp d'abord, parce qu'on vise le Maroc.
 *
 * Ce que l'app faisait jusqu'ici : neuf `Share.share({ message })`, du texte nu
 * dans la feuille de partage du système. Ça marche, mais ça ne ressemble à rien
 * une fois arrivé dans une conversation, et surtout ça demande deux gestes de
 * plus que le canal que les gens utilisent réellement.
 *
 * ## Pourquoi un lien, et pas une image
 *
 * `salorie.com` sert déjà des balises OpenGraph avec une image. Un message qui
 * porte un lien vers le site s'affiche donc en APERÇU RICHE dans WhatsApp,
 * Facebook et Telegram : vignette, titre, description. On obtient la carte sans
 * embarquer `react-native-view-shot` ni aucun module natif — ce qui compte, à
 * quelques jours d'une soumission Play.
 *
 * Instagram Stories et TikTok, eux, exigent un vrai fichier image : ils sont
 * hors de portée tant qu'on n'ajoute pas de quoi rendre une vue en image. C'est
 * documenté comme une deuxième étape, pas comme un oubli.
 *
 * ## Pourquoi `canOpenURL` ment
 *
 * Depuis Android 11, une application ne voit pas les autres. `canOpenURL` renvoie
 * FAUX pour `whatsapp://` même quand WhatsApp est installé, tant que le paquet
 * n'est pas déclaré dans `<queries>`. C'est le rôle de
 * `plugins/withVisibiliteReseaux.js`. Sans lui, tous les boutons de cette
 * bibliothèque resteraient cachés sans que rien ne l'explique.
 *
 * On ne s'y fie jamais tout seul : chaque ouverture a un repli web.
 */

export type Reseau = 'whatsapp' | 'facebook' | 'natif';

/** Adresses de test, une par réseau, pour savoir ce qui est installé. */
const SONDE: Record<string, string> = {
  whatsapp: 'whatsapp://send?text=x',
  facebook: 'fb://facewebmodal',
  instagram: 'instagram://app',
  tiktok: 'snssdk1233://',
  youtube: 'vnd.youtube://',
};

/**
 * Quelles applications sociales sont installées.
 *
 * Ne sert qu'à choisir les raccourcis à MONTRER. Un réseau absent de cette liste
 * reste joignable par la feuille de partage du système — on cache un raccourci,
 * jamais une possibilité.
 */
export async function reseauxInstalles(): Promise<string[]> {
  const trouves: string[] = [];
  await Promise.all(
    Object.entries(SONDE).map(async ([nom, url]) => {
      try {
        if (await Linking.canOpenURL(url)) trouves.push(nom);
      } catch {
        // `canOpenURL` jette sur certains constructeurs quand le schéma est
        // inconnu. Un réseau non détecté n'est pas une erreur : on n'affiche
        // simplement pas son raccourci.
      }
    })
  );
  return trouves;
}

/** Compose le message : le texte, puis le lien sur sa propre ligne pour l'aperçu. */
function composer(texte: string, lien?: string): string {
  const t = String(texte || '').trim();
  if (!lien) return t;
  // Le lien EN DERNIER et seul sur sa ligne : c'est ce qui déclenche l'aperçu
  // riche dans WhatsApp. Collé à la fin d'une phrase, il est souvent ignoré.
  return t ? `${t}\n\n${lien}` : lien;
}

/**
 * WhatsApp en direct.
 *
 * `whatsapp://` si l'application est là, `https://wa.me/` sinon — ce dernier
 * ouvre l'application quand elle existe et le web sinon, donc il ne laisse
 * jamais personne sans issue.
 */
export async function versWhatsApp(texte: string, lien?: string): Promise<boolean> {
  const message = encodeURIComponent(composer(texte, lien));
  for (const url of [`whatsapp://send?text=${message}`, `https://wa.me/?text=${message}`]) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // On tente le suivant. `openURL` jette quand rien ne sait ouvrir le schéma.
    }
  }
  return false;
}

/**
 * Facebook : pas de partage direct sans SDK propriétaire, on passe donc par le
 * partageur web, qui fonctionne avec ou sans l'application installée.
 */
export async function versFacebook(lien: string): Promise<boolean> {
  try {
    await Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(lien)}`);
    return true;
  } catch {
    return false;
  }
}

/** La feuille de partage du système : le repli qui marche partout. */
export async function versNatif(texte: string, lien?: string, titre?: string): Promise<boolean> {
  try {
    const message = composer(texte, lien);
    // Sur Android, `url` est ignoré et seul `message` est transmis — d'où le
    // lien déjà inclus dans le message plutôt que passé à part.
    await Share.share(Platform.OS === 'ios' ? { message, url: lien, title: titre } : { message, title: titre });
    return true;
  } catch {
    return false;
  }
}

/** Point d'entrée unique. `reseau` non précisé = feuille de partage du système. */
export async function partager(opts: {
  texte: string;
  lien?: string;
  titre?: string;
  reseau?: Reseau;
}): Promise<boolean> {
  const { texte, lien, titre, reseau } = opts;
  if (reseau === 'whatsapp') return versWhatsApp(texte, lien);
  if (reseau === 'facebook' && lien) return versFacebook(lien);
  return versNatif(texte, lien, titre);
}

/**
 * Un lien de partage vers le site, porteur de l'aperçu riche.
 *
 * `utm_source` sert à savoir d'où viennent les installations : sans lui, tout
 * le trafic social se confond avec le direct et on ne peut rien arbitrer.
 */
export function lienPartage(chemin: string, source: string): string {
  const base = 'https://salorie.com';
  const propre = String(chemin || '').replace(/^\/+/, '');
  const sep = propre.includes('?') ? '&' : '?';
  return `${base}/${propre}${sep}utm_source=${encodeURIComponent(source)}&utm_medium=partage`;
}
