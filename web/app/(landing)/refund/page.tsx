import type { Metadata } from 'next';

const PRIMARY = '#298f50';
const PRIMARY_DARK = '#1f6b3c';
const UPDATED = 'August 14, 2026';

export const metadata: Metadata = {
  alternates: { canonical: 'https://salorie.com/refund' },
  title: 'Refund Policy — Salorie',
  description: 'How refunds work for Salorie Premium purchases.',
};

export default function Refund() {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '120px 24px 80px', lineHeight: 1.7, color: '#1e293b' }}>
      <a href="/" style={{ color: PRIMARY_DARK, fontWeight: 700, fontSize: 14 }}>← Salorie</a>
      <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1, margin: '16px 0 8px' }}>Refund Policy</h1>
      <p style={{ color: '#64748b', fontSize: 14 }}>Last updated: {UPDATED}</p>

      <p>
        This policy explains how refunds work for <strong>Salorie Premium</strong>, the optional paid
        subscription of the Salorie app. The free features of Salorie never require payment.
      </p>

      <Section title="1. Purchases made on our website">
        <ul>
          <li>Purchases made on salorie.com are processed by our merchant of record, which handles payment, invoicing and applicable taxes.</li>
          <li>We offer a <strong>14-day money-back guarantee</strong> on your first purchase of a Salorie Premium subscription. If you are not satisfied, contact us within 14 days of the purchase and we will refund you in full — no questions asked.</li>
          <li>To request a refund, email <a href="mailto:support@salorie.com" style={{ color: PRIMARY_DARK, fontWeight: 600 }}>support@salorie.com</a> from the email address used at checkout, or use the link in your order receipt.</li>
          <li>Refunds are issued to the original payment method, normally within 5–10 business days.</li>
          <li>Subscription renewals are not automatically refundable, but if you believe a renewal was charged in error, contact us within 14 days of the charge and we will review it fairly.</li>
        </ul>
      </Section>

      <Section title="2. Cancelling your subscription">
        <p>
          Cancelling stops the next renewal but does not by itself trigger a refund: you keep Premium
          access until the end of the period already paid. You can cancel at any time from the billing
          portal linked in your purchase receipt.
        </p>
      </Section>

      <Section title="3. Fair use">
        <p>
          The money-back guarantee applies once per customer. We may decline refund requests that show
          a pattern of abuse (for example repeated purchase-and-refund cycles).
        </p>
      </Section>

      <Section title="4. Your statutory rights">
        <p>
          Nothing in this policy limits any non-waivable rights you have under the consumer-protection
          laws of your country of residence.
        </p>
      </Section>

      <Section title="5. Contact">
        <p>Refund requests and questions: <a href="mailto:support@salorie.com" style={{ color: PRIMARY_DARK, fontWeight: 600 }}>support@salorie.com</a></p>
      </Section>

      <p style={{ marginTop: 48, color: '#94a3b8', fontSize: 13 }}>© 2026 Salistar Company. <a href="/terms" style={{ color: PRIMARY_DARK }}>Terms &amp; Conditions</a> · <a href="/privacy" style={{ color: PRIMARY_DARK }}>Privacy Policy</a></p>
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
