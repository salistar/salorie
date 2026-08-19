'use client';
// Navigation de l'espace personnel — les memes sections que les onglets du mobile,
// pour qu'un utilisateur qui passe du telephone au web ne se reapprenne rien.
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/clerk-react';

const SECTIONS = [
  { href: '/me', label: 'Accueil', icone: '🏠' },
  { href: '/me/bienvenue', label: 'Bienvenue', icone: '👋' },
  // Deux ecrans distincts portaient le meme libelle « Journal ». Le mobile les
  // nomme differemment — « Journal alimentaire » et « Journal » — et le web doit
  // faire pareil : deux entrees identiques dans une barre, on clique au hasard.
  { href: '/me/diary', label: 'Repas du jour', icone: '🍽️' },
  { href: '/me/scan', label: 'Scanner', icone: '📷' },
  { href: '/me/code-barres', label: 'Code-barres', icone: '📊' },
  { href: '/me/dicter', label: 'Dictée', icone: '🎤' },
  { href: '/me/plans', label: 'Plans', icone: '🗓️' },
  { href: '/me/modeles', label: 'Modèles', icone: '🔖' },
  { href: '/me/exercices', label: 'Exercices', icone: '💪' },
  { href: '/me/aliments', label: 'Aliments', icone: '🥗' },
  { href: '/me/composer', label: 'Composer', icone: '🥣' },
  { href: '/me/courses', label: 'Liste de courses', icone: '🛒' },
  { href: '/me/recettes', label: 'Recettes', icone: '🍲' },
  { href: '/me/recette-url', label: 'Import recette', icone: '🔗' },
  { href: '/me/analytics', label: 'Analyses', icone: '📈' },
  { href: '/me/metabolisme', label: 'Métabolisme', icone: '🔥' },
  { href: '/me/projection', label: 'Projection', icone: '📉' },
  { href: '/me/activite', label: 'Activité', icone: '🚶' },
  { href: '/me/agenda', label: 'Agenda', icone: '📅' },
  { href: '/me/matchs', label: 'Matchs', icone: '⚽' },
  { href: '/me/terrains', label: 'Terrains', icone: '📍' },
  { href: '/me/races', label: 'Courses', icone: '🏁' },
  { href: '/me/ligues', label: 'Ligue', icone: '🏆' },
  { href: '/me/duel', label: 'Duel', icone: '🤜' },
  { href: '/me/villes', label: 'Villes', icone: '🏙️' },
  { href: '/me/parcours', label: 'Parcours', icone: '🗺️' },
  { href: '/me/journal', label: 'Journal', icone: '📰' },
  { href: '/me/coach', label: 'Coach', icone: '💬' },
  { href: '/me/mur', label: 'Mur', icone: '📝' },
  { href: '/me/amis', label: 'Amis', icone: '👥' },
  { href: '/me/famille', label: 'Famille', icone: '🏡' },
  { href: '/me/saisie', label: 'Saisie manuelle', icone: '✍️' },
  { href: '/me/eau', label: 'Eau', icone: '💧' },
  { href: '/me/nutri-score', label: 'Nutri-Score', icone: '🔤' },
  { href: '/me/substitutions', label: 'Substitutions', icone: '🔁' },
  { href: '/me/frigo', label: 'Frigo', icone: '🧊' },
  { href: '/me/etiquette', label: 'Étiquette', icone: '🏷️' },
  { href: '/me/ticket', label: 'Ticket de caisse', icone: '🧾' },
  { href: '/me/equipement', label: 'Équipement', icone: '🏋️' },
  { href: '/me/photos', label: 'Photos de progression', icone: '📸' },
  { href: '/me/panier', label: 'Panier du souk', icone: '🧺' },
  { href: '/me/restaurant', label: 'Mode resto', icone: '🍽️' },
  { href: '/me/sadaqa', label: 'Sadaqa', icone: '🌱' },
  { href: '/me/ramadan', label: 'Ramadan', icone: '🌙' },
  { href: '/me/poids', label: 'Poids', icone: '⚖️' },
  { href: '/me/forme', label: 'Forme du jour', icone: '🔋' },
  { href: '/me/composition', label: 'Composition', icone: '🧬' },
  { href: '/me/jeune', label: 'Jeûne', icone: '⏳' },
  { href: '/me/microbiote', label: 'Microbiote', icone: '🦠' },
  { href: '/me/seance', label: 'Dernière séance', icone: '🏃' },
  { href: '/me/progression', label: 'Progression', icone: '⭐' },
  { href: '/me/medailles', label: 'Médailles', icone: '🏅' },
  { href: '/me/parrainage', label: 'Parrainage', icone: '🎁' },
  { href: '/me/import', label: 'Import', icone: '📥' },
  { href: '/me/rapport', label: 'Rapport', icone: '🩺' },
  { href: '/me/constantes', label: 'Constantes', icone: '❤️' },
  { href: '/me/mesures', label: 'Mensurations', icone: '📏' },
  { href: '/me/micronutriments', label: 'Micronutriments', icone: '🧬' },
  { href: '/me/annonces', label: 'Annonces', icone: '🏷️' },
  { href: '/me/plan-ia', label: 'Plan de repas', icone: '📝' },
  { href: '/me/notifications', label: 'Notifications', icone: '🔔' },
  { href: '/me/confidentialite', label: 'Confidentialité', icone: '🔒' },
  { href: '/me/conditions', label: 'Conditions', icone: '📄' },
  { href: '/me/contact', label: 'Contact', icone: '✉️' },
  { href: '/me/reglages', label: 'Mes infos', icone: '📋' },
  { href: '/me/abonnement', label: 'Abonnement', icone: '⭐' },
  { href: '/me/profile', label: 'Profil', icone: '⚙️' },
];

export default function MeNav() {
  const chemin = usePathname() || '/me';
  const actif = (href: string) => (href === '/me' ? chemin === '/me' : chemin.startsWith(href));

  return (
    <header className="me-nav">
      <a className="me-nav-marque" href="/me">
        {/* Le VRAI logo, pas un emoji. `logo.png` est l'exact fichier que porte
            l'app mobile (`assets/images/fire.png`, au bit près) : la marque doit
            être la même des deux côtés, sinon l'espace web a l'air d'un autre
            produit. Il ne servait jusqu'ici que sur l'écran de connexion. */}
        <img className="me-nav-logo" src="/me/logo.png" alt="" width={26} height={26} />
        <span>Salorie</span>
      </a>
      <nav className="me-nav-liens">
        {SECTIONS.map((s) => (
          <a key={s.href} href={s.href} className={`me-nav-lien${actif(s.href) ? ' actif' : ''}`}>
            <span aria-hidden>{s.icone}</span>
            {s.label}
          </a>
        ))}
      </nav>
      <div className="me-nav-compte">
        <UserButton afterSignOutUrl="/me" />
      </div>
    </header>
  );
}
