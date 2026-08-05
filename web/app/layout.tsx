import './globals.css';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import Sidebar from './Sidebar';

// Inter était déclarée dans la pile de polices de globals.css mais n'était jamais
// CHARGÉE : le navigateur retombait silencieusement sur la police système. Chargée ici
// par next/font, donc auto-hébergée — pas de requête vers Google, pas de @import
// bloquant le rendu (un @import avait justement été retiré pour cette raison).
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata = {
  title: 'Salorie Admin',
  description: 'Salorie — back-office admin',
};

// Le thème doit être posé AVANT la première peinture, sinon l'admin s'affiche en
// clair puis bascule — le fameux flash blanc. Ce script est volontairement minuscule
// et synchrone dans <head> : il lit le choix mémorisé et pose l'attribut. En son
// absence, aucun attribut n'est posé et `prefers-color-scheme` décide.
const SCRIPT_THEME = `
try {
  var c = localStorage.getItem('salorie-admin-theme');
  if (c === 'dark' || c === 'light') document.documentElement.setAttribute('data-theme', c);
} catch (e) {}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_THEME }} />
      </head>
      <body>
        <div className="shell">
          <Sidebar />
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
