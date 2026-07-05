import { listUsers } from '../../lib/firebaseAdmin';
import NotifyForm from './NotifyForm';

export const dynamic = 'force-dynamic';

export default async function NotifyPage() {
  let users: any[] = [];
  let error: string | null = null;
  try { users = await listUsers(500); } catch (e: any) { error = e?.message || String(e); }

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Notifications push</h2>
      <p className="foot">Envoie une notification à tous les utilisateurs ou à une sélection. (Seuls ceux ayant ouvert l'app + accepté les notifs ont un token push.)</p>
      {error ? <div className="card empty">⚠️ {error}</div> : <NotifyForm users={users.map((u) => ({ id: u.id, email: u.email, firstName: u.firstName }))} />}
    </main>
  );
}
