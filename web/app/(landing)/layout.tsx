import type { Metadata } from 'next';
import type { ReactNode } from 'react';
// La feuille de la landing ne charge QUE sous ce groupe : les pages publiques
// gardent leur habillage d'origine sans toucher a l'admin ni a /me.
import './landing.css';

// Metadonnees du site PUBLIC — reprises du depot salorie-landing, desormais
// fusionne ici : une seule app, un seul deploiement, un seul domaine a terme.
export const metadata: Metadata = {
  title: "Salorie — Compteur de calories par photo, propulsé par l'IA",
  description:
    'Photographie ton assiette : Salorie identifie les aliments et calcule calories, macros et micronutriments en moins de deux secondes.',
  metadataBase: new URL('https://salorie.com'),
  icons: { icon: '/favicon.svg', apple: '/icon.png' },
  openGraph: {
    title: 'Salorie — Compteur de calories par photo',
    description: 'Scanne ton repas, suis tes calories et atteins tes objectifs santé.',
    url: 'https://salorie.com',
    siteName: 'Salorie',
    locale: 'fr_FR',
    type: 'website',
    images: ['/og.png'],
  },
};

export default function LandingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
