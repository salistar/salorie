import AsyncStorage from '@react-native-async-storage/async-storage';

// Récompenses commerçants locaux (O2O — Online to Offline).
// Équivalent MENA d'un programme de fidélité : l'effort (km cumulés en course)
// débloque des BONS chez des partenaires locaux (café, salle de sport, épicerie…).
//
// IMPORTANT — STUB local : la VALIDATION réelle chez le commerçant nécessite des
// partenaires et un back-office (non disponible). En attendant, on génère un CODE
// de bon ALÉATOIRE côté téléphone, à présenter chez le partenaire. C'est un
// « best-effort mobile » : aucun appel réseau, aucune vérification serveur.

// Clé AsyncStorage facultative : si l'app écrit les km cumulés ici, on les lit
// (même clé que la Sadaqa Jariya). Sinon 0.
export const RACE_TOTAL_KM_KEY = 'race_total_km';
// Codes de bons déjà générés (rewardId -> code), persistés pour réaffichage.
export const REWARDS_KEY = 'rewards_v1';

export interface Reward {
  id: string;
  /** Nom du commerçant partenaire (trilingue). */
  partner: { en: string; fr: string; ar: string };
  /** Offre proposée (trilingue). */
  offer: { en: string; fr: string; ar: string };
  /** Catégorie — pilote l'icône à l'écran. */
  category: 'cafe' | 'gym' | 'grocery';
  /** Km cumulés requis pour débloquer ce bon. */
  kmRequired: number;
  /** Emoji décoratif (rendu indépendant de la langue). */
  emoji: string;
}

// Catalogue d'exemple — partenaires MENA (Maroc). Données locales, ajustables côté produit.
export const REWARDS: Reward[] = [
  {
    id: 'cafe-maure',
    partner: { en: 'Café Maure', fr: 'Café Maure', ar: 'مقهى موريسكي' },
    offer: { en: 'A free mint tea', fr: 'Un thé à la menthe offert', ar: 'كأس أتاي بالنعناع مجاناً' },
    category: 'cafe', kmRequired: 5, emoji: '🍵',
  },
  {
    id: 'epicerie-baraka',
    partner: { en: 'Baraka Grocery', fr: 'Épicerie Baraka', ar: 'بقالة بركة' },
    offer: { en: '10% off fresh produce', fr: '-10% sur les fruits & légumes', ar: 'خصم 10٪ على الخضر والفواكه' },
    category: 'grocery', kmRequired: 15, emoji: '🥕',
  },
  {
    id: 'fitzone-gym',
    partner: { en: 'FitZone Club', fr: 'FitZone Club', ar: 'نادي فيت زون' },
    offer: { en: 'A free day pass', fr: 'Une séance offerte', ar: 'حصة مجانية' },
    category: 'gym', kmRequired: 30, emoji: '💪' },
  {
    id: 'cafe-corniche',
    partner: { en: 'Corniche Coffee', fr: 'Café de la Corniche', ar: 'مقهى الكورنيش' },
    offer: { en: 'Coffee + pastry combo', fr: 'Café + viennoiserie offerts', ar: 'قهوة مع حلوى مجاناً' },
    category: 'cafe', kmRequired: 50, emoji: '☕',
  },
  {
    id: 'souk-bio',
    partner: { en: 'Souk Bio', fr: 'Souk Bio', ar: 'سوق بيو' },
    offer: { en: 'Free jar of argan honey', fr: 'Un pot de miel d\'argan offert', ar: 'علبة عسل الأركان مجاناً' },
    category: 'grocery', kmRequired: 75, emoji: '🍯',
  },
  {
    id: 'fitzone-month',
    partner: { en: 'FitZone Club', fr: 'FitZone Club', ar: 'نادي فيت زون' },
    offer: { en: '-25% on a monthly pass', fr: '-25% sur l\'abonnement mensuel', ar: 'خصم 25٪ على الاشتراك الشهري' },
    category: 'gym', kmRequired: 120, emoji: '🏋️',
  },
];

/**
 * Lit les km cumulés depuis AsyncStorage (clé `race_total_km`) si présente,
 * sinon retourne 0. Valeurs négatives / NaN traitées comme 0.
 */
export async function getTotalKm(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(RACE_TOTAL_KM_KEY);
    if (raw != null) {
      const n = parseFloat(raw);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  } catch {
    // Stockage indisponible — on retombe sur 0.
  }
  return 0;
}

/** true si le bon est débloqué pour la distance cumulée donnée. */
export function unlockable(reward: Reward, totalKm: number): boolean {
  const km = Number.isFinite(totalKm) && totalKm > 0 ? totalKm : 0;
  return km >= reward.kmRequired;
}

/** Km restants avant de débloquer ce bon (0 si déjà débloqué). */
export function kmRemaining(reward: Reward, totalKm: number): number {
  const km = Number.isFinite(totalKm) && totalKm > 0 ? totalKm : 0;
  return Math.max(0, reward.kmRequired - km);
}

/** Charge la map des codes déjà générés (rewardId -> code). */
export async function getGeneratedCodes(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(REWARDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
    }
  } catch {
    // JSON corrompu / stockage indisponible — on repart d'une map vide.
  }
  return {};
}

/**
 * Génère (ou réutilise) un code de bon ALÉATOIRE local pour un bon donné, et le
 * persiste dans `rewards_v1`. Stub : ce code n'est PAS validé par un serveur —
 * il est à présenter chez le partenaire (voir note à l'écran).
 * @returns le code, ex. « SAL-7F3K-9Q2 ».
 */
export async function generateCode(rewardId: string): Promise<string> {
  const existing = await getGeneratedCodes();
  if (existing[rewardId]) return existing[rewardId];
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I/O/0/1 (lisibilité)
  const pick = (n: number) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  const code = `SAL-${pick(4)}-${pick(3)}`;
  const next = { ...existing, [rewardId]: code };
  try { await AsyncStorage.setItem(REWARDS_KEY, JSON.stringify(next)); } catch {}
  return code;
}
