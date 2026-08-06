'use client';
import { useEffect, useState } from 'react';

type Provider = { key: string; label: string; hint: string };
type Status = Record<string, { set: boolean; masked?: string }>;
type Etat = {
  key: string; label: string; configuree: boolean;
  valide: boolean | null; solde: string | null; detail: string;
};

export default function AiKeysPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [status, setStatus] = useState<Status>({});
  const [vals, setVals] = useState<Record<string, string>>({});
  // Une clé enregistrée est VERROUILLÉE : on ne peut la remplacer qu'après avoir cliqué
  // « Modifier ». Sans ce cran, un champ actif à côté d'une clé en production invite à la
  // frappe accidentelle — et l'écrasement d'une clé de production est silencieux.
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [etats, setEtats] = useState<Etat[]>([]);
  const [creditsEnCours, setCreditsEnCours] = useState(false);
  const [verifieLe, setVerifieLe] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/ai-keys', { cache: 'no-store' });
      const j = await r.json();
      setProviders(j.providers || []);
      setStatus(j.status || {});
    } catch { setMsg('Erreur de chargement'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const verifierCredits = async () => {
    setCreditsEnCours(true);
    try {
      const r = await fetch('/api/ai-keys/credits', { cache: 'no-store' });
      const j = await r.json();
      setEtats(j.etats || []);
      setVerifieLe(j.verifieLe || Date.now());
    } catch { setMsg('Vérification des crédits impossible'); }
    setCreditsEnCours(false);
  };

  const save = async () => {
    // On n'envoie QUE les champs remplis (pour ne pas écraser une clé déjà posée avec du vide).
    const keys: Record<string, string> = {};
    for (const [k, v] of Object.entries(vals)) { if (v && v.trim()) keys[k] = v.trim(); }
    if (!Object.keys(keys).length) { setMsg('Rien à enregistrer — colle au moins une clé.'); return; }
    setSaving(true); setMsg('');
    try {
      const r = await fetch('/api/ai-keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
      });
      const j = await r.json();
      if (j.ok) {
        setStatus(j.status || {});
        setVals({});
        setOuverts({});           // tout se reverrouille après l'enregistrement
        setMsg('✅ Clés enregistrées et verrouillées. Le backend les utilisera automatiquement.');
      } else setMsg(j.error || 'Erreur');
    } catch { setMsg('Erreur réseau'); }
    setSaving(false);
  };

  const clearOne = async (key: string) => {
    setSaving(true); setMsg('');
    try {
      const r = await fetch('/api/ai-keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: { [key]: '' } }),
      });
      const j = await r.json();
      if (j.ok) {
        setStatus(j.status || {});
        setOuverts((o) => ({ ...o, [key]: false }));
        setMsg('Clé retirée.');
      }
    } catch { setMsg('Erreur'); }
    setSaving(false);
  };

  const etatDe = (k: string) => etats.find((e) => e.key === k);

  return (
    <div style={S.wrap}>
      <h1 style={S.h1}>🔑 Clés IA (providers LLM)</h1>
      <p style={S.sub}>
        Colle tes clés API ici. Elles sont stockées de façon sécurisée (Firestore verrouillé,
        jamais lisible par l'app mobile) et le <b>Coach IA</b> les utilise automatiquement, avec
        repli d'un provider à l'autre. Une clé enregistrée est <b>verrouillée</b> : clique
        « Modifier » pour la remplacer.
      </p>

      {loading ? <div style={S.muted}>Chargement…</div> : (
        <>
          <div style={S.grid}>
            {providers.map((p) => {
              const st = status[p.key] || { set: false };
              const verrouille = st.set && !ouverts[p.key];
              const e = etatDe(p.key);
              return (
                <div key={p.key} style={S.card}>
                  <div style={S.row}>
                    <label style={S.label}>{p.label}</label>
                    {st.set
                      ? <span style={S.badgeOk}>✔ configurée {st.masked}</span>
                      : <span style={S.badgeNo}>non configurée</span>}
                  </div>

                  {verrouille ? (
                    <div style={S.locked}>
                      <span style={S.lockedTxt}>🔒 {st.masked} — enregistrée</span>
                      <button style={S.update} onClick={() => setOuverts((o) => ({ ...o, [p.key]: true }))}>
                        Modifier
                      </button>
                    </div>
                  ) : (
                    <input
                      style={S.input}
                      type="password"
                      autoComplete="new-password"
                      placeholder={st.set ? 'colle la NOUVELLE clé' : p.hint}
                      value={vals[p.key] || ''}
                      onChange={(e2) => setVals((v) => ({ ...v, [p.key]: e2.target.value }))}
                    />
                  )}

                  {/* Résultat de la sonde, sous la clé concernée */}
                  {e && e.configuree && (
                    <div style={S.probe}>
                      {e.valide === true && <span style={S.ok}>clé valide</span>}
                      {e.valide === false && <span style={S.ko}>clé refusée</span>}
                      {e.valide === null && <span style={S.unk}>non testable</span>}
                      {e.solde && <b style={S.solde}>{e.solde}</b>}
                      {e.detail && <span style={S.detail}>{e.detail}</span>}
                    </div>
                  )}

                  {st.set && !verrouille && (
                    <button style={S.clear} onClick={() => clearOne(p.key)} disabled={saving}>Retirer</button>
                  )}
                </div>
              );
            })}
          </div>

          <div style={S.footer}>
            <button style={{ ...S.save, opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer les clés'}
            </button>
            {msg && <span style={S.msg}>{msg}</span>}
          </div>

          {/* ── CRÉDITS ─────────────────────────────────────────────────────── */}
          <div style={S.creditsBox}>
            <div style={S.row}>
              <h2 style={S.h2}>💳 Crédits & validité des clés</h2>
              <button
                style={{ ...S.check, opacity: creditsEnCours ? 0.6 : 1 }}
                onClick={verifierCredits}
                disabled={creditsEnCours}
              >
                {creditsEnCours ? 'Vérification…' : 'Vérifier maintenant'}
              </button>
            </div>
            <p style={S.note}>
              Sur les neuf providers, <b>deux seulement exposent un solde</b> interrogeable
              (DeepSeek et Moonshot). Pour les autres, on teste la <b>validité</b> de la clé —
              ce qui suffit à repérer une clé morte ou révoquée avant qu'elle ne casse le Coach.
            </p>

            {etats.length === 0 ? (
              <div style={S.muted}>Aucune vérification effectuée pour le moment.</div>
            ) : (
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Provider</th>
                    <th style={S.th}>État</th>
                    <th style={S.th}>Solde</th>
                    <th style={S.th}>Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {etats.map((e) => (
                    <tr key={e.key}>
                      <td style={S.td}><b>{e.label}</b></td>
                      <td style={S.td}>
                        {!e.configuree ? <span style={S.unk}>—</span>
                          : e.valide === true ? <span style={S.ok}>valide</span>
                          : e.valide === false ? <span style={S.ko}>refusée</span>
                          : <span style={S.unk}>non testable</span>}
                      </td>
                      <td style={S.td}>{e.solde ? <b>{e.solde}</b> : <span style={S.unk}>—</span>}</td>
                      <td style={{ ...S.td, color: '#64748b' }}>{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {verifieLe && (
              <p style={S.note}>Dernière vérification : {new Date(verifieLe).toLocaleString('fr-FR')}</p>
            )}
          </div>

          <p style={S.note}>
            Ordre d'usage du Coach : Anthropic → DeepSeek → Qwen → OpenAI → … → Cloudflare (gratuit, repli).
            Configurable côté serveur via <code>LLM_TEXT_ORDER</code>. Ne mets jamais ces clés dans GitHub.
          </p>
        </>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 900, padding: '8px 4px' },
  h1: { fontSize: 26, fontWeight: 800, color: '#0F172A', margin: '4px 0 6px' },
  h2: { fontSize: 18, fontWeight: 800, color: '#0F172A', margin: 0 },
  sub: { color: '#475569', fontSize: 14, lineHeight: 1.5, marginBottom: 18 },
  muted: { color: '#94a3b8', fontSize: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 14 },
  card: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { fontWeight: 700, color: '#0F172A', fontSize: 14 },
  badgeOk: { fontSize: 12, fontWeight: 700, color: '#166534', background: '#DCFCE7', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' },
  badgeNo: { fontSize: 12, fontWeight: 700, color: '#64748b', background: '#F1F5F9', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' },
  input: { padding: '11px 12px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14, outline: 'none', fontFamily: 'monospace' },
  locked: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 12px', borderRadius: 10, border: '1px dashed #CBD5E1', background: '#F8FAFC' },
  lockedTxt: { fontFamily: 'monospace', fontSize: 13, color: '#475569' },
  update: { background: '#0F172A', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  probe: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 },
  ok: { color: '#166534', fontWeight: 700 },
  ko: { color: '#B42318', fontWeight: 700 },
  unk: { color: '#94a3b8', fontWeight: 600 },
  solde: { color: '#0F172A' },
  detail: { color: '#64748b' },
  clear: { alignSelf: 'flex-start', background: 'none', border: 'none', color: '#B42318', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 },
  footer: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 20 },
  save: { padding: '13px 24px', borderRadius: 12, border: 'none', background: '#2E8B57', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer' },
  check: { padding: '9px 16px', borderRadius: 10, border: '1px solid #CBD5E1', background: '#fff', color: '#0F172A', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  msg: { fontSize: 14, color: '#0F172A', fontWeight: 600 },
  creditsBox: { marginTop: 26, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 },
  th: { textAlign: 'left', padding: '8px 6px', borderBottom: '2px solid #E2E8F0', color: '#475569', fontSize: 12 },
  td: { padding: '9px 6px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'top' },
  note: { marginTop: 12, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 },
};
