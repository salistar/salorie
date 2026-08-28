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
//
// ⚠ IL LISAIT LA MAUVAISE CLE, ET N'ACCEPTAIT QUE DEUX VALEURS.
// `salorie-admin-theme` etait la cle du back-office avant l'unification, et le
// test n'admettait que 'dark' ou 'light'. Resultat : aucun des six themes
// n'etait pose avant la premiere peinture. Choisir « Ocean » ou « Dore »
// donnait une page claire, puis un basculement — precisement le flash que ce
// script existe pour eviter.
//
// L'ancienne cle reste lue en second : les navigateurs qui la portent encore
// ne doivent pas perdre leur reglage.
const SCRIPT_THEME = `
try {
  var T = ['obsidian','ivory','blush','ocean','platinum','gold','dark','light'];
  var c = localStorage.getItem('salorie-theme') || localStorage.getItem('salorie-admin-theme');
  if (T.indexOf(c) >= 0) document.documentElement.setAttribute('data-theme', c);
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
