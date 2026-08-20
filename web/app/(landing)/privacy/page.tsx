import type { Metadata } from 'next';

const PRIMARY = '#298f50';
const PRIMARY_DARK = '#1f6b3c';
const UPDATED = 'August 14, 2026';

export const metadata: Metadata = {
  alternates: { canonical: 'https://salorie.com/privacy' },
  title: 'Privacy Policy — Salorie',
  description: 'How Salorie collects, uses and protects your data.',
};

export default function Privacy() {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '120px 24px 80px', lineHeight: 1.7, color: '#1e293b' }}>
      <a href="/" style={{ color: PRIMARY_DARK, fontWeight: 700, fontSize: 14 }}>← Salorie</a>
      <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1, margin: '16px 0 8px' }}>Privacy Policy</h1>
      <p style={{ color: '#64748b', fontSize: 14 }}>Last updated: {UPDATED}</p>

      <p>
        Salorie (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is operated by <strong>Salistar Company</strong>. This policy
        explains what data the Salorie mobile app collects, why, and how we protect it. We do
        <strong> not</strong> sell your data or share it with advertisers.
      </p>

      <Section title="1. Data we collect">
        <ul>
          <li><strong>Account info</strong> — your email address, and your name &amp; profile picture if you sign in with Google. Authentication is handled by Clerk.</li>
          <li><strong>Health &amp; fitness data you enter</strong> — age, height, weight, goals, the meals you log (calories &amp; macros), water intake, and workouts. This is the core of the app and stays tied to your account.</li>
          <li><strong>Food photos</strong> — only the photos you choose to scan. They are sent to Google&rsquo;s Gemini AI to recognise the food and estimate nutrition. They are not used for advertising.</li>
          <li><strong>Subscription status</strong> — if you buy Premium, we store your entitlement so the app knows what to unlock. Payment is processed on salorie.com by our merchant of record; we never see your card details.</li>
          <li><strong>Technical identifiers</strong> — an app-install / push token so notifications and subscriptions work. We do not collect the Android Advertising ID.</li>
        </ul>
      </Section>

      <Section title="2. How we use it">
        <ul>
          <li>To calculate your personalised calorie and macro targets.</li>
          <li>To show your daily dashboard, analytics and progress.</li>
          <li>To recognise food from the photos you scan.</li>
          <li>To deliver optional reminders you enable.</li>
          <li>To manage your account and Premium subscription.</li>
        </ul>
      </Section>

      <Section title="3. Processors we rely on">
        <p>We use these service providers strictly to run Salorie&rsquo;s features. They are not allowed to use your data for their own purposes:</p>
        <ul>
          <li><strong>Clerk</strong> — authentication / account management.</li>
          <li><strong>Google Gemini</strong> — AI analysis of the food photos you scan.</li>
          <li><strong>Firebase (Google)</strong> — secure backend storage of the data you log.</li>
          <li><strong>RevenueCat</strong> — subscription entitlement management.</li>
          <li><strong>Paddle / Polar (merchant of record)</strong> — payment processing and invoicing for purchases made on salorie.com, under their own privacy policies.</li>
          <li><strong>FatSecret</strong> — food &amp; nutrition database lookups for your searches.</li>
        </ul>
      </Section>

      <Section title="4. Data security">
        <p>All data is encrypted in transit over HTTPS/TLS. Access to stored data is restricted to the operations needed to run the service.</p>
      </Section>

      <Section title="5. Your rights">
        <p>
          You can view and edit your data in the app, and request deletion of your account and data at any time —
          from the in-app Profile screen or by emailing us. Deletion removes your records from our systems.
        </p>
      </Section>

      <Section title="6. Children">
        <p>Salorie is intended for users aged 16 and over and is not directed at children. We do not knowingly collect data from children under 13.</p>
      </Section>

      <Section title="7. Health disclaimer">
        <p>Salorie provides general nutrition and fitness information for educational purposes only. It is not medical advice. Consult a healthcare professional before starting any diet or exercise program.</p>
      </Section>

      <Section title="8. Contact">
        <p>Questions or data requests: <a href="mailto:support@salorie.com" style={{ color: PRIMARY_DARK, fontWeight: 600 }}>support@salorie.com</a></p>
      </Section>

      <p style={{ marginTop: 48, color: '#94a3b8', fontSize: 13 }}>© 2026 Salistar Company. <a href="/terms" style={{ color: PRIMARY_DARK }}>Terms &amp; Conditions</a></p>
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
