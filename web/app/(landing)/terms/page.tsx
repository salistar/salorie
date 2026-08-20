import type { Metadata } from 'next';

const PRIMARY = '#298f50';
const PRIMARY_DARK = '#1f6b3c';
const UPDATED = 'August 14, 2026';

export const metadata: Metadata = {
  alternates: { canonical: 'https://salorie.com/terms' },
  title: 'Terms & Conditions — Salorie',
  description: 'The terms governing your use of the Salorie app.',
};

export default function Terms() {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '120px 24px 80px', lineHeight: 1.7, color: '#1e293b' }}>
      <a href="/" style={{ color: PRIMARY_DARK, fontWeight: 700, fontSize: 14 }}>← Salorie</a>
      <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1, margin: '16px 0 8px' }}>Terms &amp; Conditions</h1>
      <p style={{ color: '#64748b', fontSize: 14 }}>Last updated: {UPDATED}</p>

      <p>By downloading or using Salorie (the &ldquo;App&rdquo;), provided by Salistar Company, you agree to these Terms.</p>

      <Section title="1. The service">
        <p>Salorie is a calorie and nutrition tracking app. It estimates nutritional information (including via AI photo analysis) and helps you track meals, water, weight and workouts.</p>
      </Section>

      <Section title="2. Not medical advice">
        <p>Salorie provides general nutrition and fitness information for educational purposes only. Estimates (including AI food recognition) may be inaccurate. The App is <strong>not</strong> a substitute for professional medical, nutritional or dietary advice. Always consult a qualified professional before changing your diet or exercise routine.</p>
      </Section>

      <Section title="3. Accounts">
        <p>You are responsible for keeping your account credentials secure and for the activity under your account. You must provide accurate information and be at least 16 years old to use the App.</p>
      </Section>

      <Section title="4. Premium subscriptions">
        <ul>
          <li>Salorie offers an optional auto-renewing Premium subscription. Current prices are shown on <a href="/#pricing" style={{ color: PRIMARY_DARK, fontWeight: 600 }}>salorie.com</a> and at checkout.</li>
          <li>Premium is purchased <strong>on this website</strong>, not inside the app. Payment is processed by our merchant of record, which acts as the seller of record, handles payment and any applicable taxes, and is the name that appears on your bank or card statement.</li>
          <li>Manage or cancel your subscription at any time from the billing portal linked in your purchase receipt.</li>
          <li>Your subscription renews automatically unless cancelled at least 24 hours before the end of the current period.</li>
          <li>Refunds are handled as described in our <a href="/refund" style={{ color: PRIMARY_DARK, fontWeight: 600 }}>Refund Policy</a>, including a 14-day money-back guarantee on first website purchases.</li>
        </ul>
      </Section>

      <Section title="5. Acceptable use">
        <p>You agree not to misuse the App, reverse-engineer it, or use it for any unlawful purpose.</p>
      </Section>

      <Section title="6. Limitation of liability">
        <p>The App is provided &ldquo;as is&rdquo; without warranties of any kind. To the maximum extent permitted by law, Salistar Company is not liable for any damages arising from your use of, or reliance on, the App.</p>
      </Section>

      <Section title="7. Changes">
        <p>We may update these Terms. Continued use of the App after changes constitutes acceptance of the updated Terms.</p>
      </Section>

      <Section title="8. Contact">
        <p>Questions: <a href="mailto:support@salorie.com" style={{ color: PRIMARY_DARK, fontWeight: 600 }}>support@salorie.com</a></p>
      </Section>

      <p style={{ marginTop: 48, color: '#94a3b8', fontSize: 13 }}>© 2026 Salistar Company. <a href="/privacy" style={{ color: PRIMARY_DARK }}>Privacy Policy</a> · <a href="/refund" style={{ color: PRIMARY_DARK }}>Refund Policy</a></p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: PRIMARY, margin: '0 0 8px' }}>{title}</h2>
      {children}
    </section>
  );
}
