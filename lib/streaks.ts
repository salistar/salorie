// Calcul de série (streak) réutilisable — extrait de app/(app)/streaks.tsx pour l'accueil (#38).
// Même logique de "gel intelligent" (1 gel/semaine couvre un jour manqué). Aucune écriture,
// une seule lecture Firestore filtrée par date (l'index single-field date existe déjà ;
// le filtre type=meal est fait côté client pour ne PAS exiger d'index composite).
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ymd } from './format';
import { db, emailToDocId } from './firebase';

const fmt = ymd;

export function streakOf(dates: Set<string>): { streak: number; freezes: number } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const has = (i: number) => { const d = new Date(today); d.setDate(today.getDate() - i); return dates.has(fmt(d)); };
  const compute = (offset: number) => {
    let s = 0, freezes = 0, prevFroze = false, spanned = 0;
    for (let i = offset; ; i++) {
      spanned++;
      if (has(i)) { s++; prevFroze = false; }
      else {
        if (s === 0) break;                              // pas de gel avant le 1er jour loggué
        const budget = Math.floor((spanned - 1) / 7) + 1;
        if (!prevFroze && freezes < budget) { freezes++; prevFroze = true; }
        else break;
      }
    }
    return { s, freezes };
  };
  let r = compute(0);
  if (r.s === 0) r = compute(1);                         // aujourd'hui pas encore loggué -> depuis hier
  return { streak: r.s, freezes: r.freezes };
}

// Série "repas" (la plus représentative) pour un aperçu compact sur l'accueil.
export async function getMealStreak(email?: string | null): Promise<{ streak: number; freezes: number }> {
  try {
    const docId = email ? emailToDocId(email) : null;
    if (!docId) return { streak: 0, freezes: 0 };
    const since = fmt(new Date(Date.now() - 70 * 86400000));
    const snap = await getDocs(query(collection(db, 'users', docId, 'logs'), where('date', '>=', since)));
    const dates = new Set<string>();
    snap.forEach((d) => { const x: any = d.data(); if (x.type === 'meal' && x.date) dates.add(x.date); });
    return streakOf(dates);
  } catch {
    return { streak: 0, freezes: 0 };
  }
}
