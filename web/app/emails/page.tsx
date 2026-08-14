import { listEmails } from '../../lib/supportMail';

export const dynamic = 'force-dynamic';

function when(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// Boîte de réception support@salorie.com (Cloudflare Email Routing → Worker →
// POST /support-mail/ingest → Mongo). Une copie de chaque mail part aussi vers
// le Gmail du compte, cette page est la vue de travail.
export default async function EmailsPage() {
  let rows: Awaited<ReturnType<typeof listEmails>> = [];
  let error: string | null = null;
  try { rows = await listEmails(); } catch (e: any) { error = e?.message || String(e); }
  const unread = rows.filter((r) => !r.read).length;

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>📬 Emails support ({rows.length}{unread ? ` · ${unread} non lus` : ''})</h2>
      <p className="foot">Tout ce qui arrive sur <strong>support@salorie.com</strong>. Une copie est aussi transférée sur le Gmail du compte.</p>
      {error && <div className="card empty">⚠️ {error}</div>}

      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {rows.map((m) => (
          <a key={m._id} href={`/emails/${m._id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'baseline', borderLeft: m.read ? undefined : '4px solid #2E8B57' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: m.read ? 500 : 800, overflowWrap: 'anywhere' }}>
                  {!m.read && <span style={{ color: '#2E8B57', marginRight: 6 }}>●</span>}
                  {m.subject || '(sans sujet)'}
                </div>
                <div className="foot" style={{ marginTop: 4, overflowWrap: 'anywhere' }}>
                  {m.fromName ? `${m.fromName} <${m.from}>` : m.from}
                </div>
              </div>
              <div className="foot" style={{ whiteSpace: 'nowrap' }}>{when(m.createdAt)}</div>
            </div>
          </a>
        ))}
        {!rows.length && !error && (
          <div className="card empty">Aucun email reçu pour l'instant. Envoie un mail à support@salorie.com pour tester.</div>
        )}
      </div>
    </main>
  );
}
