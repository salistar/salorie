// Vidéos de démonstration des exercices — servies depuis srv3, plus embarquées.
//
// POURQUOI : les 42 vidéos pesaient 76 Mo dans l'APK, sur ~180 Mo installés. Elles
// étaient le premier poste de poids, et non découpées par appareil (contrairement aux
// bibliothèques natives) : chaque utilisateur les téléchargeait toutes, y compris les
// 40 qu'il ne regardera jamais. Sur un marché majoritairement 4G, c'est un frein à
// l'installation bien plus concret qu'une limite technique.
//
// STRATÉGIE — diffusion d'abord, cache ensuite :
//   1. Au premier visionnage on lit directement l'URL distante. expo-av diffuse en
//      continu, la lecture démarre tout de suite : pas d'écran d'attente pendant le
//      téléchargement complet.
//   2. En parallèle, le fichier est copié en local, silencieusement. Le visionnage
//      suivant part du disque et fonctionne SANS RÉSEAU — c'est le cas d'usage réel :
//      on consulte la démo à la salle, souvent en sous-sol.
//   3. Aucune erreur n'est propagée : sans réseau et sans cache, l'écran retombe sur
//      l'image statique de l'exercice (voir workout-details).
//
// Le cache va dans documentDirectory et non cacheDirectory : l'OS peut vider le second
// quand il veut, ce qui viderait précisément la vidéo qu'on a gardée pour l'hors-ligne.
import * as FileSystem from 'expo-file-system/legacy';

const BASE = 'https://api.salorie.com/videos';
const DIR = `${FileSystem.documentDirectory}exercise-videos/`;

/** Les 42 exercices disposant d'une démo. Liste GÉNÉRÉE depuis assets/videos/ :
 *  ne pas la retaper à la main — les identifiants doivent correspondre exactement aux
 *  fichiers présents dans /home/deploy/media/videos sur srv3. */
export const VIDEO_IDS: readonly string[] = [
  'barbell_row', 'bench_press', 'bent_over_lateral', 'bicep_curl', 'bulgarian_split',
  'cable_crossover', 'cable_row_one_arm', 'calf_raise', 'chest_dips', 'chest_fly', 'crunches',
  'deadlift', 'dumbbell_row', 'face_pull', 'front_raise', 'front_squat',
  'front_squat_machine', 'hammer_curl', 'hanging_knee', 'hip_adduction', 'hip_thrust',
  'incline_bench', 'lat_pulldown', 'lateral_raise', 'leg_curl', 'leg_extension', 'leg_press',
  'lunges', 'preacher_curl', 'pullup', 'romanian_dl', 'russian_twist', 'seated_calf',
  'shoulder_press', 'shrug', 'single_preacher', 'skullcrusher', 'squat', 'tricep_dips',
  'tricep_kickback', 'tricep_pushdown', 'walking_lunge',
];

const IDS = new Set(VIDEO_IDS);

/** Cet exercice a-t-il une démo ? Réponse SYNCHRONE : sert à afficher le badge « vidéo ». */
export function hasVideo(exerciseId: string): boolean {
  return IDS.has(exerciseId);
}

const remoteUri = (id: string) => `${BASE}/${id}.mp4`;
const localUri = (id: string) => `${DIR}${id}.mp4`;

// Cache mémoire des fichiers déjà présents sur le disque : évite un appel FileSystem à
// chaque rendu (getInfoAsync est asynchrone et le rendu, lui, ne l'est pas).
const onDisk = new Set<string>();
let dirReady = false;

async function ensureDir(): Promise<void> {
  if (dirReady) return;
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    dirReady = true;
  } catch {
    /* best-effort : sans dossier on diffusera simplement toujours en ligne */
  }
}

/** Recense ce qui est déjà en cache. À appeler une fois au montage de l'écran. */
export async function primeCacheIndex(): Promise<void> {
  await ensureDir();
  try {
    const files = await FileSystem.readDirectoryAsync(DIR);
    for (const f of files) if (f.endsWith('.mp4')) onDisk.add(f.replace('.mp4', ''));
  } catch {
    /* dossier absent = rien en cache, cas normal au premier lancement */
  }
}

/**
 * Source à donner à <Video>. Renvoie le fichier local s'il est déjà là (hors-ligne OK),
 * sinon l'URL distante pour une lecture immédiate en streaming.
 * Synchrone à dessein : le rendu ne peut pas attendre.
 */
export function getVideoSource(exerciseId: string): { uri: string } | null {
  if (!IDS.has(exerciseId)) return null;
  return { uri: onDisk.has(exerciseId) ? localUri(exerciseId) : remoteUri(exerciseId) };
}

/**
 * Copie la vidéo en local pour les fois suivantes. Silencieux et sans effet visible :
 * on ne bloque jamais la lecture en cours pour ça.
 */
export async function cacheInBackground(exerciseId: string): Promise<void> {
  if (!IDS.has(exerciseId) || onDisk.has(exerciseId)) return;
  await ensureDir();
  if (!dirReady) return;
  try {
    // Téléchargement vers un nom temporaire puis renommage : une coupure réseau ne
    // laisse jamais un .mp4 tronqué que le lecteur croirait valide.
    const tmp = `${localUri(exerciseId)}.part`;
    const res = await FileSystem.downloadAsync(remoteUri(exerciseId), tmp);
    if (res.status === 200) {
      await FileSystem.moveAsync({ from: tmp, to: localUri(exerciseId) });
      onDisk.add(exerciseId);
    } else {
      await FileSystem.deleteAsync(tmp, { idempotent: true });
    }
  } catch {
    /* réseau coupé ou disque plein : on réessaiera au prochain visionnage */
  }
}

/** Taille du cache en octets — pour un futur écran « libérer de l'espace ». */
export async function cacheSize(): Promise<number> {
  await ensureDir();
  try {
    const files = await FileSystem.readDirectoryAsync(DIR);
    let total = 0;
    for (const f of files) {
      const info = await FileSystem.getInfoAsync(`${DIR}${f}`);
      if (info.exists && !info.isDirectory) total += info.size ?? 0;
    }
    return total;
  } catch {
    return 0;
  }
}

/** Vide le cache vidéo. */
export async function clearVideoCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(DIR, { idempotent: true });
    onDisk.clear();
    dirReady = false;
  } catch {
    /* best-effort */
  }
}
