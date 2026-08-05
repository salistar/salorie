'use client';

import { useEffect, useState } from 'react';

type Choix = 'light' | 'dark' | 'system';
const CLE = 'salorie-admin-theme';

/**
 * Sélecteur de thème de l'admin : Clair / Sombre / Système.
 *
 * Le choix pose `data-theme` sur <html> ; le reste est affaire de jetons CSS
 * (globals.css). « Système » RETIRE l'attribut plutôt que d'en calculer la valeur,
 * pour que `prefers-color-scheme` reprenne la main — y compris si l'utilisateur
 * bascule son OS pendant que la page est ouverte, sans rien à réabonner ici.
 *
 * Le thème est appliqué AVANT le premier rendu par le script inline du layout ;
 * ce composant ne fait que refléter et modifier l'état, jamais l'initialiser —
 * sinon la page clignoterait en clair à chaque chargement.
 */
export function appliquerTheme(choix: Choix) {
  const html = document.documentElement;
  if (choix === 'system') html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', choix);
}

export default function ThemeToggle() {
  const [choix, setChoix] = useState<Choix>('system');

  useEffect(() => {
    const stocke = (localStorage.getItem(CLE) as Choix | null) ?? 'system';
    setChoix(stocke);
  }, []);

  const choisir = (c: Choix) => {
    setChoix(c);
    try { localStorage.setItem(CLE, c); } catch { /* mode privé : le choix ne survit pas, tant pis */ }
    appliquerTheme(c);
  };

  const options: { c: Choix; label: string; titre: string }[] = [
    { c: 'light', label: '☀️', titre: 'Thème clair' },
    { c: 'dark', label: '🌙', titre: 'Thème sombre' },
    { c: 'system', label: 'Auto', titre: 'Suivre le réglage du système' },
  ];

  return (
    <div className="theme-toggle" role="group" aria-label="Thème de l'interface">
      {options.map((o) => (
        <button
          key={o.c}
          type="button"
          onClick={() => choisir(o.c)}
          aria-pressed={choix === o.c}
          title={o.titre}
        >
          <span aria-hidden="true">{o.label}</span>
          <span className="sr-only">{o.titre}</span>
        </button>
      ))}
    </div>
  );
}
