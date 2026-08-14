import { getEmail, setRead } from '../../../lib/supportMail';

export const dynamic = 'force-dynamic';

function when(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// Détail d'un email : affiche le TEXTE uniquement — le HTML des expéditeurs
// n'est jamais rendu (XSS) ; il reste consultable en source escapée.
export default async function EmailDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const mail = await getEmail(id);
  if (mail && !mail.read) await setRead(id, true);

  if (!mail) {
    return (
      <main className="container">
        <p className="foot"><a href="/emails" style={{ color: '#2E8B57' }}>← Emails support</a></p>
        <div className="card empty">Email introuvable.</div>
      </main>
    );
  }

  return (
    <main className="container">
      <p className="foot"><a href="/emails" style={{ color: '#2E8B57' }}>← Emails support</a></p>
      <h2 style={{ overflowWrap: 'anywhere' }}>{mail.subject || '(sans sujet)'}</h2>
      <p className="foot" style={{ overflowWrap: 'anywhere' }}>
        De : <strong>{mail.fromName ? `${mail.fromName} <${mail.from}>` : mail.from}</strong>
        {mail.to ? <> · À : {mail.to}</> : null} · {when(mail.createdAt)}{typeof mail.size === 'number' && mail.size > 0 ? ` · ${(mail.size / 1024).toFixed(0)} Ko` : ''}
      </p>

      <div className="card" style={{ padding: 18, marginTop: 12 }}>
        {mail.text
          ? <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 14.5, lineHeight: 1.65 }}>{mail.text}</div>
          : <div className="foot">(pas de version texte)</div>}
      </div>

      {mail.html && (
        <details style={{ marginTop: 14 }}>
          <summary className="foot" style={{ cursor: 'pointer' }}>Source HTML (escapée, jamais rendue)</summary>
          <div className="card" style={{ padding: 14, marginTop: 8, maxHeight: 420, overflow: 'auto' }}>
            <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{mail.html}</pre>
          </div>
        </details>
      )}
    </main>
  );
}
