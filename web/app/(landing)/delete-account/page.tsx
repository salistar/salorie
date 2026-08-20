import type { Metadata } from 'next';

// Page de suppression de compte — EXIGENCE Google Play : l'URL doit être atteignable
// SANS l'application, pour l'utilisateur qui l'a déjà désinstallée. C'est son unique
// recours dans ce cas, d'où une procédure entièrement autonome, sans compte à recréer.
const PRIMARY = '#298f50';
const PRIMARY_DARK = '#1f6b3c';
const SUPPORT = 'salistarcompany@gmail.com';

export const metadata: Metadata = {
  alternates: { canonical: 'https://salorie.com/delete-account' },
  title: 'Delete your account — Salorie',
  description: 'How to delete your Salorie account and what happens to your data.',
};

const li: React.CSSProperties = { marginBottom: 10 };

export default function DeleteAccount() {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '120px 24px 80px', lineHeight: 1.7, color: '#1e293b' }}>
      <a href="/" style={{ color: PRIMARY_DARK, fontWeight: 700, fontSize: 14 }}>← Salorie</a>
      <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1, margin: '16px 0 8px' }}>Delete your account</h1>
      <p style={{ color: '#64748b', fontSize: 14 }}>Salorie — Salistar Company</p>

      <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 36 }}>From the app (fastest)</h2>
      <ol style={{ paddingLeft: 22 }}>
        <li style={li}>Open Salorie and sign in.</li>
        <li style={li}>Go to <strong>Profile → Privacy</strong>.</li>
        <li style={li}>Tap <strong>Delete my account</strong> and confirm.</li>
      </ol>
      <p>Deletion starts immediately. You are signed out as soon as it completes.</p>

      <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 36 }}>If you already uninstalled the app</h2>
      <p>
        Email <a href={`mailto:${SUPPORT}?subject=Account%20deletion%20request`} style={{ color: PRIMARY_DARK, fontWeight: 700 }}>{SUPPORT}</a>{' '}
        from the address you signed up with, with the subject <em>Account deletion request</em>. We use the sending
        address to verify it is your account — we will never act on a request for an address you do not control.
        Deletion is completed within 30 days, and usually within a few days.
      </p>

      <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 36 }}>What is deleted</h2>
      <ul style={{ paddingLeft: 22 }}>
        <li style={li}>Your profile, goals and account identity.</li>
        <li style={li}>All food, activity, water and weight logs.</li>
        <li style={li}>Health data: weight history, glucose, blood pressure, micronutrients.</li>
        <li style={li}>AI insights, meal plans and saved scans.</li>
        <li style={li}>Your marketplace listings, reports, kudos and referral records.</li>
        <li style={li}>Notifications history and your public profile.</li>
      </ul>

      <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 36 }}>What is kept, and why</h2>
      <p>
        Community routes you shared stay available to other runners, but every link to you is removed — your name
        and email are stripped, so what remains is no longer personal data. Anonymous, aggregated statistics that
        cannot identify you are also kept.
      </p>
      <p>
        If you have an active Premium subscription, cancel it from the billing portal linked in your purchase receipt — we cannot cancel
        it on your behalf.
      </p>

      <p style={{ marginTop: 40, padding: 16, background: '#ECFDF5', border: '1px solid #D1FAE5', borderRadius: 12, color: '#065F46' }}>
        Deletion is permanent. We cannot restore an account or its data once the process has run.
      </p>

      <p style={{ marginTop: 32, fontSize: 14, color: '#64748b' }}>
        Questions? <a href={`mailto:${SUPPORT}`} style={{ color: PRIMARY }}>{SUPPORT}</a> — see also our{' '}
        <a href="/privacy" style={{ color: PRIMARY }}>Privacy Policy</a>.
      </p>
    </main>
  );
}
