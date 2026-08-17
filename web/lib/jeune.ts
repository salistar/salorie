// Jeûne intermittent — protocoles et état du minuteur.
// ---------------------------------------------------------------------------
// Les quatre protocoles du mobile, à l'identique. Le calcul est isolé ici parce
// qu'il répond à une question à laquelle on ne veut pas de réponse approximative :
// « est-ce que je peux manger maintenant ? »

export interface Protocole {
  id: string;
  /** Heures de jeûne dans la fenêtre de 24 h. */
  heuresJeune: number;
}

export const PROTOCOLES: Protocole[] = [
  { id: '16:8', heuresJeune: 16 },
  { id: '18:6', heuresJeune: 18 },
  { id: '20:4', heuresJeune: 20 },
  { id: 'OMAD', heuresJeune: 23 },
];

export interface EtatJeune {
  /** true si la période de jeûne est terminée. */
  fini: boolean;
  /** Millisecondes restantes avant la fin du jeûne (0 si fini). */
  resteMs: number;
  /** Avancement 0-100. */
  pourcent: number;
  /** Fin prévue, en millisecondes epoch. */
  finMs: number;
}

/**
 * État du jeûne à un instant donné. PURE — l'heure courante est un PARAMÈTRE,
 * jamais `Date.now()` lu à l'intérieur : sans cela la fonction serait
 * intestable, et c'est exactement celle qu'on veut tester.
 */
export function etatJeune(debutMs: number, heuresJeune: number, maintenantMs: number): EtatJeune {
  const duree = Math.max(0, heuresJeune) * 3600_000;
  const finMs = debutMs + duree;
  const ecoule = Math.max(0, maintenantMs - debutMs);
  const resteMs = Math.max(0, finMs - maintenantMs);
  // Une durée nulle est « déjà finie » plutôt que 0 % : un protocole à 0 h
  // afficherait sinon une barre vide et un jeûne éternellement en cours.
  const pourcent = duree === 0 ? 100 : Math.min(100, Math.round((ecoule / duree) * 100));
  return { fini: resteMs === 0, resteMs, pourcent, finMs };
}

/** `13:05` à partir d'un nombre de millisecondes restantes. Toujours deux chiffres. */
export function formaterReste(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const d = (n: number) => String(n).padStart(2, '0');
  return `${d(h)}:${d(m)}:${d(s)}`;
}
