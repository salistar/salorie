// Défi annuel cumulatif (ex « Conquer 2026 ») — état 100% local (AsyncStorage).
// On stocke { year, goalKm, cumulativeKm } sous une clé unique. Quand l'année
// civile change, on réinitialise le cumul (nouveau défi) tout en gardant
// l'objectif choisi par l'utilisateur — il peut le réajuster ensuite.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'annual_challenge_v1';
const DEFAULT_GOAL_KM = 500; // objectif annuel par défaut raisonnable (course/marche)

export type AnnualChallenge = { year: number; goalKm: number; cumulativeKm: number };

const currentYear = () => new Date().getFullYear();

const fresh = (goalKm = DEFAULT_GOAL_KM): AnnualChallenge => ({
  year: currentYear(),
  goalKm,
  cumulativeKm: 0,
});

async function read(): Promise<AnnualChallenge | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (typeof obj?.year !== 'number') return null;
    return {
      year: obj.year,
      goalKm: Number(obj.goalKm) || DEFAULT_GOAL_KM,
      cumulativeKm: Number(obj.cumulativeKm) || 0,
    };
  } catch {
    return null;
  }
}

async function write(c: AnnualChallenge): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(c));
  } catch {}
}

/**
 * Renvoie le défi annuel courant. Crée un état frais si absent, et réinitialise
 * le cumul si l'année a changé (on conserve l'objectif précédent).
 */
export async function getAnnual(): Promise<AnnualChallenge> {
  const stored = await read();
  if (!stored) {
    const c = fresh();
    await write(c);
    return c;
  }
  if (stored.year !== currentYear()) {
    const rolled = fresh(stored.goalKm); // nouvelle année → cumul à 0, objectif gardé
    await write(rolled);
    return rolled;
  }
  return stored;
}

/** Définit l'objectif annuel (km). Borne à >= 1. Préserve le cumul de l'année. */
export async function setAnnualGoal(km: number): Promise<AnnualChallenge> {
  const c = await getAnnual();
  const goalKm = Math.max(1, Math.round(Number(km) || 0));
  const next: AnnualChallenge = { ...c, goalKm };
  await write(next);
  return next;
}

/** Ajoute des km au cumul annuel (ignore valeurs <= 0). Renvoie l'état à jour. */
export async function addAnnualKm(km: number): Promise<AnnualChallenge> {
  const c = await getAnnual();
  const add = Number(km) || 0;
  if (add <= 0) return c;
  const next: AnnualChallenge = {
    ...c,
    cumulativeKm: Math.round((c.cumulativeKm + add) * 100) / 100,
  };
  await write(next);
  return next;
}

/** Helper d'affichage : { year, goalKm, km, pct (0..100, arrondi) }. */
export async function annualProgress(): Promise<{ year: number; goalKm: number; km: number; pct: number }> {
  const c = await getAnnual();
  const pct = c.goalKm > 0 ? Math.min(100, Math.round((c.cumulativeKm / c.goalKm) * 100)) : 0;
  return { year: c.year, goalKm: c.goalKm, km: c.cumulativeKm, pct };
}
