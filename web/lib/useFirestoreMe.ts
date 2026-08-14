'use client';
// Petits crochets de lecture temps reel pour l'espace /me.
// ---------------------------------------------------------------------------
// `onSnapshot` plutot que `getDoc` : c'est ce qui rend la synchronisation visible.
// Un repas ajoute sur le telephone apparait ici sans rechargement, et l'inverse est
// vrai aussi — non par un mecanisme de synchronisation qu'on aurait ecrit, mais
// parce que les deux clients ecoutent le meme document avec le meme uid.
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { firestore } from './firebaseClient';

export type ProfilUtilisateur = {
  email?: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  onboarded?: boolean;
  gender?: string;
  goal?: string;
  weight?: number;
  height?: { feet: number; inches: number };
  language?: 'en' | 'fr' | 'ar';
  nutritionalPlan?: { dailyCalories?: number; protein?: number; carbs?: number; fats?: number };
};

export type LigneJournal = {
  id: string;
  date?: string;
  name?: string;
  calories?: number;
  /** 'meal' | 'activity' | 'water' — meme vocabulaire que le mobile. */
  type?: string;
  intensity?: string;
  protein?: number;
  carbs?: number;
  // Le mobile ecrit `fat` (cf. NutritionLog dans lib/firebase.ts) — on garde le
  // meme nom pour que les deux clients lisent et ecrivent le meme champ.
  fat?: number;
  /** breakfast|lunch|snack|dinner — le creneau du Diary mobile. */
  slot?: string;
  timestamp?: number;
};

/** Profil `users/{uid}`, en direct. `null` tant qu'on n'a pas recu la premiere reponse. */
export function useProfil(uid: string) {
  const [profil, setProfil] = useState<ProfilUtilisateur | null>(null);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const stop = onSnapshot(
      doc(firestore(), 'users', uid),
      (snap) => {
        setProfil((snap.data() as ProfilUtilisateur) || null);
        setCharge(true);
      },
      (e) => {
        setErreur(e.message);
        setCharge(true);
      },
    );
    return stop;
  }, [uid]);

  return { profil, charge, erreur };
}

/** Journee au format `YYYY-MM-DD` LOCAL — identique a la cle `date` ecrite par le mobile. */
export function jourLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Lignes de `users/{uid}/logs` pour une date donnee, en direct. */
export function useJournal(uid: string, date: string) {
  const [lignes, setLignes] = useState<LigneJournal[]>([]);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !date) return;
    setCharge(false);
    const q = query(collection(firestore(), 'users', uid, 'logs'), where('date', '==', date));
    const stop = onSnapshot(
      q,
      (snap) => {
        setLignes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as LigneJournal[]);
        setCharge(true);
      },
      (e) => {
        setErreur(e.message);
        setCharge(true);
      },
    );
    return stop;
  }, [uid, date]);

  return { lignes, charge, erreur };
}

/** Totaux d'une journee, calcules comme sur le mobile (l'eau se compte en ml). */
export function totaux(lignes: LigneJournal[]) {
  const repas = lignes.filter((l) => l.type === 'meal');
  const activites = lignes.filter((l) => l.type === 'activity');
  const eaux = lignes.filter((l) => l.type === 'water');
  return {
    kcal: repas.reduce((a, l) => a + (Number(l.calories) || 0), 0),
    proteines: Math.round(repas.reduce((a, l) => a + (Number(l.protein) || 0), 0)),
    glucides: Math.round(repas.reduce((a, l) => a + (Number(l.carbs) || 0), 0)),
    lipides: Math.round(repas.reduce((a, l) => a + (Number(l.fat) || 0), 0)),
    kcalBrulees: activites.reduce((a, l) => a + (Number(l.calories) || 0), 0),
    eauMl: eaux.reduce((a, l) => a + (Number(l.calories) || 0), 0),
    nbRepas: repas.length,
    nbActivites: activites.length,
  };
}

/** Point de `users/{uid}/weight_history`. */
export type PointPoids = { id: string; weight?: number; date?: string };

/** Historique de poids, du plus ancien au plus recent. */
export function useHistoriquePoids(uid: string) {
  const [points, setPoints] = useState<PointPoids[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(firestore(), 'users', uid, 'weight_history'),
      (snap) => {
        const l = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as PointPoids[];
        // Tri en memoire plutot qu'avec orderBy : evite d'exiger un index composite
        // Firestore pour une collection qui compte au plus quelques centaines de points.
        setPoints(l.filter((p) => p.date).sort((a, b) => String(a.date).localeCompare(String(b.date))));
      },
      () => setPoints([]),
    );
  }, [uid]);
  return points;
}

/** Toutes les lignes depuis une date `YYYY-MM-DD` incluse. */
export function useLogsDepuis(uid: string, depuis: string) {
  const [lignes, setLignes] = useState<LigneJournal[]>([]);
  const [charge, setCharge] = useState(false);
  useEffect(() => {
    if (!uid || !depuis) return;
    setCharge(false);
    const q = query(collection(firestore(), 'users', uid, 'logs'), where('date', '>=', depuis));
    return onSnapshot(
      q,
      (snap) => {
        setLignes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as LigneJournal[]);
        setCharge(true);
      },
      () => setCharge(true),
    );
  }, [uid, depuis]);
  return { lignes, charge };
}

/** Cle de periode, STRICTEMENT identique a celle du backend (insights.service.ts). */
export function clePeriode(portee: 'week' | 'month', ref = new Date()): string {
  if (portee === 'month') {
    return `month_${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
  }
  const d = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));
  const jour = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jour);
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semaine = Math.ceil(((d.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7);
  return `week_${d.getUTCFullYear()}-W${String(semaine).padStart(2, '0')}`;
}

export type Insight = {
  healthScore?: number;
  source?: 'ai' | 'computed';
  updatedAt?: number;
  en?: Record<string, string>;
  fr?: Record<string, string>;
  ar?: Record<string, string>;
};

/**
 * Analyse precalculee par le cron de 3 h (backend). Le web la LIT, il ne la calcule
 * jamais : c'est le meme document que celui affiche par le mobile, donc les deux
 * clients disent exactement la meme chose — et aucun appel d'IA n'est declenche par
 * l'ouverture de la page.
 */
export function useInsight(uid: string, periodKey: string) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [charge, setCharge] = useState(false);
  useEffect(() => {
    if (!uid || !periodKey) return;
    setCharge(false);
    return onSnapshot(
      doc(firestore(), 'users', uid, 'ai_insights', periodKey),
      (snap) => {
        setInsight((snap.data() as Insight) || null);
        setCharge(true);
      },
      () => setCharge(true),
    );
  }, [uid, periodKey]);
  return { insight, charge };
}
