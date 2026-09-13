/**
 * Les étiquettes de tri de Sentry : de quoi filtrer une erreur.
 * ---------------------------------------------------------------------------
 * Une erreur sans contexte se lit « quelque chose a cassé chez quelqu'un ». Avec
 * les bonnes étiquettes, la même erreur se lit « chez les utilisateurs en arabe,
 * et seulement eux » — ce qui est la moitié du diagnostic.
 *
 * ⚠ POURQUOI CES TROIS AXES ET PAS D'AUTRES.
 * Ce ne sont pas des étiquettes génériques : ce sont les trois endroits où cette
 * application a déjà cassé, et donc les trois filtres qu'on voudra le jour où
 * une erreur remonte.
 *
 *   · `langue` + `rtl` — le RTL a produit des icônes à l'envers, des titres
 *     tronqués en plein mot, des modales inversées. Une erreur qui n'existe
 *     qu'en arabe est invisible dans un tableau de bord qui ne sépare pas les
 *     langues.
 *   · `theme` + `apparence` — deux barres d'onglets invisibles sur les thèmes
 *     sombres, un titre noir sur noir sur les six palettes. Le thème est une
 *     variable de rendu à part entière.
 *   · `palier_scan` — la cascade de vision a quatre étages (téléphone, serveur,
 *     Cloudflare, IA distante). Quand le scan échoue, la première question est
 *     « à quel étage ? », et sans étiquette il faut lire la pile d'appels.
 *
 * ⚠ CE MODULE NE DOIT JAMAIS FAIRE ÉCHOUER CE QU'IL OBSERVE. Poser une étiquette
 * est un geste de confort : si le SDK n'est pas initialisé, ou si un appel jette,
 * on avale. Une application qui plante en essayant de bien ranger ses rapports
 * de plantage serait une plaisanterie.
 */
import * as Sentry from '@sentry/react-native';

export type ContexteInterface = {
  /** Clé de palette, ex. `obsidian`, `ivory`. */
  theme?: string | null;
  /** `dark` ou `light`, une fois `system` résolu. */
  apparence?: string | null;
  /** `fr`, `en`, `ar`. */
  langue?: string | null;
};

/** Les langues écrites de droite à gauche, telles que l'app les connaît. */
const RTL = new Set(['ar', 'he', 'fa', 'ur']);

/**
 * Construit le jeu d'étiquettes. **Pur** : c'est la partie qui se teste.
 *
 * Une valeur absente est rendue `inconnu` plutôt qu'omise : dans Sentry, une
 * étiquette manquante et une étiquette vide se filtrent différemment, et
 * « inconnu » est une information — il veut dire que l'erreur est survenue
 * avant que le contexte ne soit prêt, ce qui est déjà une piste.
 */
export function tagsInterface(c: ContexteInterface): Record<string, string> {
  const langue = normaliser(c.langue);
  return {
    theme: normaliser(c.theme),
    apparence: normaliser(c.apparence),
    langue,
    rtl: langue === 'inconnu' ? 'inconnu' : String(RTL.has(langue)),
  };
}

function normaliser(v: unknown): string {
  if (typeof v !== 'string') return 'inconnu';
  const t = v.trim().toLowerCase();
  return t ? t : 'inconnu';
}

/** Pose les étiquettes. N'échoue jamais, quoi qu'il arrive au SDK. */
export function poserTags(tags: Record<string, string>): void {
  for (const [cle, valeur] of Object.entries(tags)) {
    try {
      Sentry.setTag(cle, valeur);
    } catch {
      /* SDK absent ou non initialisé : sans conséquence */
    }
  }
}

/** Les quatre étages de la cascade de vision, tels qu'ils sont nommés ailleurs. */
export type PalierScan = 'device' | 'backend' | 'ai' | 'cloudflare' | string;

/**
 * Marque le palier qui a répondu au dernier scan.
 *
 * Posé APRÈS coup, volontairement : c'est le palier qui a effectivement répondu
 * qu'on veut lire, pas celui qu'on espérait. Une erreur survenue ensuite —
 * pendant l'enregistrement du repas, par exemple — portera donc la bonne
 * provenance.
 */
export function poserPalierScan(palier: PalierScan | null | undefined): void {
  poserTags({ palier_scan: normaliser(palier) });
}
