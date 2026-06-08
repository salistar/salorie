import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Salorie Admin',
  description: 'Salorie — back-office admin',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <div className="topbar">
          <div className="brand"><span className="dot">🥗</span> Salorie Admin</div>
          <div style={{ opacity: 0.9, fontSize: 13, fontWeight: 600 }}>Back-office</div>
        </div>
        {children}
      </body>
    </html>
  );
}
