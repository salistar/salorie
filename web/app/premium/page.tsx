import { listPremiumUsers } from '../../lib/firebaseAdmin';
import PremiumManager from './PremiumManager';

export const dynamic = 'force-dynamic';

export default async function PremiumPage() {
  let users: { id: string; email: string; premiumOverride: boolean }[] = [];
  let error: string | null = null;
  try { users = await listPremiumUsers(); } catch (e: any) { error = e?.message || String(e); }

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Premium — comptes</h2>
      <p className="foot">
        Accorde ou retire l'accès Premium (override) par utilisateur. L'override est écrit sur
        <code> users/&#123;id&#125;.premiumOverride</code> et débloque les flags marqués « Premium ».
      </p>
      {error ? (
        <div className="card empty">⚠️ {error}</div>
      ) : (
        <PremiumManager users={users} />
      )}
    </main>
  );
}
