import { listUsers, getRecentEvents, AdminUser } from '../../lib/firebaseAdmin';
import { withTimeout } from '../../lib/withTimeout';
import AutoRefresh from '../AutoRefresh';

export const dynamic = 'force-dynamic'; // always read fresh from Firestore

function evTime(ts: any): string {
  const s = ts?._seconds ?? ts?.seconds;
  return s ? new Date(s * 1000).toLocaleString('fr-FR') : '—';
}
function evLabel(t: string): string {
  const m: Record<string, string> = {
    meal_logged: '🍽️ Repas', activity_logged: '👟 Activité', weight_logged: '⚖️ Poids',
    run_completed: '🏃 Course', race_completed: '🏁 Course live', fast_completed: '⏱️ Jeûne',
    race_joined: '➕ Course rejointe', challenge_joined: '➕ Défi rejoint',
  };
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
  // Résilience : Firestore peut être lent (cold-start gRPC / latence conteneur) -> on plafonne
  // l'attente et on lit les deux sources EN PARALLÈLE, pour ne plus bloquer la page >90s.
  //
  // L'échec d'une source ne doit JAMAIS effacer la page. Une version antérieure
  // remplaçait tout le tableau de bord par une carte d'erreur : au moindre démarrage à
  // froid, statistiques, tableau des utilisateurs et flux d'événements disparaissaient —
  // et AutoRefresh relançant la lecture toutes les 15 s, le tableau de bord clignotait
  // entre contenu et page vide. Signalé le 5 août 2026.
  //
  // On garde donc le meilleur des deux : la page se rend toujours, et l'échec se DIT,
  // dans un bandeau au lieu d'un silence.
  const [uRes, eRes] = await Promise.allSettled([
    withTimeout(listUsers(), 8000, 'Utilisateurs'),
    withTimeout(getRecentEvents(40), 8000, 'Événements'),
  ]);
  if (uRes.status === 'fulfilled') users = uRes.value; else error = String(uRes.reason);
  if (eRes.status === 'fulfilled') events = eRes.value;
  else if (!error) error = String(eRes.reason);

  const withGoal = users.filter((u) => u.goal).length;
  const withWeight = users.filter((u) => u.weight).length;

  return (
    <main className="container">
      <AutoRefresh seconds={15} />
      {error && (
        <div className="msg msg-err" role="alert">
          ⚠️ Lecture Firestore incomplète : {error}
          <div style={{ marginTop: 6, fontSize: 12 }}>
            Les chiffres ci-dessous peuvent être partiels. Si cela persiste, vérifie{' '}
            <code>FIREBASE_SERVICE_ACCOUNT</code> dans l&apos;environnement du conteneur web.
          </div>
        </div>
      )}
      {(
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
              <div className="table-wrap">
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
              </div>
            )}
          </div>
          <h2>Flux d'événements (Event Bus)</h2>
          <div className="card">
            {events.length === 0 ? (
              <div className="empty">Aucun événement encore (l'app en émet à chaque repas / activité / poids).</div>
            ) : (
              <div className="table-wrap">
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
              </div>
            )}
          </div>

          <p className="foot">Salorie Admin · données Firebase Firestore en direct · {new Date().getFullYear()}</p>
        </>
      )}
    </main>
  );
}
