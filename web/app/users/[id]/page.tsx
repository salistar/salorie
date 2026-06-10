import { getUser, getUserLogs, getUserWeights, getUserNotifs } from '../../../lib/firebaseAdmin';
import AutoRefresh from '../../AutoRefresh';

export const dynamic = 'force-dynamic';

function fmt(ts: any): string {
  const s = ts?._seconds ?? ts?.seconds;
  if (s) return new Date(s * 1000).toLocaleString('fr-FR');
  if (typeof ts === 'string') return ts;
  return '—';
}

export default async function UserDetail({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  let user: any = null, logs: any[] = [], weights: any[] = [], notifs: any[] = [], error: string | null = null;
  try {
    [user, logs, weights, notifs] = await Promise.all([
      getUser(id), getUserLogs(id), getUserWeights(id), getUserNotifs(id),
    ]);
  } catch (e: any) { error = e?.message || String(e); }

  if (error) return <main className="container"><div className="card empty">⚠️ {error}</div></main>;
  if (!user) return <main className="container"><div className="card empty">Utilisateur introuvable : {id}</div></main>;

  const steps = logs.filter((l) => l.type === 'activity');
  const meals = logs.filter((l) => l.type !== 'activity');
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || (user.email ? user.email.split('@')[0] : id);

  return (
    <main className="container">
      <AutoRefresh seconds={15} />
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Tous les utilisateurs</a></p>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ marginTop: 0 }}>{name}</h2>
        <div className="umail">{user.email || id}</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 12 }}>
          {user.goal && <div><b>Objectif :</b> <span className="badge">{user.goal}</span></div>}
          {user.weight != null && <div><b>Poids :</b> {user.weight} kg</div>}
          {user.targetWeight != null && <div><b>Objectif poids :</b> {user.targetWeight} kg</div>}
          {user.height != null && <div><b>Taille :</b> {user.height} cm</div>}
          {user.dailyCalories != null && <div><b>Calories/j :</b> {user.dailyCalories}</div>}
          <div><b>Créé :</b> {fmt(user.createdAt)}</div>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="num">{meals.length}</div><div className="lab">Repas loggés</div></div>
        <div className="stat"><div className="num">{steps.length}</div><div className="lab">Jours de pas</div></div>
        <div className="stat"><div className="num">{weights.length}</div><div className="lab">Pesées</div></div>
        <div className="stat"><div className="num">{notifs.length}</div><div className="lab">Notifications</div></div>
      </div>

      <h2>Repas récents</h2>
      <div className="card">
        {meals.length === 0 ? <div className="empty">Aucun repas.</div> : (
          <table>
            <thead><tr><th>Aliment</th><th>Type</th><th>Calories</th><th>P/G/L</th><th>Date</th></tr></thead>
            <tbody>
              {meals.slice(0, 40).map((l) => (
                <tr key={l.id}>
                  <td>{l.name || '—'}</td>
                  <td>{l.type ? <span className="badge">{l.type}</span> : '—'}</td>
                  <td>{l.calories != null ? `${Math.round(l.calories)} kcal` : '—'}</td>
                  <td className="umail">{Math.round(l.protein || 0)}/{Math.round(l.carbs || 0)}/{Math.round(l.fat || 0)}</td>
                  <td className="umail">{fmt(l.timestamp) !== '—' ? fmt(l.timestamp) : (l.date || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>Activité — pas du jour</h2>
      <div className="card">
        {steps.length === 0 ? <div className="empty">Aucune activité pas.</div> : (
          <table>
            <thead><tr><th>Jour</th><th>Détail</th><th>Calories</th></tr></thead>
            <tbody>
              {steps.slice(0, 30).map((l) => (
                <tr key={l.id}>
                  <td className="umail">{l.date || fmt(l.timestamp)}</td>
                  <td>{l.name || '—'}</td>
                  <td>{l.calories != null ? `${Math.round(l.calories)} kcal` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>Historique de poids</h2>
      <div className="card">
        {weights.length === 0 ? <div className="empty">Aucune pesée.</div> : (
          <table>
            <thead><tr><th>Poids</th><th>Date</th></tr></thead>
            <tbody>
              {weights.slice(0, 30).map((w) => (
                <tr key={w.id}>
                  <td>{w.weight != null ? `${w.weight} kg` : '—'}</td>
                  <td className="umail">{fmt(w.timestamp) !== '—' ? fmt(w.timestamp) : (w.date || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="foot">Salorie Admin · données Firestore en direct (auto-refresh 15s)</p>
    </main>
  );
}
