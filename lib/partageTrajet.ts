/**
 * Partager un trajet : le récit d'une sortie, pas une ligne de statistiques.
 *
 * ## Ce qu'on peut faire aujourd'hui, et ce qui exigerait un module
 *
 * Une vraie carte partagée demande une IMAGE. Trois voies existent, et deux sont
 * fermées pour de bonnes raisons :
 *
 *   · **Google Static Maps** — l'app a bien une clé Maps, mais elle apparaîtrait
 *     EN CLAIR dans l'URL partagée. N'importe qui la relèverait dans une
 *     conversation WhatsApp et la consommerait à nos frais. Écarté.
 *   · **Capture de la carte** (`react-native-view-shot`) — donnerait la plus
 *     belle image, mais c'est un module natif de plus. Reporté, pas oublié.
 *   · **Un lien vers salorie.com** — le site sert déjà des balises OpenGraph,
 *     donc le message porte une vignette et un titre. C'est ce qu'on fait.
 *
 * ## Pourquoi un récit et pas un tableau
 *
 * « 8,4 km · 52 min · 6:11/km » se lit comme un relevé de compteur. Personne ne
 * réagit à un relevé. Une phrase qui dit ce qui s'est passé — la distance, le
 * temps, et le détail dont on est fier — appelle une réponse. C'est ce qui fait
 * la différence entre un partage qui ramène quelqu'un et un partage ignoré.
 */

export type Trajet = {
  /** Kilomètres parcourus. */
  km: number;
  /** Durée en minutes. */
  minutes: number;
  /** Dénivelé positif en mètres, si on le connaît. */
  denivele?: number;
  /** Nom du lieu ou de la course, s'il y en a un. */
  lieu?: string;
  /** Calories, si on les a. */
  kcal?: number;
};

/** Allure en minutes par kilomètre, au format « 6:11 ». */
export function allure(km: number, minutes: number): string {
  if (!km || km <= 0 || !minutes || minutes <= 0) return '';
  const parKm = minutes / km;
  const m = Math.floor(parKm);
  const s = Math.round((parKm - m) * 60);
  // 6:60 n'existe pas : l'arrondi des secondes peut y mener.
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Durée lisible : « 1 h 12 » plutôt que « 72 min ». */
export function duree(minutes: number, langue: string): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return langue === 'ar' ? `${m} د` : `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (langue === 'ar') return r ? `${h} س ${r} د` : `${h} س`;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

/**
 * Le récit du trajet, dans la langue de la personne.
 *
 * Le détail marquant est choisi par ordre d'intérêt : le dénivelé d'abord quand
 * il est notable — c'est ce dont on est le plus fier et ce qui explique une
 * allure lente — puis les calories, puis rien. Tout empiler transformerait la
 * phrase en tableau, ce qu'on cherche précisément à éviter.
 */
export function recitTrajet(trajet: Trajet, langue: string): string {
  const { km, minutes, denivele, lieu, kcal } = trajet;
  const d = km.toFixed(1).replace('.', langue === 'fr' ? ',' : '.');
  const t = duree(minutes, langue);
  const a = allure(km, minutes);

  const ou = lieu ? (langue === 'ar' ? ` في ${lieu}` : langue === 'fr' ? ` à ${lieu}` : ` at ${lieu}`) : '';

  const detail =
    denivele && denivele >= 50
      ? langue === 'ar'
        ? ` مع ${Math.round(denivele)} م صعود`
        : langue === 'fr'
          ? ` avec ${Math.round(denivele)} m de dénivelé`
          : ` with ${Math.round(denivele)} m of climbing`
      : kcal && kcal > 0
        ? langue === 'ar'
          ? ` و${Math.round(kcal)} سعرة`
          : langue === 'fr'
            ? ` et ${Math.round(kcal)} kcal`
            : ` and ${Math.round(kcal)} kcal`
        : '';

  const phrases: Record<string, string> = {
    fr: `${d} km en ${t}${ou}${detail}. Allure ${a}/km.`,
    en: `${d} km in ${t}${ou}${detail}. Pace ${a}/km.`,
    ar: `${d} كلم في ${t}${ou}${detail}. الوتيرة ${a}/كلم.`,
  };
  return phrases[langue] || phrases.fr;
}

/**
 * Le chemin salorie.com d'un trajet.
 *
 * On n'y met JAMAIS de coordonnées. Un trajet part souvent du domicile : une
 * trace GPS partagée dans une conversation dit où quelqu'un habite et à quelle
 * heure il n'y est pas. Le lien ne porte donc qu'un identifiant, et c'est le
 * site qui décide ensuite quoi montrer — et à qui.
 */
export function cheminTrajet(id: string): string {
  return `trajet/${encodeURIComponent(String(id || '').slice(0, 64))}`;
}
