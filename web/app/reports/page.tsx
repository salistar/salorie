'use client';
// Traitement des SIGNALEMENTS UGC (exigence Google Play : le contenu utilisateur
// doit pouvoir être signalé ET modéré). L'app mobile écrit dans `reports` ;
// cette page est le SEUL endroit où ils sont lisibles (règles Firestore).
// Écrite avec le design system (.btn/.badge/.skeleton) — zéro style inline ad hoc.
import { useCallback, useEffect, useState } from 'react';
import { toast, confirmDialog } from '../Toaster';

type Report = {
  id: string;
  reporterId?: string;
  targetType?: string;
  targetId?: string;
  targetOwner?: string;
  reason?: string;
  note?: string;
  status?: string;
  at?: any;
};

const REASONS: Record<string, string> = {
  spam: 'Spam',
  inappropriate: 'Inapproprié / offensant',
  harassment: 'Harcèlement',
  scam: 'Arnaque ou fraude',
  false_info: 'Fausse information',
  other: 'Autre',
};
const TARGETS: Record<string, string> = {
  listing: '🛒 Annonce',
  feed: '📣 Activité du fil',
  user: '👤 Utilisateur',
  comment: '💬 Commentaire',
  route: '🗺️ Parcours',
};
// Motifs qui justifient un examen prioritaire.
const SEVERE = new Set(['harassment', 'scam', 'inappropriate']);

function when(ts: any): string {
  try {
    const ms = ts?._seconds ? ts._seconds * 1000 : ts?.seconds ? ts.seconds * 1000 : typeof ts === 'number' ? ts : Date.parse(ts);
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [scope, setScope] = useState<'pending' | 'all'>('pending');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    // Garde-fou client : même si le serveur ne répond pas, l'UI sort du skeleton.
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(`/api/reports?status=${scope}`, { cache: 'no-store', signal: ctrl.signal });
      const j = await r.json();
      if (j.error) setErr(j.error);
      else setReports(Array.isArray(j.reports) ? j.reports : []);
    } catch (e: any) {
      setErr(e?.name === 'AbortError' ? 'Le serveur ne répond pas (délai dépassé).' : e?.message || 'erreur réseau');
    } finally { clearTimeout(to); setLoading(false); }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const act = async (r: Report, action: 'resolve' | 'dismiss') => {
    const label = action === 'resolve' ? 'Marquer comme traité' : 'Classer sans suite';
    const ok = await confirmDialog({
      title: label,
      message: action === 'resolve'
        ? 'Confirme que tu as pris une mesure (contenu retiré, utilisateur averti…). Le signalement sera clos.'
        : 'Le signalement sera classé sans suite, sans action sur le contenu.',
      confirmLabel: label,
      danger: action === 'dismiss',
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, action }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setReports((cur) => cur.filter((x) => x.id !== r.id));
        toast.ok(action === 'resolve' ? 'Signalement traité.' : 'Signalement classé sans suite.');
      } else {
        toast.err(j.error || 'Échec de l’action.');
      }
    } catch (e: any) {
      toast.err(e?.message || 'Erreur réseau.');
    } finally { setBusy(null); }
  };

  return (
    <main className="container">
      <p className="foot"><a href="/">← Dashboard</a></p>
      <h1>Signalements</h1>
      <p className="page-desc">
        Contenus signalés par les utilisateurs depuis l’app (annonces, fil d’actualité, profils).
        Traiter les signalements est une <b>exigence Google Play</b> pour tout contenu généré par les
        utilisateurs. Les signalements ne sont lisibles que depuis ce back-office.
      </p>

      <div className="row" style={{ marginBottom: 16 }} role="group" aria-label="Filtrer les signalements">
        <button
          className={`btn btn-sm ${scope === 'pending' ? 'btn-primary' : 'btn-ghost'}`}
          aria-pressed={scope === 'pending'}
          onClick={() => setScope('pending')}
        >À traiter</button>
        <button
          className={`btn btn-sm ${scope === 'all' ? 'btn-primary' : 'btn-ghost'}`}
          aria-pressed={scope === 'all'}
          onClick={() => setScope('all')}
        >Tous</button>
        <button className="btn btn-sm btn-ghost" onClick={load} disabled={loading}>↻ Rafraîchir</button>
      </div>

      {err && <div className="msg msg-err" role="alert">⚠️ {err}</div>}

      {loading ? (
        <div aria-busy="true" aria-label="Chargement des signalements">
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
        </div>
      ) : !reports.length ? (
        <div className="card empty">
          {scope === 'pending' ? 'Aucun signalement à traiter. 🎉' : 'Aucun signalement enregistré.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {reports.map((r) => (
            <article key={r.id} className="card card-pad">
              <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
                <span className="badge">{TARGETS[r.targetType || ''] || r.targetType || '—'}</span>
                <span className={`badge ${SEVERE.has(r.reason || '') ? 'badge-danger' : 'badge-warn'}`}>
                  {REASONS[r.reason || ''] || r.reason || 'motif inconnu'}
                </span>
                {r.status && r.status !== 'pending' && (
                  <span className="badge badge-off">{r.status === 'resolved' ? 'Traité' : 'Classé'}</span>
                )}
                <span className="foot" style={{ margin: 0, marginLeft: 'auto' }}>{when(r.at)}</span>
              </div>

              {r.note ? <p style={{ marginBottom: 8 }}>« {r.note} »</p> : null}

              <dl className="foot" style={{ margin: 0, display: 'grid', gap: 2 }}>
                <div><b>Contenu visé :</b> <code>{r.targetId || '—'}</code></div>
                <div><b>Auteur du contenu :</b> <code>{r.targetOwner || '—'}</code></div>
                <div><b>Signalé par :</b> <code>{r.reporterId || '—'}</code></div>
              </dl>

              {r.status === 'pending' && (
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn-sm btn-primary" disabled={busy === r.id} onClick={() => act(r, 'resolve')}>
                    ✅ Traité (mesure prise)
                  </button>
                  <button className="btn btn-sm btn-ghost" disabled={busy === r.id} onClick={() => act(r, 'dismiss')}>
                    Classer sans suite
                  </button>
                  {r.targetType === 'listing' && (
                    <a className="btn btn-sm btn-ghost" href="/marketplace">→ Voir le marketplace</a>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <p className="foot" style={{ marginTop: 18 }}>Salorie Admin · modération UGC · Firestore en direct</p>
    </main>
  );
}
