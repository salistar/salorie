// Progression — XP, défi annuel, kilomètres cumulés : du téléphone vers le web.
// ---------------------------------------------------------------------------
// Ces trois compteurs ne vivaient qu'en AsyncStorage. Ils sont pourtant ce que
// quelqu'un montre quand on lui demande où il en est — et c'est précisément le
// genre de chose qu'on montre sur un grand écran, pas sur six pouces.
//
// ## Pourquoi ce n'est PAS la mécanique de la liste de courses
//
// La liste de courses a deux écrivains : téléphone et web y ajoutent des
// articles, il fallait donc fusionner article par article.
//
// Ici, presque chaque valeur n'a QU'UN SEUL auteur :
//
//   - `xp`, `cumulKm`, `totalKm` — seul le TÉLÉPHONE les produit. Ils viennent
//     du GPS et des séances ; le web n'a aucun moyen de les faire monter, il
//     les affiche.
//   - `objectifKm` — le seul champ à DEUX auteurs : se fixer un objectif annuel
//     devant un grand écran a du sens, et le téléphone doit le relire.
//
// Un champ à un seul auteur ne peut pas perdre d'incrément : « le dernier écrit
// gagne » suffit. Le champ à deux auteurs, lui, porte son PROPRE horodatage —
// sans quoi le téléphone, qui se synchronise plus souvent, ramènerait à chaque
// fois l'objectif à son ancienne valeur.
//
// ⚠ Si un jour le web se met à faire monter l'XP, cette hypothèse tombe et il
// faudra de vrais compteurs distribués. Le compteur naïf ci-dessous perdrait
// alors des points en silence.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, emailToDocId } from './firebase';

export const CLE_AVATAR = 'avatar_v1';
export const CLE_DEFI = 'annual_challenge_v1';
export const CLE_KM = 'race_total_km';
/** Quand l'objectif a été fixé sur CE téléphone. Clé à part : elle évite de
 *  changer la forme de `annual_challenge_v1`, que d'autres écrans lisent. */
export const CLE_OBJECTIF_TS = 'annual_goal_ts_v1';

export interface Progression {
  xp: number;
  annee: number;
  objectifKm: number;
  cumulKm: number;
  totalKm: number;
  /** Quand l'objectif a été fixé, quel que soit l'appareil. */
  objectifTs: number;
}

export const OBJECTIF_DEFAUT = 1000;

const nombre = (v: any, defaut = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : defaut;
};

/** Assemble la progression à partir des clés locales existantes. */
export async function lireLocale(annee = new Date().getFullYear()): Promise<Progression> {
  let xp = 0;
  let objectifKm = OBJECTIF_DEFAUT;
  let cumulKm = 0;
  let totalKm = 0;
  let objectifTs = 0;
  try {
    const [av, defi, km, ts] = await AsyncStorage.multiGet([CLE_AVATAR, CLE_DEFI, CLE_KM, CLE_OBJECTIF_TS]);
    if (av[1]) xp = nombre(JSON.parse(av[1])?.xp);
    if (defi[1]) {
      const d = JSON.parse(defi[1]);
      objectifKm = nombre(d?.goalKm, OBJECTIF_DEFAUT) || OBJECTIF_DEFAUT;
      // Le cumul appartient à UNE année. Celui de l'an dernier, remonté tel
      // quel, afficherait un défi déjà gagné au 1er janvier.
      cumulKm = nombre(d?.year) === annee ? nombre(d?.cumulativeKm) : 0;
    }
    if (km[1]) totalKm = nombre(parseFloat(km[1]));
    if (ts[1]) objectifTs = nombre(ts[1]);
  } catch {
    // Stockage illisible : des zéros plutôt qu'une exception. Un écran de
    // progression vide se comprend ; un écran qui plante, non.
  }
  return { xp, annee, objectifKm, cumulKm, totalKm, objectifTs };
}

/** Écrit l'objectif localement, avec son horodatage. Le cumul n'est pas touché. */
export async function ecrireObjectifLocal(p: Progression): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [CLE_DEFI, JSON.stringify({ year: p.annee, goalKm: p.objectifKm, cumulativeKm: p.cumulKm })],
      [CLE_OBJECTIF_TS, String(p.objectifTs)],
    ]);
  } catch {
    // Échec sans conséquence : la prochaine synchronisation réessaiera.
  }
}

/**
 * Choisit l'objectif à retenir entre local et distant. PURE, donc testable —
 * c'est la seule règle de cette page qui peut faire perdre un réglage.
 */
export function objectifRetenu(
  local: { objectifKm: number; objectifTs: number },
  distant: { objectifKm: number; objectifTs: number } | null,
): { objectifKm: number; objectifTs: number; vientDuWeb: boolean } {
  if (!distant || !(distant.objectifKm > 0)) {
    return { ...local, vientDuWeb: false };
  }
  // Strictement plus récent : à égalité on garde le local, ce qui évite de
  // réécrire le stockage du téléphone à chaque synchronisation pour rien.
  if (distant.objectifTs > local.objectifTs) {
    return { objectifKm: distant.objectifKm, objectifTs: distant.objectifTs, vientDuWeb: true };
  }
  return { ...local, vientDuWeb: false };
}

const refProgression = (uid: string) => doc(db, 'users', uid, 'progression', 'etat');

/** Pousse la progression vers le web et redescend l'objectif s'il y a été changé. */
export async function pousser(email: string): Promise<Progression> {
  const locale = await lireLocale();
  const uid = emailToDocId(email);
  if (!uid) return locale;
  try {
    const snap = await getDoc(refProgression(uid));
    const d = snap.exists() ? (snap.data() as any) : null;
    const choix = objectifRetenu(locale, d ? { objectifKm: nombre(d.objectifKm), objectifTs: nombre(d.objectifTs) } : null);
    const etat: Progression = { ...locale, objectifKm: choix.objectifKm, objectifTs: choix.objectifTs };

    await setDoc(
      refProgression(uid),
      {
        xp: etat.xp,
        annee: etat.annee,
        objectifKm: etat.objectifKm,
        objectifTs: etat.objectifTs,
        cumulKm: etat.cumulKm,
        totalKm: etat.totalKm,
        updatedAt: Date.now(),
      },
      { merge: true },
    );

    if (choix.vientDuWeb) await ecrireObjectifLocal(etat);
    return etat;
  } catch {
    // Réseau absent : la progression locale reste juste, elle partira plus tard.
    return locale;
  }
}
