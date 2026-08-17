'use client';
// Journal — actualites, courses a venir, defis.
// ---------------------------------------------------------------------------
// C'est du texte long. Une annonce de course ou une explication de defi fait
// plusieurs paragraphes, et sur telephone elle arrive en colonne de trente-cinq
// caracteres : on abandonne avant la fin. Ici la colonne est calibree pour la
// lecture, et les articles s'affichent en ENTIER — pas de « lire la suite » qui
// ne mene nulle part.
import { useMemo } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { useApi } from '../../../lib/apiSalorie';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';

type Actu = {
  _id?: string;
  title?: string;
  body?: string;
  kind?: string;
  imageUrl?: string;
  createdAt?: string;
};

type Course = {
  id?: string;
  _id?: string;
  name?: string;
  title?: string;
  distanceKm?: number;
  participants?: number;
};

const ICONE: Record<string, string> = { news: '📰', race: '🏁', challenge: '🏆', update: '✨' };

export default function PageJournal() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const { donnees: actus, charge: actusChargees } = useApi<Actu[]>('/news');
  const { donnees: courses } = useApi<Course[]>('/races/active');

  const liste = useMemo(() => (Array.isArray(actus) ? actus : []), [actus]);
  const listeCourses = useMemo(() => (Array.isArray(courses) ? courses : []), [courses]);

  const dateLisible = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    // `toLocaleDateString` suit la langue du profil, pas celle du navigateur :
    // quelqu'un qui lit Salorie en arabe sur un ordinateur en francais doit voir
    // la meme date que sur son telephone.
    return d.toLocaleDateString(langue === 'ar' ? 'ar-MA' : langue === 'en' ? 'en-GB' : 'fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('journalTitre')}</h1>
        <p className="me-sous">{t('journalSous')}</p>
      </header>

      {listeCourses.length ? (
        <section className="carte-amis">
          <h2 className="me-h2">{t('journalCourses')}</h2>
          <ul className="journal-courses">
            {listeCourses.map((c, i) => (
              <li key={c.id || c._id || i}>
                <strong>{c.name || c.title || t('journalCourseSansNom')}</strong>
                {c.distanceKm ? <span className="me-sous"> · {c.distanceKm} km</span> : null}
              </li>
            ))}
          </ul>
          {/* On ne propose pas de rejoindre depuis le web : courir demande le GPS
              du telephone, et un bouton qui promet ce qu'il ne peut pas tenir est
              pire qu'un bouton absent. */}
          <p className="me-note">{t('journalCoursesNote')}</p>
        </section>
      ) : null}

      {!actusChargees ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : liste.length === 0 ? (
        <p className="me-sous">{t('journalVide')}</p>
      ) : (
        <div className="journal-flux">
          {liste.map((a, i) => (
            <article key={a._id || i} className="journal-article">
              <div className="journal-tete">
                <span className="journal-icone" aria-hidden>{ICONE[a.kind || 'news'] || '📰'}</span>
                <div>
                  <h2 className="journal-titre">{a.title}</h2>
                  {a.createdAt ? <span className="me-sous">{dateLisible(a.createdAt)}</span> : null}
                </div>
              </div>
              {a.imageUrl ? <img src={a.imageUrl} alt="" className="journal-image" /> : null}
              {/* Les sauts de ligne du texte source sont conserves : un article
                  ecrit en paragraphes doit se lire en paragraphes. Le contenu
                  reste du TEXTE, jamais interprete comme du HTML — il vient d'un
                  back-office, et un article ne doit pas pouvoir executer de code
                  dans le navigateur de qui le lit. */}
              {a.body ? <p className="journal-corps">{a.body}</p> : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
