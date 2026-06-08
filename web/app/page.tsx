import { listUsers, AdminUser } from '../lib/firebaseAdmin';

export const dynamic = 'force-dynamic'; // always read fresh from Firestore

function initials(u: AdminUser): string {
  const a = (u.firstName || u.email || u.id || '?').trim();
  return a.slice(0, 1).toUpperCase();
}
function displayName(u: AdminUser): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || (u.email ? u.email.split('@')[0] : u.id);
}

export default async function Home() {
  let users: AdminUser[] = [];
  let error: string | null = null;
  try { users = await listUsers(); } catch (e: any) { error = e?.message || String(e); }

  const withGoal = users.filter((u) => u.goal).length;
  const withWeight = users.filter((u) => u.weight).length;

  return (
    <main className="container">
      {error ? (
        <div className="card empty">
          ⚠️ Impossible de lire Firestore : {error}
          <div style={{ marginTop: 8, fontSize: 12 }}>Vérifie <code>web/.env.local</code> (FIREBASE_SERVICE_ACCOUNT).</div>
        </div>
      ) : (
        <>
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
                        <div className="userRow">
                          <div className="avatar">{initials(u)}</div>
                          <div>
                            <div className="uname">{displayName(u)}</div>
                            <div className="umail">{u.id}</div>
                          </div>
                        </div>
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
          <p className="foot">Salorie Admin · données Firebase Firestore en direct · {new Date().getFullYear()}</p>
        </>
      )}
    </main>
  );
}
