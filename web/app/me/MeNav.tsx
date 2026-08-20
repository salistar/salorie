'use client';
// Navigation de l'espace personnel — barre latérale GROUPÉE.
// ---------------------------------------------------------------------------
// L'ancienne barre empilait 67 liens en sept rangées au-dessus de chaque page :
// un tiers de l'écran mangé avant la première ligne de contenu, et aucune
// hiérarchie — Repas du jour pesait autant que Conditions d'utilisation.
//
// La barre latérale règle les deux : les groupes disent OÙ chercher (les mêmes
// familles que les onglets du mobile), et le contenu récupère toute la largeur.
// Sur mobile, elle devient un tiroir : un bouton l'ouvre, un voile la referme.
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/clerk-react';

type Lien = { href: string; label: string; icone: string };
type Groupe = { titre: string | null; liens: Lien[] };

/** Les 67 routes, inchangées — seule l'ORGANISATION change. */
const GROUPES: Groupe[] = [
  {
    titre: null,
    liens: [
      { href: '/me', label: 'Accueil', icone: '🏠' },
      { href: '/me/bienvenue', label: 'Bienvenue', icone: '👋' },
    ],
  },
  {
    titre: 'Nutrition',
    liens: [
      { href: '/me/diary', label: 'Repas du jour', icone: '🍽️' },
      { href: '/me/saisie', label: 'Saisie manuelle', icone: '✍️' },
      { href: '/me/scan', label: 'Scanner', icone: '📷' },
      { href: '/me/code-barres', label: 'Code-barres', icone: '📊' },
      { href: '/me/dicter', label: 'Dictée', icone: '🎤' },
      { href: '/me/etiquette', label: 'Étiquette', icone: '🏷️' },
      { href: '/me/ticket', label: 'Ticket de caisse', icone: '🧾' },
      { href: '/me/eau', label: 'Eau', icone: '💧' },
      { href: '/me/nutri-score', label: 'Nutri-Score', icone: '🔤' },
      { href: '/me/substitutions', label: 'Substitutions', icone: '🔁' },
      { href: '/me/frigo', label: 'Frigo', icone: '🧊' },
      { href: '/me/aliments', label: 'Aliments', icone: '🥗' },
      { href: '/me/composer', label: 'Composer', icone: '🥣' },
      { href: '/me/recettes', label: 'Recettes', icone: '🍲' },
      { href: '/me/recette-url', label: 'Import recette', icone: '🔗' },
      { href: '/me/plans', label: 'Plans', icone: '🗓️' },
      { href: '/me/plan-ia', label: 'Plan de repas', icone: '📝' },
      { href: '/me/modeles', label: 'Modèles', icone: '🔖' },
      { href: '/me/jeune', label: 'Jeûne', icone: '⏳' },
      { href: '/me/ramadan', label: 'Ramadan', icone: '🌙' },
      { href: '/me/restaurant', label: 'Mode resto', icone: '🍴' },
    ],
  },
  {
    titre: 'Courses & marché',
    liens: [
      { href: '/me/courses', label: 'Liste de courses', icone: '🛒' },
      { href: '/me/panier', label: 'Panier du souk', icone: '🧺' },
      { href: '/me/annonces', label: 'Annonces', icone: '📦' },
    ],
  },
  {
    titre: 'Sport',
    liens: [
      { href: '/me/activite', label: 'Activité', icone: '🚶' },
      { href: '/me/seance', label: 'Dernière séance', icone: '🏃' },
      { href: '/me/exercices', label: 'Exercices', icone: '💪' },
      { href: '/me/equipement', label: 'Équipement', icone: '🏋️' },
      { href: '/me/agenda', label: 'Agenda', icone: '📅' },
      { href: '/me/matchs', label: 'Matchs', icone: '⚽' },
      { href: '/me/terrains', label: 'Terrains', icone: '📍' },
      { href: '/me/races', label: 'Courses', icone: '🏁' },
      { href: '/me/ligues', label: 'Ligue', icone: '🏆' },
      { href: '/me/duel', label: 'Duel', icone: '🤜' },
      { href: '/me/villes', label: 'Villes', icone: '🏙️' },
      { href: '/me/parcours', label: 'Parcours', icone: '🗺️' },
      { href: '/me/medailles', label: 'Médailles', icone: '🏅' },
      { href: '/me/progression', label: 'Progression', icone: '⭐' },
      { href: '/me/sadaqa', label: 'Sadaqa', icone: '🌱' },
    ],
  },
  {
    titre: 'Santé',
    liens: [
      { href: '/me/analytics', label: 'Analyses', icone: '📈' },
      { href: '/me/metabolisme', label: 'Métabolisme', icone: '🔥' },
      { href: '/me/projection', label: 'Projection', icone: '📉' },
      { href: '/me/poids', label: 'Poids', icone: '⚖️' },
      { href: '/me/forme', label: 'Forme du jour', icone: '🔋' },
      { href: '/me/composition', label: 'Composition', icone: '🧬' },
      { href: '/me/microbiote', label: 'Microbiote', icone: '🦠' },
      { href: '/me/photos', label: 'Photos de progression', icone: '📸' },
      { href: '/me/rapport', label: 'Rapport', icone: '🩺' },
      { href: '/me/constantes', label: 'Constantes', icone: '❤️' },
      { href: '/me/mesures', label: 'Mensurations', icone: '📏' },
      { href: '/me/micronutriments', label: 'Micronutriments', icone: '💊' },
    ],
  },
  {
    titre: 'Social',
    liens: [
      { href: '/me/mur', label: 'Mur', icone: '📝' },
      { href: '/me/amis', label: 'Amis', icone: '👥' },
      { href: '/me/famille', label: 'Famille', icone: '🏡' },
      { href: '/me/journal', label: 'Journal', icone: '📰' },
      { href: '/me/coach', label: 'Coach', icone: '💬' },
      { href: '/me/parrainage', label: 'Parrainage', icone: '🎁' },
    ],
  },
  {
    titre: 'Compte',
    liens: [
      { href: '/me/import', label: 'Import', icone: '📥' },
      { href: '/me/notifications', label: 'Notifications', icone: '🔔' },
      { href: '/me/abonnement', label: 'Abonnement', icone: '💫' },
      { href: '/me/reglages', label: 'Mes infos', icone: '📋' },
      { href: '/me/profile', label: 'Profil', icone: '⚙️' },
      { href: '/me/confidentialite', label: 'Confidentialité', icone: '🔒' },
      { href: '/me/conditions', label: 'Conditions', icone: '📄' },
      { href: '/me/contact', label: 'Contact', icone: '✉️' },
    ],
  },
];

export default function MeNav() {
  const chemin = usePathname() || '/me';
  const [ouvert, setOuvert] = useState(false);
  const actif = (href: string) => (href === '/me' ? chemin === '/me' : chemin.startsWith(href));

  return (
    <>
      {/* Mobile : le bouton qui ouvre le tiroir. Invisible au-dela de 980px. */}
      <button
        className="nav-bouton"
        aria-label="Menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((v) => !v)}
      >
        <span aria-hidden>{ouvert ? '✕' : '☰'}</span>
      </button>
      {ouvert ? <div className="nav-voile" onClick={() => setOuvert(false)} aria-hidden /> : null}

      <aside className={`me-nav${ouvert ? ' nav-ouverte' : ''}`}>
        <a className="me-nav-marque" href="/me">
          {/* Le VRAI logo — l'exact fichier de l'app mobile, la marque doit etre
              la meme des deux cotes. */}
          <img className="me-nav-logo" src="/me/logo.png" alt="" width={28} height={28} />
          <span>Salorie</span>
        </a>

        <nav className="me-nav-liens">
          {GROUPES.map((g, gi) => (
            <div key={g.titre || gi} className="nav-groupe">
              {g.titre ? <div className="nav-groupe-titre">{g.titre}</div> : null}
              {g.liens.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className={`me-nav-lien${actif(l.href) ? ' actif' : ''}`}
                  onClick={() => setOuvert(false)}
                >
                  <span className="nav-icone" aria-hidden>{l.icone}</span>
                  {l.label}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="me-nav-compte">
          <UserButton afterSignOutUrl="/me" />
          <span className="me-nav-compte-note">Mon compte</span>
        </div>
      </aside>
    </>
  );
}
