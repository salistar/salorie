'use client';
// Toasts + modale de confirmation — API IMPÉRATIVE (pas de contexte à câbler).
// Remplace les dialogues natifs du navigateur :
//    alert('Erreur')            →  toast.err('Erreur')
//    if (confirm('Sûr ?')) {…}  →  if (await confirmDialog({ message: 'Sûr ?' })) {…}
// <Toaster /> est monté UNE fois dans app/layout.tsx.
import { useEffect, useState, useCallback } from 'react';

type Kind = 'ok' | 'err' | 'info';
type Item = { id: number; kind: Kind; text: string };
type ConfirmReq = {
  id: number;
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
};

const TOAST_EVT = 'salorie:toast';
const CONFIRM_EVT = 'salorie:confirm';
let seq = 0;

function emit(kind: Kind, text: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOAST_EVT, { detail: { id: ++seq, kind, text: String(text) } }));
}

/** Notifications non bloquantes (auto-fermées). */
export const toast = {
  ok: (text: string) => emit('ok', text),
  err: (text: string) => emit('err', text),
  info: (text: string) => emit('info', text),
};

/** Confirmation stylée. Renvoie true/false (remplace window.confirm). */
export function confirmDialog(opts: { title?: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(CONFIRM_EVT, { detail: { ...opts, id: ++seq, resolve } }));
  });
}

export default function Toaster() {
  const [items, setItems] = useState<Item[]>([]);
  const [ask, setAsk] = useState<ConfirmReq | null>(null);

  const remove = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);

  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent).detail as Item;
      setItems((l) => [...l, t]);
      setTimeout(() => remove(t.id), t.kind === 'err' ? 6000 : 3800);
    };
    const onConfirm = (e: Event) => setAsk((e as CustomEvent).detail as ConfirmReq);
    window.addEventListener(TOAST_EVT, onToast);
    window.addEventListener(CONFIRM_EVT, onConfirm);
    return () => {
      window.removeEventListener(TOAST_EVT, onToast);
      window.removeEventListener(CONFIRM_EVT, onConfirm);
    };
  }, [remove]);

  // Échap = annuler la confirmation (attendu clavier).
  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { ask.resolve(false); setAsk(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ask]);

  return (
    <>
      {/* aria-live : les lecteurs d'écran annoncent les messages */}
      <div className="toast-wrap" role="status" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span aria-hidden="true">{t.kind === 'ok' ? '✅' : t.kind === 'err' ? '⚠️' : 'ℹ️'}</span>
            <span>{t.text}</span>
            <button className="toast-x" onClick={() => remove(t.id)} aria-label="Fermer la notification">✕</button>
          </div>
        ))}
      </div>

      {ask && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cfm-title"
             onClick={() => { ask.resolve(false); setAsk(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="cfm-title">{ask.title || 'Confirmer'}</h3>
            <p>{ask.message}</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { ask.resolve(false); setAsk(null); }}>Annuler</button>
              <button
                className={`btn ${ask.danger ? 'btn-danger' : 'btn-primary'}`}
                autoFocus
                onClick={() => { ask.resolve(true); setAsk(null); }}
              >
                {ask.confirmLabel || 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
