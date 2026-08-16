/**
 * Démonstrations vidéo venues de YouTube, pour les exercices sans vidéo maison.
 *
 * ## Pourquoi, et ce que ça ne règle PAS
 *
 * L'app tourne ses propres démos : 42 vidéos hébergées sur srv3, diffusées puis
 * mises en cache pour marcher à la salle, souvent en sous-sol. C'est mieux qu'un
 * lecteur distant : ça fonctionne hors ligne, sans publicité et sans recommandation.
 * On ne remplace rien de tout ça.
 *
 * Le problème est ailleurs. Le catalogue compte **43 exercices** quand un
 * concurrent en aligne des milliers — et s'il est si court, c'est précisément
 * parce que chaque entrée exigeait un tournage. YouTube ne répare donc pas les
 * 43 existants (42 ont déjà leur vidéo) : il **supprime la raison pour laquelle
 * il n'y en a que 43**. Un exercice ajouté demain a sa démo le jour même.
 *
 * ## L'ordre de repli
 *
 *   1. vidéo maison   — hors ligne, sans pub, la meilleure
 *   2. vidéo YouTube  — si un identifiant a été relevé pour cet exercice
 *   3. recherche      — ouvre YouTube sur une requête, marche pour TOUT exercice
 *   4. image statique — ce que l'écran fait déjà
 *
 * L'étape 3 est ce qui rend l'ensemble utile immédiatement : aucun exercice
 * futur n'a besoin qu'on relève un identifiant pour être utilisable.
 *
 * ## Ce que YouTube exige
 *
 * Le **lecteur officiel**, et rien d'autre. Extraire le flux vidéo viole les
 * conditions d'utilisation et fait retirer l'application. D'où l'iframe
 * `youtube-nocookie.com/embed/…` : c'est le lecteur de YouTube, dans une WebView,
 * exactement ce qu'ils autorisent.
 *
 * `nocookie` et non `youtube.com` : le domaine sans cookie ne dépose rien tant
 * que la vidéo n'est pas lancée. Sur une app de santé, moins de traceurs c'est
 * moins à déclarer dans le formulaire de sécurité de Play.
 */

/**
 * Identifiants YouTube relevés à la main, par exercice.
 *
 * VIDE À DESSEIN. Un identifiant inventé produit un lecteur qui affiche
 * « vidéo indisponible » — pire qu'une absence, parce que ça ressemble à une
 * panne. On n'en ajoute qu'après vérification par
 * `scripts/verifier-youtube.py`, qui interroge YouTube pour chacun.
 *
 * Tant que la table est vide, tout passe par la recherche, ce qui marche.
 */
export const YOUTUBE_PAR_EXERCICE: Record<string, string> = {};

/** Termes de recherche par langue. « form » / « technique » écarte les compilations. */
const SUFFIXE: Record<string, string> = {
  fr: 'exercice technique',
  en: 'exercise proper form',
  ar: 'تمرين طريقة صحيحة',
};

/** Y a-t-il un identifiant relevé pour cet exercice ? */
export function aUneVideoYouTube(exerciceId: string): boolean {
  return Boolean(YOUTUBE_PAR_EXERCICE[exerciceId]);
}

/**
 * L'URL du lecteur officiel, prête pour une WebView.
 *
 * `playsinline=1` évite le passage en plein écran natif au lancement, qui sortirait
 * l'utilisateur de la fiche d'exercice. `rel=0` limite les recommandations de fin
 * à la même chaîne — on ne veut pas envoyer quelqu'un vers une vidéo au hasard
 * depuis une app de santé.
 */
export function urlLecteur(exerciceId: string): string | null {
  const vid = YOUTUBE_PAR_EXERCICE[exerciceId];
  if (!vid) return null;
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(vid)}?playsinline=1&rel=0&modestbranding=1`;
}

/**
 * Une recherche YouTube pour cet exercice — le repli qui marche toujours.
 *
 * `libelle` est le nom traduit affiché à l'écran ; c'est lui qu'on cherche, pas
 * l'identifiant technique : « développé couché » donne de bien meilleurs
 * résultats que « bench_press » pour quelqu'un qui lit en français.
 */
export function urlRecherche(libelle: string, langue: string): string {
  const requete = `${libelle} ${SUFFIXE[langue] || SUFFIXE.fr}`.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(requete)}`;
}
