// Readiness / "forme du jour" — score de récupération déterministe (pas d'IA).
//
// Idée : on combine 3 signaux simples en un score 0-100, chacun pondéré.
//  - Sommeil (poids 50%) : 7-9 h = optimal. Trop peu OU trop dormi pénalise.
//  - FC au repos (poids 30%) : plus basse = meilleure récupération.
//      ~ <=50 excellent, 80+ médiocre. Optionnelle.
//  - Charge récente / minutes actives (poids 20%) : une grosse charge la veille
//      modère légèrement la forme (besoin de récup). Optionnelle.
//
// Si une entrée optionnelle manque, son poids est redistribué sur les présentes
// (le sommeil reste toujours pris en compte). Sortie 100% déterministe.

export interface ReadinessInput {
  sleepHours?: number;   // heures de sommeil de la nuit
  restingHr?: number;    // FC au repos en bpm (optionnel)
  activeMinutes?: number; // minutes actives récentes / la veille (optionnel)
}

export interface ReadinessResult {
  score: number;     // 0-100
  label: string;     // clé de chaîne : 'great' | 'good' | 'moderate' | 'low'
  advice: string;    // clé de chaîne : ex. 'advice.sleep' | 'advice.go' ...
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// Sous-score sommeil 0-100. Plateau optimal 7-9 h.
function sleepScore(h: number): number {
  if (h >= 7 && h <= 9) return 100;
  if (h < 7) {
    // 0 h -> 0 ; 7 h -> 100 (linéaire)
    return clamp((h / 7) * 100, 0, 100);
  }
  // Trop dormi : 9 h -> 100, 12 h -> ~55 (pénalité douce)
  return clamp(100 - (h - 9) * 15, 0, 100);
}

// Sous-score FC repos 0-100. <=50 bpm -> 100 ; >=80 bpm -> ~25.
function restingHrScore(hr: number): number {
  if (hr <= 50) return 100;
  if (hr >= 90) return 0;
  // 50 -> 100, 90 -> 0 (linéaire)
  return clamp(100 - (hr - 50) * 2.5, 0, 100);
}

// Sous-score charge 0-100. Une charge modérée est neutre/positive,
// une très grosse charge récente réduit la forme (fatigue).
//  0-30 min -> 100 (repos/léger) ; ~60 min -> 90 ; 120+ min -> ~60.
function loadScore(min: number): number {
  if (min <= 30) return 100;
  return clamp(100 - (min - 30) * 0.45, 55, 100);
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const { sleepHours, restingHr, activeMinutes } = input;

  // Poids de base.
  const W_SLEEP = 0.5;
  const W_HR = 0.3;
  const W_LOAD = 0.2;

  const parts: { score: number; weight: number }[] = [];
  // Le sommeil est toujours pris en compte ; si non saisi, on suppose une nuit
  // moyenne (7 h = optimal neutre) pour éviter un score absurde.
  parts.push({ score: sleepScore(sleepHours != null ? sleepHours : 7), weight: W_SLEEP });
  if (restingHr != null && restingHr > 0) parts.push({ score: restingHrScore(restingHr), weight: W_HR });
  if (activeMinutes != null && activeMinutes >= 0) parts.push({ score: loadScore(activeMinutes), weight: W_LOAD });

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const weighted = parts.reduce((s, p) => s + p.score * p.weight, 0);
  const score = Math.round(clamp(totalWeight > 0 ? weighted / totalWeight : 0, 0, 100));

  // Verdict.
  let label: ReadinessResult['label'];
  if (score >= 80) label = 'great';
  else if (score >= 60) label = 'good';
  else if (score >= 40) label = 'moderate';
  else label = 'low';

  // Conseil : on cible le facteur le plus faible.
  let advice: ReadinessResult['advice'];
  const sH = sleepHours != null ? sleepHours : 7;
  if (sH < 6) advice = 'advice.sleep';
  else if (restingHr != null && restingHr >= 75) advice = 'advice.recover';
  else if (activeMinutes != null && activeMinutes >= 120) advice = 'advice.easy';
  else if (score >= 80) advice = 'advice.go';
  else if (score >= 60) advice = 'advice.steady';
  else advice = 'advice.rest';

  return { score, label, advice };
}
