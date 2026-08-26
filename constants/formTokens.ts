// La grammaire visuelle des formulaires — UNE seule source.
// ---------------------------------------------------------------------------
// POURQUOI CE FICHIER EXISTE
//
// Deux systemes de formulaires coexistaient : `components/ui/Input.tsx` et
// `components/FormKit.tsx`. Chacun portait ses propres valeurs, et **neuf
// ecrans melangent les deux** — l'utilisateur y voit deux grammaires dans le
// meme formulaire :
//
//                        <Input> (ui)          FormKit
//   rayon du champ       radius.lg             16
//   hauteur minimale     54                    AUCUNE (~47 dp effectifs)
//   libelle              minuscules, leger     MAJUSCULES, gras, interlettre
//   poids du texte       type.body             700
//
// Ce n'est pas un manque d'animation qui fait qu'un formulaire semble bacle,
// c'est ce genre d'ecart. Mesure du 26/08/2026 : 40 ecrans utilisent <Input>,
// 22 utilisent FormKit, 9 les deux.
//
// Les valeurs ci-dessous sont l'arbitrage : on garde la grammaire FormKit, plus
// affirmee et deja majoritaire sur les ecrans denses, et on aligne <Input>
// dessus. Toute nouvelle commande de saisie lit ce fichier.

/** Hauteur minimale d'un champ tactile.
 *
 * 54 et non 48 : 48 dp est le PLANCHER d'accessibilite Android, pas une cible.
 * Les champs FormKit tombaient a ~47 dp (padding 14 x2 + ligne 19) — sous le
 * plancher, donc difficiles a viser pour une main tremblante ou un pouce large.
 */
export const CHAMP_HAUTEUR = 54;

/** Hauteur des commandes secondaires : boutons +/- du stepper, puces. */
export const CHAMP_HAUTEUR_COMPACTE = 46;

export const RAYON_CHAMP = 16;
export const RAYON_CARTE = 24;
export const RAYON_PUCE = 999;

/** Epaisseur de bordure au repos, puis au focus. Le SAUT doit rester faible :
 *  une bordure qui passe de 1,5 a 3 pousse le contenu et fait « sauter » le
 *  champ sous le doigt. */
export const BORDURE = 1.5;
export const BORDURE_FOCUS = 2;

/** Le libelle. MAJUSCULES + interlettrage : lisible en petit, et il ne se
 *  confond jamais avec le texte saisi — ce qui compte quand le champ est
 *  rempli. */
export const LIBELLE = {
  fontSize: 12.5,
  fontWeight: '800' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.4,
  marginBottom: 8,
  opacity: 0.85,
};

/** Le texte que l'utilisateur tape.
 *
 * 600 et non 700 : le gras epais convient a un nombre dans un stepper, pas a
 * une adresse e-mail ou une phrase. FormKit etait a 700 partout, y compris sur
 * les champs longs, ce qui alourdit la lecture sans rien apporter.
 */
export const SAISIE = {
  fontSize: 16,
  fontWeight: '600' as const,
  paddingVertical: 14,
};

/** Le nombre au centre d'un stepper : la, le gras epais se justifie. */
export const SAISIE_NOMBRE = {
  fontSize: 22,
  fontWeight: '900' as const,
};

export const ESPACE_ENTRE_CHAMPS = 14;

/** Message d'erreur sous le champ. */
export const ERREUR = {
  fontSize: 12,
  fontWeight: '700' as const,
  marginTop: 5,
};

/**
 * Halo de focus.
 *
 * ⚠ `elevation` EST OBLIGATOIRE. `shadowColor` / `shadowOpacity` / `shadowRadius`
 * sont ignores par Android : sans `elevation`, le halo ne s'affiche que sur iOS.
 * `components/ui/Input.tsx` etait dans ce cas — son « glow premium » etait
 * invisible sur la seule plateforme livree. Constate le 26/08/2026.
 */
export function haloFocus(couleur: string) {
  return {
    shadowColor: couleur,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 2,
  };
}

/** Duree des transitions de focus. Assez court pour suivre le doigt, assez
 *  long pour ne pas clignoter. */
export const DUREE_FOCUS = 160;
