'use client';
// Notifications — l'historique de ce que l'application a envoyé.
// ---------------------------------------------------------------------------
// Sur un téléphone, une notification manquée est difficile à retrouver. Ici
// l'historique complet tient à l'écran, et les non-lues se repèrent d'un coup
// d'œil au lieu de se chercher.
//
// La lecture MARQUE comme lu, comme sur mobile — mais seulement au clic, pas à
// l'affichage : ouvrir la page ne doit pas faire disparaître le repère visuel
// de tout ce qu'on n'a pas encore regardé.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, locale, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';

type Notif = { id: string; title?: string; body?: string; read?: boolean; timestamp?: any; type?: string };

export default function PageNotifications() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [charge, setCharge] = useState(false);
  const [filtreNonLues, setFiltreNonLues] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(firestore(), 'users', uid, 'notifications_history'),
      orderBy('timestamp', 'desc'),
      limit(120),
    );
    const stop = onSnapshot(
      q,
      (snap) => {
        setNotifs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as Notif[]);
        setCharge(true);
      },
      () => setCharge(true),
    );
    return () => stop();
  }, [uid]);

  const marquerLu = useCallback(async (n: Notif) => {
    if (!uid || n.read) return;
    try {
      await updateDoc(doc(firestore(), 'users', uid, 'notifications_history', n.id), { read: true });
    } catch {
      // Echec silencieux : la notification reste non lue, ce qui est le bon
      // comportement par defaut — on ne perd rien.
    }
  }, [uid]);

  const nonLues = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);
  const visibles = useMemo(
    () => (filtreNonLues ? notifs.filter((n) => !n.read) : notifs),
    [notifs, filtreNonLues],
  );

  const quand = (ts: any) => {
    // `timestamp` est un Timestamp Firestore cote mobile, parfois un nombre.
    const ms = typeof ts?.toMillis === 'function' ? ts.toMillis() : Number(ts);
    if (!Number.isFinite(ms)) return '';
    return new Date(ms).toLocaleString(locale(langue), {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('notifTitre')}</h1>
        <p className="me-sous">{t('notifSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ">
          <button
            className={`btn ${filtreNonLues ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFiltreNonLues((v) => !v)}
          >
            {t('notifNonLues')} ({nonLues})
          </button>
        </div>
      </section>

      <section className="carte-amis">
        {!charge ? (
          <p className="me-sous">{t('communChargement')}</p>
        ) : visibles.length === 0 ? (
          <p className="me-sous">{filtreNonLues ? t('notifToutLu') : t('notifAucune')}</p>
        ) : (
          <ul className="liste-nue">
            {visibles.map((n) => (
              <li key={n.id}>
                <button
                  className={`notif-ligne${n.read ? '' : ' non-lue'}`}
                  onClick={() => marquerLu(n)}
                  aria-label={n.read ? undefined : t('notifMarquerLu')}
                >
                  <span className="notif-titre">{n.title || '—'}</span>
                  {n.body ? <span className="me-sous">{n.body}</span> : null}
                  <span className="me-note">{quand(n.timestamp)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="carte-amis">
        <p className="me-note">{t('notifNoteLecture')}</p>
      </section>
    </div>
  );
}
