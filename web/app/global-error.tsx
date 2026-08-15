'use client';

// Dernier filet de l'App Router : il attrape les erreurs de rendu du layout
// racine, que ni `error.tsx` ni le try/catch serveur ne voient. Sans ce fichier,
// un back-office qui casse au rendu affiche un ecran blanc et Sentry ne recoit
// rien — exactement le genre de panne muette pour laquelle Sentry a ete
// installe.
//
// Il REMPLACE le layout racine quand il s'affiche : d'ou les balises <html> et
// <body>, et des styles en ligne plutot que la feuille globale — si le CSS n'a
// pas charge, c'est precisement ce qui amene ici.
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b1120',
          color: '#e2e8f0',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          padding: '24px',
        }}
      >
        <main style={{ maxWidth: '32rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>
            Le back-office a rencontre une erreur
          </h1>
          <p style={{ lineHeight: 1.6, color: '#94a3b8', marginBottom: '0.5rem' }}>
            L&apos;incident a ete signale automatiquement dans Sentry.
          </p>
          {error.digest ? (
            <p
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '0.8rem',
                color: '#64748b',
                marginBottom: '1.5rem',
              }}
            >
              Reference : {error.digest}
            </p>
          ) : null}
          <a
            href="/"
            style={{
              display: 'inline-block',
              padding: '0.65rem 1.4rem',
              borderRadius: '9999px',
              background: '#38bdf8',
              color: '#0b1120',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Retour au tableau de bord
          </a>
        </main>
      </body>
    </html>
  );
}
