import './globals.css';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';

export const metadata = {
  title: 'Salorie Admin',
  description: 'Salorie — back-office admin',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <div className="shell">
          <Sidebar />
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
