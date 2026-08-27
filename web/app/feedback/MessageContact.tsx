// Un message de contact — et, quand c'en est un, un rapport de plantage REPLIE.
//
// POURQUOI
// La page deroulait les traces d'exécution en clair : quatre rapports
// `[CRASH]` de 40 lignes chacun, avec adresses memoire et pile d'appels.
// Consequence concrete : les vrais messages d'utilisateurs etaient noyes, et
// il fallait faire defiler plusieurs ecrans pour voir s'il y en avait.
//
// ⚠ RIEN N'EST MASQUE. Le rapport reste entier, a un clic. Un back-office qui
// cache une information technique est pire qu'un back-office qui la deroule :
// on ne peut plus diagnostiquer. On la RANGE, on ne la supprime pas.
//
// `<details>` plutot qu'un etat React : fonctionne sans JavaScript, se plie au
// clavier, et s'annonce correctement aux lecteurs d'ecran — gratuitement.

const MOTIFS_TECHNIQUES = /^\s*\[(CRASH|LOGS?|DIAG)\]/i;

/** La ligne qui dit REELLEMENT ce qui s'est passe, extraite de la trace. */
function ligneUtile(message: string): string | null {
  for (const l of message.split('\n')) {
    const t = l.trim();
    // On saute les cadres de pile (`at ...`) et les entetes de section : ce
    // qu'on cherche, c'est le message d'erreur lui-meme.
    if (!t || t.startsWith('at ') || t.startsWith('---')) continue;
    if (/error|exception|not supported|failed|cannot/i.test(t)) return t.slice(0, 160);
  }
  const premiere = message.split('\n').map((s) => s.trim()).find(Boolean);
  return premiere ? premiere.slice(0, 160) : null;
}

export default function MessageContact({ sujet, message, pied }: {
  sujet: string; message: string; pied: string;
}) {
  const technique = MOTIFS_TECHNIQUES.test(sujet) || message.split('\n').length > 12;

  if (!technique) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700 }}>{sujet}</div>
        {/* `var(--text-muted)` et non `#475569` : une couleur en dur ici
            resterait grise sur les six themes, y compris les sombres. */}
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {message}
        </div>
        <div className="foot" style={{ marginTop: 6 }}>{pied}</div>
      </div>
    );
  }

  const resume = ligneUtile(message);
  const lignes = message.split('\n').length;

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700 }}>{sujet}</span>
        <span style={{
          fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
          background: 'var(--surface2)', color: 'var(--warning)', border: '1px solid var(--warning)',
        }}>
          rapport technique
        </span>
      </div>

      {!!resume && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, overflowWrap: 'anywhere' }}>
          {resume}
        </div>
      )}

      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}>
          Voir la trace complète ({lignes} lignes)
        </summary>
        <pre style={{
          marginTop: 8, marginBottom: 0, fontSize: 11, lineHeight: 1.45,
          color: 'var(--text-muted)', background: 'var(--surface2)',
          padding: 12, borderRadius: 10,
          // La trace defile DANS son cadre : sans cela, une seule ligne longue
          // pousse toute la page en largeur.
          overflowX: 'auto', whiteSpace: 'pre', maxHeight: 340, overflowY: 'auto',
        }}>
          {message}
        </pre>
      </details>

      <div className="foot" style={{ marginTop: 6 }}>{pied}</div>
    </div>
  );
}
