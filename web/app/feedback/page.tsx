import { getFeatureRequests, getContactMessages } from '../../lib/firebaseAdmin';
import MessageContact from './MessageContact';

export const dynamic = 'force-dynamic';

function when(ts: any): string {
  try {
    const ms = ts?._seconds ? ts._seconds * 1000 : (typeof ts === 'number' ? ts : Date.parse(ts));
    if (!ms) return '';
    return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

export default async function FeedbackPage() {
  let reqs: any[] = [], msgs: any[] = [], error: string | null = null;
  try { [reqs, msgs] = await Promise.all([getFeatureRequests(), getContactMessages()]); }
  catch (e: any) { error = e?.message || String(e); }

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Feedback utilisateurs</h2>
      <p className="foot">Demandes de features (votées par les users) et messages de contact, remontés depuis l'app mobile.</p>
      {error && <div className="card empty">⚠️ {error}</div>}

      <h3 style={{ marginTop: 18 }}>💡 Demandes de features ({reqs.length})</h3>
      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        {reqs.map((r) => (
          <div key={r.id} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ textAlign: 'center', minWidth: 48 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#2E8B57' }}>▲ {Array.isArray(r.upvotes) ? r.upvotes.length : (r.upvotes || 0)}</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>votes</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{r.title}</div>
              <div style={{ fontSize: 13, color: '#475569', marginTop: 2, overflowWrap: 'anywhere' }}>{r.description}</div>
              <div className="foot" style={{ marginTop: 4 }}>{r.userId || r.email || '—'} · {when(r.createdAt)}{r.status ? ` · ${r.status}` : ''}</div>
            </div>
          </div>
        ))}
        {!reqs.length && !error && <div className="card empty">Aucune demande pour l'instant.</div>}
      </div>

      <h3 style={{ marginTop: 24 }}>✉️ Messages de contact ({msgs.length})</h3>
      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        {msgs.map((m) => (
          <MessageContact
            key={m.id}
            sujet={m.subject || '(sans sujet)'}
            message={m.message || ''}
            pied={`${m.email || '—'} · ${when(m.createdAt)}`}
          />
        ))}
        {!msgs.length && !error && <div className="card empty">Aucun message. (Le formulaire de contact in-app les enverra ici.)</div>}
      </div>
    </main>
  );
}
