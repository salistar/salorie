// Mode équipe (relais) — helpers pour les courses live.
// On regroupe les participants par `teamName` (champ optionnel ajouté au doc
// participant via le MÊME mécanisme d'écriture Firestore que le reste de races.ts)
// et on calcule le TOTAL d'équipe (somme des distances) + un classement d'équipes.
//
// Ce module ne fait QUE de la lecture/transformation et une petite écriture du
// champ teamName (merge), pour ne rien casser au suivi individuel existant.
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, emailToDocId } from './firebase';
import type { RaceParticipant } from './races';

// Un participant peut porter un teamName (champ optionnel, best-effort).
export type TeamMember = RaceParticipant & { teamName?: string };

export interface TeamGroup {
  team: string;            // nom d'équipe (déjà nettoyé)
  totalKm: number;         // somme des distances de l'équipe, en km
  totalM: number;          // idem en mètres (utile pour comparaisons précises)
  members: TeamMember[];   // membres triés du plus loin au plus proche
  finishedCount: number;   // combien de membres ont terminé
}

// Normalise un nom d'équipe saisi (trim + limite de longueur raisonnable).
export function normalizeTeamName(raw?: string | null): string {
  return (raw || '').trim().slice(0, 24);
}

// Distance d'un participant en mètres, robuste aux champs manquants.
function participantMeters(p: TeamMember): number {
  return Number((p as any).distanceM) || 0;
}

// Regroupe les participants par teamName et renvoie le classement d'équipes,
// trié par distance totale décroissante. Les participants SANS teamName sont
// ignorés (ils restent dans le classement individuel inchangé). Compare les
// noms sans tenir compte de la casse pour éviter "Rouge" / "rouge" en double.
export function groupByTeam(participants: TeamMember[]): TeamGroup[] {
  const map = new Map<string, TeamGroup>();
  for (const p of participants || []) {
    const name = normalizeTeamName((p as any).teamName);
    if (!name) continue; // pas d'équipe -> hors classement équipe
    const key = name.toLowerCase();
    let g = map.get(key);
    if (!g) {
      g = { team: name, totalKm: 0, totalM: 0, members: [], finishedCount: 0 };
      map.set(key, g);
    }
    g.members.push(p);
    g.totalM += participantMeters(p);
    if ((p as any).finished) g.finishedCount += 1;
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.totalKm = g.totalM / 1000;
    g.members.sort((a, b) => participantMeters(b) - participantMeters(a));
  }
  // Classement : distance totale décroissante, départage par nom (stable).
  groups.sort((a, b) => (b.totalM - a.totalM) || a.team.localeCompare(b.team));
  return groups;
}

// Vrai s'il y a au moins une équipe (au moins un participant avec teamName).
export function hasTeams(participants: TeamMember[]): boolean {
  return (participants || []).some((p) => !!normalizeTeamName((p as any).teamName));
}

// Écrit le teamName sur le doc participant via le MÊME chemin Firestore que
// joinRace/updateRaceProgress (races/{raceId}/participants/{docId}), en merge
// pour ne pas écraser distanceM/lat/lng/finished. Best-effort : si le doc
// n'existe pas encore, le merge le crée proprement.
export async function setMyTeamName(raceId: string, email: string, teamName: string): Promise<void> {
  if (!raceId || !email) return;
  const clean = normalizeTeamName(teamName);
  try {
    await setDoc(
      doc(db, 'races', raceId, 'participants', emailToDocId(email)),
      { teamName: clean, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) { console.warn('[raceTeam] setMyTeamName failed', e); }
}
