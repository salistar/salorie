import { listUsers, getRecentEvents, AdminUser } from '../lib/firebaseAdmin';
import AutoRefresh from './AutoRefresh';

export const dynamic = 'force-dynamic'; // always read fresh from Firestore

function evTime(ts: any): string {
  const s = ts?._seconds ?? ts?.seconds;
  return s ? new Date(s * 1000).toLocaleString('fr-FR') : '—';
}
function evLabel(t: string): string {
  const m: Record<string, string> = { meal_logged: '🍽️ Repas', activity_logged: '👟 Activité', weight_logged: '⚖️ Poids' };
  return m[t] || t;
}

function initials(u: AdminUser): string {
  const a = (u.firstName || u.email || u.id || '?').trim();
  return a.slice(0, 1).toUpperCase();
}
function displayName(u: AdminUser): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || (u.email ? u.email.split('@')[0] : u.id);
}

export default async function Home() {
  let users: AdminUser[] = [];
  let events: any[] = [];
  let error: string | null = null;
  try { users = await listUsers(); } catch (e: any) { error = e?.message || String(e); }
  try { events = await getRecentEvents(40); } catch {}

  const withGoal = users.filter((u) => u.goal).length;
  const withWeight = users.filter((u) => u.weight).length;

  return (
    <main className="container">
      <AutoRefresh seconds={15} />
      {error ? (
        <div className="card empty">
          ⚠️ Impossible de lire Firestore : {error}
          <div style={{ marginTop: 8, fontSize: 12 }}>Vérifie <code>web/.env.local</code> (FIREBASE_SERVICE_ACCOUNT).</div>
        </div>
      ) : (
        <>
          <h1>Vue d'ensemble</h1>
          <div className="stats">
            <div className="stat"><div className="num">{users.length}</div><div className="lab">Utilisateurs</div></div>
            <div className="stat"><div className="num">{withGoal}</div><div className="lab">Avec objectif défini</div></div>
            <div className="stat"><div className="num">{withWeight}</div><div className="lab">Avec poids enregistré</div></div>
          </div>

          <h2>Utilisateurs</h2>
          <div className="card">
            {users.length === 0 ? (
              <div className="empty">Aucun utilisateur trouvé.</div>
            ) : (
              <table>
                <thead>
                  <tr><th>Utilisateur</th><th>Email</th><th>Objectif</th><th>Poids</th></tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <a href={`/users/${encodeURIComponent(u.id)}`} className="userRow" style={{ textDecoration: 'none', color: 'inherit' }}>
                          <div className="avatar">{initials(u)}</div>
                          <div>
                            <div className="uname">{displayName(u)} ↗</div>
                            <div className="umail">{u.id}</div>
                          </div>
                        </a>
                      </td>
                      <td className="umail">{u.email || '—'}</td>
                      <td>{u.goal ? <span className="badge">{u.goal}</span> : '—'}</td>
                      <td>{u.weight ? `${u.weight} kg` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <h2>Flux d'événements (Event Bus)</h2>
          <div className="card">
            {events.length === 0 ? (
              <div className="empty">Aucun événement encore (l'app en émet à chaque repas / activité / poids).</div>
            ) : (
              <table>
                <thead><tr><th>Événement</th><th>Détail</th><th>Utilisateur</th><th>Quand</th></tr></thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td><span className="badge">{evLabel(e.type)}</span></td>
                      <td className="umail">{e.data?.name || (e.data?.weight != null ? `${e.data.weight} kg` : '—')}{e.data?.calories != null ? ` · ${Math.round(e.data.calories)} kcal` : ''}</td>
                      <td><a href={`/users/${encodeURIComponent(e.userId)}`} className="umail" style={{ color: '#2E8B57' }}>{e.userId}</a></td>
                      <td className="umail">{evTime(e.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="foot">Salorie Admin · données Firebase Firestore en direct · {new Date().getFullYear()}</p>
        </>
      )}
    </main>
  );
}
