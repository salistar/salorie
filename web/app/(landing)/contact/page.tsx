import type { Metadata } from 'next';
import { ContactForm } from './ContactForm';

const PRIMARY_DARK = '#1f6b3c';

export const metadata: Metadata = {
  alternates: { canonical: 'https://salorie.com/contact' },
  title: 'Contact — Salorie',
  description: 'Contacter l’équipe Salorie : question, remboursement, compte, partenariat.',
};

/**
 * Page de contact.
 *
 * Paddle et Polar exigent tous deux un moyen de contact joignable depuis le
 * site. Le pied de page pointait jusqu'ici un simple `mailto:` — suffisant
 * pour la conformite, inutile pour qui n'a pas de client mail configure.
 */
export default function Contact() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '120px 24px 80px',
        lineHeight: 1.7,
        color: '#1e293b',
      }}
    >
      <a href="/" style={{ color: PRIMARY_DARK, fontWeight: 700, fontSize: 14 }}>
        ← Salorie
      </a>

      <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1, margin: '16px 0 8px' }}>
        Contact
      </h1>
      <p style={{ color: '#64748b', marginBottom: 32 }}>
        Une question sur ton compte, un remboursement, un bug ? Écris-nous, nous répondons
        généralement sous 24 heures.
      </p>

      <ContactForm />

      <div
        style={{
          marginTop: 32,
          paddingTop: 24,
          borderTop: '1px solid #e2e8f0',
          fontSize: 14,
          color: '#64748b',
        }}
      >
        <p style={{ marginBottom: 8 }}>
          Tu peux aussi écrire directement à{' '}
          <a href="mailto:support@salorie.com" style={{ color: PRIMARY_DARK, fontWeight: 600 }}>
            support@salorie.com
          </a>
          .
        </p>
        <p>
          Suppression de compte :{' '}
          <a href="/delete-account" style={{ color: PRIMARY_DARK, fontWeight: 600 }}>
            la procédure est décrite ici
          </a>
          .
        </p>
      </div>
    </main>
  );
}
