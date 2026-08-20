'use client';

import { useEffect, useState } from 'react';

const PRIMARY = '#298f50';
const PRIMARY_DARK = '#1f6b3c';

type Langue = 'fr' | 'en' | 'ar';

/**
 * Formulaire de contact de salorie.com. Poste sur /api/contact, qui relaie
 * vers le tableau de bord de salistar.com.
 *
 * TRILINGUE, contrairement aux autres pages annexes (privacy, terms, refund)
 * qui sont en anglais : celles-la sont lues par Paddle et Polar pour la
 * conformite, celle-ci est lue par un utilisateur qui veut ecrire. Lui imposer
 * une langue etrangere au moment ou il signale un probleme, c'est le meilleur
 * moyen qu'il n'ecrive pas.
 *
 * La langue est detectee cote client (`navigator.language`) : le rendu initial
 * reste identique pour tout le monde, donc pas de desaccord d'hydratation, et
 * la page peut rester statique.
 */
const T: Record<Langue, Record<string, string>> = {
  fr: {
    nom: 'Nom',
    email: 'Email',
    sujet: 'Sujet',
    message: 'Ton message',
    envoyer: 'Envoyer le message',
    envoi: 'Envoi…',
    titreOk: 'Message envoyé',
    corpsOk: 'Nous répondons généralement sous 24 h, à l’adresse que tu as indiquée.',
    erreurGenerique: 'Envoi impossible. Réessaie dans un instant.',
    erreurReseau: 'Serveur injoignable. Écris-nous à support@salorie.com.',
  },
  en: {
    nom: 'Name',
    email: 'Email',
    sujet: 'Subject',
    message: 'Your message',
    envoyer: 'Send message',
    envoi: 'Sending…',
    titreOk: 'Message sent',
    corpsOk: 'We usually reply within 24 hours, to the address you provided.',
    erreurGenerique: 'Could not send. Please try again in a moment.',
    erreurReseau: 'Server unreachable. Write to support@salorie.com.',
  },
  ar: {
    nom: 'الاسم',
    email: 'البريد الإلكتروني',
    sujet: 'الموضوع',
    message: 'رسالتك',
    envoyer: 'إرسال الرسالة',
    envoi: '…جارٍ الإرسال',
    titreOk: 'تم إرسال الرسالة',
    corpsOk: 'نردّ عادةً خلال 24 ساعة على العنوان الذي أدخلته.',
    erreurGenerique: 'تعذّر الإرسال. حاول مرة أخرى بعد قليل.',
    erreurReseau: 'الخادم غير متاح. راسلنا على support@salorie.com.',
  },
};

export function ContactForm() {
  const [langue, setLangue] = useState<Langue>('fr');
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    const l = (navigator.language || 'fr').slice(0, 2).toLowerCase();
    if (l === 'ar' || l === 'en') setLangue(l);
  }, []);

  const t = T[langue];
  const rtl = langue === 'ar';

  async function soumettre(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    const d = new FormData(e.currentTarget);
    try {
      const r = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: d.get('name'),
          email: d.get('email'),
          subject: d.get('subject'),
          message: d.get('message'),
          website: d.get('website'),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        setErreur(data.error || t.erreurGenerique);
        return;
      }
      setEnvoye(true);
    } catch {
      setErreur(t.erreurReseau);
    } finally {
      setEnvoi(false);
    }
  }

  if (envoye) {
    return (
      <div
        dir={rtl ? 'rtl' : 'ltr'}
        style={{
          border: `1px solid ${PRIMARY}`,
          background: '#f0fdf4',
          borderRadius: 12,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <p style={{ fontWeight: 700, color: PRIMARY_DARK, marginBottom: 6 }}>{t.titreOk}</p>
        <p style={{ color: '#475569', fontSize: 14 }}>{t.corpsOk}</p>
      </div>
    );
  }

  const champ: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid #cbd5e1',
    fontSize: 15,
    fontFamily: 'inherit',
    marginBottom: 14,
    background: '#fff',
    color: '#1e293b',
    textAlign: rtl ? 'right' : 'left',
  };

  return (
    <form onSubmit={soumettre} dir={rtl ? 'rtl' : 'ltr'}>
      {/* Piege a robots : invisible, jamais annonce aux lecteurs d'ecran. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: -9999, width: 1, height: 1 }}
      />

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
        <input name="name" placeholder={t.nom} style={champ} />
        <input name="email" type="email" required placeholder={t.email} style={champ} />
      </div>

      <input name="subject" placeholder={t.sujet} style={champ} />

      <textarea
        name="message"
        required
        rows={6}
        minLength={10}
        placeholder={t.message}
        style={{ ...champ, resize: 'vertical' }}
      />

      {erreur && (
        <p style={{ color: '#b91c1c', fontSize: 14, marginBottom: 12 }} role="alert">
          {erreur}
        </p>
      )}

      <button
        type="submit"
        disabled={envoi}
        style={{
          width: '100%',
          padding: '13px 20px',
          borderRadius: 999,
          border: 'none',
          background: PRIMARY,
          color: '#fff',
          fontWeight: 700,
          fontSize: 15,
          cursor: envoi ? 'default' : 'pointer',
          opacity: envoi ? 0.65 : 1,
        }}
      >
        {envoi ? t.envoi : t.envoyer}
      </button>
    </form>
  );
}
