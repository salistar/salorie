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
