'use client';
// Ecrire au support, proposer une idee.
// ---------------------------------------------------------------------------
// Personne n'ecrit un retour construit au pouce. Le peu de retours recus vient
// peut-etre d'abord de la — un champ de texte sur telephone decourage tout ce qui
// depasse trois phrases, et c'est justement au-dela de trois phrases qu'un retour
// devient utile.
import { useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

type Genre = 'support' | 'idee';

export default function PageContact() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [genre, setGenre] = useState<Genre>('support');
  const [sujet, setSujet] = useState('');
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [etat, setEtat] = useState<'' | 'ok' | 'erreur'>('');

  const envoyer = async () => {
    const m = message.trim();
    if (!m || !uid || occupe) return;
    setOccupe(true);
    setEtat('');
    try {
      if (genre === 'idee') {
        // Les idees vont dans une collection PARTAGEE : on peut les compter et
        // voir ce qui revient. Un message de support, non — il est personnel.
        await addDoc(collection(firestore(), 'feature_requests'), {
          uid,
          title: sujet.trim().slice(0, 120) || m.slice(0, 60),
          description: m.slice(0, 2000),
          votes: 0,
          status: 'nouveau',
          createdAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(firestore(), 'users', uid, 'contact_messages'), {
          email: uid,
          subject: sujet.trim().slice(0, 120) || t('contactSansSujet'),
          message: m.slice(0, 4000),
          createdAt: serverTimestamp(),
        });
      }
      setSujet('');
      setMessage('');
      setEtat('ok');
    } catch {
      setEtat('erreur');
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('contactTitre')}</h1>
        <p className="me-sous">{t('contactSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ">
          {/* Deux boutons plutot qu'un menu deroulant : avec deux choix, un menu
              cache la moitie de l'information derriere un clic. */}
          {(['support', 'idee'] as Genre[]).map((g) => (
            <button
              key={g}
              className={`btn ${genre === g ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setGenre(g)}
              aria-pressed={genre === g}
            >
              {t(`contactGenre_${g}`)}
            </button>
          ))}
        </div>

        <input
          className="champ-amis"
          style={{ width: '100%', marginTop: 12 }}
          value={sujet}
          onChange={(e) => setSujet(e.target.value.slice(0, 120))}
          placeholder={t('contactSujet')}
          aria-label={t('contactSujet')}
        />

        <textarea
          className="champ-mur"
          style={{ marginTop: 10, minHeight: 180 }}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
          placeholder={t(genre === 'idee' ? 'contactIdeePlaceholder' : 'contactMessagePlaceholder')}
          aria-label={t('contactMessage')}
        />

        <div className="ligne-champ" style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={envoyer} disabled={!message.trim() || occupe}>
            {occupe ? t('contactEnvoi') : t('contactEnvoyer')}
          </button>
          <span className="me-sous">{message.length} / 4000</span>
        </div>

        {etat === 'ok' ? <p className="me-note">{t('contactMerci')}</p> : null}
        {etat === 'erreur' ? <p className="me-erreur">{t('contactErreur')}</p> : null}
      </section>

      <p className="me-note">{t('contactNote')}</p>
    </div>
  );
}
