'use client';

// Bibliotheque de composants Salorie — web.
// ---------------------------------------------------------------------------
// Le web n'en avait AUCUN : les 101 pages reecrivaient chacune leurs boutons et
// leurs cartes. C'est le meme mecanisme qui a produit les 1 843 hexadecimaux du
// mobile — faute d'une piece commune, chacun refait la sienne, un peu differente.
//
// Regle de la maison : ces composants ne contiennent AUCUNE couleur en dur. Tout
// vient des variables de themes.generated.css, elles-memes generees depuis
// design/themes.json. Un composant qui ecrit un hexadecimal casse les six
// themes d'un coup.

import React from 'react';
import './ui.css';

/* ══ Bouton ═══════════════════════════════════════════════════════════════ */

type Ton = 'primary' | 'gradient' | 'secondary' | 'ghost' | 'danger';

export function Bouton({
  ton = 'primary', grand = false, bloc = false, className = '', ...reste
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { ton?: Ton; grand?: boolean; bloc?: boolean }) {
  const c = ['sui-btn', `sui-btn--${ton}`, grand && 'sui-btn--lg', bloc && 'sui-btn--bloc', className];
  return <button className={c.filter(Boolean).join(' ')} {...reste} />;
}

/** Meme apparence, mais c'est un lien — donc navigable, ouvrable en nouvel
 *  onglet, et annonce comme un lien par un lecteur d'ecran. Un <button> qui
 *  navigue prive l'utilisateur de tout cela. */
export function LienBouton({
  ton = 'primary', grand = false, bloc = false, className = '', ...reste
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { ton?: Ton; grand?: boolean; bloc?: boolean }) {
  const c = ['sui-btn', `sui-btn--${ton}`, grand && 'sui-btn--lg', bloc && 'sui-btn--bloc', className];
  return <a className={c.filter(Boolean).join(' ')} {...reste} />;
}

/* ══ Puce ═════════════════════════════════════════════════════════════════ */

export function Puce({
  ton, children, className = '', ...reste
}: React.HTMLAttributes<HTMLSpanElement> & { ton?: 'accent' | 'succes' | 'alerte' | 'danger' }) {
  const c = ['sui-chip', ton && `sui-chip--${ton}`, className];
  return <span className={c.filter(Boolean).join(' ')} {...reste}>{children}</span>;
}

/* ══ Carte ════════════════════════════════════════════════════════════════ */

export function Carte({
  eleve = false, compacte = false, className = '', ...reste
}: React.HTMLAttributes<HTMLDivElement> & { eleve?: boolean; compacte?: boolean }) {
  const c = ['sui-card', eleve && 'sui-card--elev', compacte && 'sui-card--compacte', className];
  return <div className={c.filter(Boolean).join(' ')} {...reste} />;
}

/* ══ Saisie ═══════════════════════════════════════════════════════════════ */

let compteurId = 0;

export function Champ({
  label, erreur, id, ...reste
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; erreur?: string }) {
  // Un id stable est indispensable : sans `htmlFor`, un lecteur d'ecran annonce
  // « champ de saisie » sans dire lequel, et un gestionnaire de mots de passe ne
  // sait ni reconnaitre le formulaire ni le remplir.
  const auto = React.useMemo(() => id || `sui-champ-${++compteurId}`, [id]);
  const idErr = erreur ? `${auto}-err` : undefined;
  return (
    <div className="sui-champ">
      <label className="sui-label" htmlFor={auto}>{label}</label>
      <input
        id={auto}
        className="sui-input"
        aria-invalid={erreur ? 'true' : undefined}
        aria-describedby={idErr}
        {...reste}
      />
      {!!erreur && <span className="sui-erreur" id={idErr} role="alert">{erreur}</span>}
    </div>
  );
}

/* ══ Statistique ══════════════════════════════════════════════════════════ */

export function Stat({ valeur, label }: { valeur: React.ReactNode; label: string }) {
  return (
    <div className="sui-stat">
      <span className="sui-stat__valeur">{valeur}</span>
      <span className="sui-stat__label">{label}</span>
    </div>
  );
}

export function CarteStat({ valeur, label, ...reste }: { valeur: React.ReactNode; label: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <Carte compacte {...reste}><Stat valeur={valeur} label={label} /></Carte>;
}

/* ══ Etat vide ════════════════════════════════════════════════════════════ */

export function EtatVide({ icone = '🍽️', titre, texte, action }: {
  icone?: React.ReactNode; titre: string; texte?: string; action?: React.ReactNode;
}) {
  return (
    <div className="sui-vide">
      <div className="sui-vide__icone" aria-hidden="true">{icone}</div>
      <p className="sui-vide__titre">{titre}</p>
      {!!texte && <p className="sui-vide__texte">{texte}</p>}
      {!!action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

/* ══ Bandeau hors-ligne ═══════════════════════════════════════════════════ */

export function BandeauHorsLigne({ texte = 'Hors ligne — les modifications partiront au retour du réseau.' }) {
  const [horsLigne, setHorsLigne] = React.useState(false);
  React.useEffect(() => {
    // Lu au montage ET ecoute : un onglet ouvert hors ligne depuis le debut ne
    // recevrait jamais l'evenement `offline`, et le bandeau ne s'afficherait pas.
    const maj = () => setHorsLigne(!navigator.onLine);
    maj();
    window.addEventListener('online', maj);
    window.addEventListener('offline', maj);
    return () => { window.removeEventListener('online', maj); window.removeEventListener('offline', maj); };
  }, []);
  if (!horsLigne) return null;
  return <div className="sui-horsligne" role="status">⚠ {texte}</div>;
}

/* ══ Toasts ═══════════════════════════════════════════════════════════════ */

type Toast = { id: number; texte: string; ton?: 'danger' | 'succes' };
const CtxToast = React.createContext<(texte: string, ton?: Toast['ton']) => void>(() => {});

/** À placer une fois, haut dans l'arbre. `useToast()` sert ensuite partout. */
export function FournisseurToasts({ children }: { children: React.ReactNode }) {
  const [liste, setListe] = React.useState<Toast[]>([]);
  const pousser = React.useCallback((texte: string, ton?: Toast['ton']) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setListe((l) => [...l, { id, texte, ton }]);
    setTimeout(() => setListe((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <CtxToast.Provider value={pousser}>
      {children}
      {/* `aria-live=polite` : annonce sans couper ce que l'utilisateur ecoute. */}
      <div className="sui-toasts" aria-live="polite">
        {liste.map((t) => (
          <div key={t.id} className={'sui-toast' + (t.ton ? ` sui-toast--${t.ton}` : '')}>{t.texte}</div>
        ))}
      </div>
    </CtxToast.Provider>
  );
}

export const useToast = () => React.useContext(CtxToast);

/* ══ Squelette ════════════════════════════════════════════════════════════ */

export function Squelette({ hauteur = 16, largeur = '100%', rayon = 12 }: {
  hauteur?: number | string; largeur?: number | string; rayon?: number;
}) {
  return <div className="sui-skel" style={{ height: hauteur, width: largeur, borderRadius: rayon }} aria-hidden="true" />;
}
