'use client';

// Selecteur de theme a six pastilles — identique sur toutes les surfaces.
// ---------------------------------------------------------------------------
// Il REMPLACE le bouton Clair/Sombre/Auto sans le renier : « Auto » reste la
// premiere option, et les anciennes valeurs `light` / `dark` deja enregistrees
// dans les navigateurs continuent de s'appliquer grace aux alias produits par
// scripts/generer-themes.js.
//
// Le theme est pose sur <html> par le script inline du layout AVANT le premier
// rendu. Ce composant ne fait que refleter et modifier l'etat — jamais
// l'initialiser, sinon la page clignoterait a chaque chargement.

import React from 'react';
import './ui.css';

export const CLE_THEME = 'salorie-theme';

/** Doit rester aligne sur design/themes.json — verifie par un test. */
export const THEMES_WEB = [
  { cle: 'obsidian', nom: 'Noir', pastille: '#0A0C10', accent: '#34D98F' },
  { cle: 'ivory', nom: 'Blanc', pastille: '#FAFAF8', accent: '#16A06A' },
  { cle: 'blush', nom: 'Rose', pastille: '#FFF7F9', accent: '#E8467C' },
  { cle: 'ocean', nom: 'Bleu', pastille: '#0B1220', accent: '#3E8BFF' },
  { cle: 'platinum', nom: 'Argenté', pastille: '#F4F5F7', accent: '#6B7A90' },
  { cle: 'gold', nom: 'Doré', pastille: '#0F0D08', accent: '#D4A94E' },
] as const;

export type CleThemeWeb = (typeof THEMES_WEB)[number]['cle'] | 'system';

export function appliquerTheme(choix: CleThemeWeb) {
  const html = document.documentElement;
  // « Système » RETIRE l'attribut au lieu d'en calculer la valeur : ainsi
  // `prefers-color-scheme` reprend la main, y compris si l'utilisateur bascule
  // son OS pendant que la page est ouverte — rien a reabonner ici.
  if (choix === 'system') html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', choix);
}

export default function SelecteurTheme({ compact = false }: { compact?: boolean }) {
  const [choix, setChoix] = React.useState<CleThemeWeb>('system');

  React.useEffect(() => {
    try {
      // On lit AUSSI l'ancienne cle : sans cela, un utilisateur qui avait choisi
      // « sombre » verrait son reglage oublie au premier chargement.
      const brut = localStorage.getItem(CLE_THEME)
        || localStorage.getItem('salorie-admin-theme')
        || 'system';
      setChoix(brut as CleThemeWeb);
    } catch { /* mode privé : on reste sur « système » */ }
  }, []);

  const choisir = (c: CleThemeWeb) => {
    setChoix(c);
    try { localStorage.setItem(CLE_THEME, c); } catch { /* le choix ne survivra pas, tant pis */ }
    appliquerTheme(c);
  };

  return (
    <div className="sui-themes" role="group" aria-label="Thème de l'interface">
      <button
        type="button"
        className="sui-chip"
        onClick={() => choisir('system')}
        aria-pressed={choix === 'system'}
        title="Suivre le réglage du système"
      >
        Auto
      </button>
      {THEMES_WEB.map((t) => (
        <button
          key={t.cle}
          type="button"
          className="sui-pastille"
          onClick={() => choisir(t.cle)}
          aria-pressed={choix === t.cle}
          title={t.nom}
          style={{
            background: t.pastille,
            // Un liseré d'accent : sans lui, « Blanc », « Rose » et « Argenté »
            // sont trois pastilles quasi blanches, impossibles à distinguer.
            boxShadow: `inset 0 0 0 3px ${t.accent}`,
          }}
        >
          <span className="sr-only">{compact ? t.nom : `Thème ${t.nom}`}</span>
        </button>
      ))}
    </div>
  );
}
