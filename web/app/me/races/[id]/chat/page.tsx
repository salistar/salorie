'use client';
// Salon d'une course — messages en temps réel.
// ---------------------------------------------------------------------------
// Le seul écran du portage qui demandait de l'INFRASTRUCTURE et pas seulement
// une page : Socket.IO n'existait pas côté web. La dépendance est ajoutée, et
// `lib/socketSocial.ts` reprend le protocole du mobile événement par événement.
//
// Usage réel assumé : on ne court pas devant un ordinateur. Ce salon sert avant
// la course (s'organiser) et après (commenter) — et à suivre une course depuis
// chez soi pendant qu'un proche la fait.
//
// Ce que la page NE fait PAS : envoyer des photos. Le mobile le permet
// (`race:msg` accepte une image en base64). Ici, une photo passerait par le
// même canal sans qu'aucune modération ne soit visible côté web ; le
// signalement, lui, est en place.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMe } from '../../../MeProvider';
import { useProfil } from '../../../../../lib/useFirestoreMe';
import { traducteur, sensLecture, locale, type Langue } from '../../../../../lib/i18nMe';
import {
  connecterSocial, deconnecterSocial, rejoindreCourse, quitterCourse,
  envoyerMessage, signalerMessage, socialConfigure, type MessageCourse,
} from '../../../../../lib/socketSocial';

export default function PageChatCourse() {
  const params = useParams<{ id: string }>();
  const raceId = String(params?.id || '');
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [messages, setMessages] = useState<MessageCourse[]>([]);
  const [texte, setTexte] = useState('');
  const [etat, setEtat] = useState<'connexion' | 'ouvert' | 'ferme'>('connexion');
  const [refus, setRefus] = useState('');
  const finListe = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!raceId || !uid) return;
    let vivant = true;

    (async () => {
      const s = await connecterSocial();
      if (!vivant) return;
      if (!s) { setEtat('ferme'); return; }

      s.on('connect', () => { setEtat('ouvert'); rejoindreCourse(raceId, langue); });
      s.on('disconnect', () => setEtat('connexion'));

      s.on('race:historique', (d: { raceId: string; messages: MessageCourse[] }) => {
        // Le serveur diffuse l'historique de CHAQUE salon rejoint : sans ce
        // filtre, ouvrir deux courses melangerait leurs messages.
        if (d?.raceId === raceId) setMessages(Array.isArray(d.messages) ? d.messages : []);
      });
      s.on('race:msg', (m: MessageCourse) => {
        if (!m?.id) return;
        // Deduplication par id : une reconnexion peut rejouer un message deja
        // affiche, et le voir deux fois donne l'impression d'un bug.
        setMessages((liste) => (liste.some((x) => x.id === m.id) ? liste : [...liste, m]));
      });
      s.on('race:retire', (d: { id: string }) => {
        setMessages((liste) => liste.filter((m) => m.id !== d?.id));
      });
      s.on('race:refus', (d: { message: string }) => setRefus(String(d?.message || '')));

      if (s.connected) { setEtat('ouvert'); rejoindreCourse(raceId, langue); }
    })();

    return () => {
      vivant = false;
      quitterCourse(raceId);
      // On coupe vraiment la connexion : laissee ouverte, elle continue de
      // recevoir les messages d'un salon qu'on a quitte.
      deconnecterSocial();
    };
  }, [raceId, uid, langue]);

  // Auto-défilement vers le bas à chaque message, comme n'importe quelle
  // messagerie — sans quoi les nouveaux messages arrivent hors de l'écran.
  useEffect(() => {
    finListe.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const envoyer = useCallback(() => {
    const v = texte.trim();
    if (!v || etat !== 'ouvert') return;
    envoyerMessage(raceId, v.slice(0, 500));
    setTexte('');
    setRefus('');
  }, [texte, etat, raceId]);

  const tries = useMemo(
    () => [...messages].sort((a, b) => (a.ts || 0) - (b.ts || 0)),
    [messages],
  );

  const heure = (ts: number) =>
    Number.isFinite(ts) && ts > 0
      ? new Date(ts).toLocaleTimeString(locale(langue), { hour: '2-digit', minute: '2-digit' })
      : '';

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('chatTitre')}</h1>
        <p className="me-sous">{t('chatSous')}</p>
      </header>

      {!socialConfigure() ? (
        <section className="carte-amis"><p className="me-erreur">{t('chatPasDeBackend')}</p></section>
      ) : etat === 'ferme' ? (
        <section className="carte-amis"><p className="me-erreur">{t('chatConnexionImpossible')}</p></section>
      ) : null}

      <section className="carte-amis">
        <div className="chat-fil" role="log" aria-live="polite">
          {etat === 'connexion' ? (
            <p className="me-sous">{t('chatConnexion')}</p>
          ) : tries.length === 0 ? (
            <p className="me-sous">{t('chatVide')}</p>
          ) : (
            tries.map((m) => (
              <div key={m.id} className={`chat-msg${m.auteur === uid ? ' moi' : ''}`}>
                <div className="ligne-champ" style={{ justifyContent: 'space-between', gap: 10 }}>
                  <strong className="chat-auteur">{m.auteurNom || t('chatQuelquun')}</strong>
                  <span className="me-note">{heure(m.ts)}</span>
                </div>
                {m.text ? <p className="chat-texte">{m.text}</p> : null}
                {m.auteur !== uid ? (
                  <button className="chat-signaler" onClick={() => signalerMessage(m.id)}>
                    {t('chatSignaler')}
                  </button>
                ) : null}
              </div>
            ))
          )}
          <div ref={finListe} />
        </div>

        {refus ? <p className="me-erreur">{refus}</p> : null}

        <div className="ligne-champ" style={{ marginTop: 8 }}>
          <input
            className="champ-amis" style={{ flex: '1 1 260px' }}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && envoyer()}
            placeholder={t('chatEcrire')}
            aria-label={t('chatEcrire')}
            maxLength={500}
            disabled={etat !== 'ouvert'}
          />
          <button className="btn btn-primary" onClick={envoyer} disabled={!texte.trim() || etat !== 'ouvert'}>
            {t('chatEnvoyer')}
          </button>
        </div>
        <p className="me-note">{t('chatNotePhotos')}</p>
      </section>
    </div>
  );
}
