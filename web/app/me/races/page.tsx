'use client';
// Courses virtuelles et medailles, cote web.
// Lecture seule assumee : on rejoint et on avance depuis le telephone, qui porte le
// GPS. Le web sert a SUIVRE — un grand ecran vaut mieux qu'un petit pour comparer sa
// progression et regarder ses medailles.
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { useApi } from '../../../lib/apiSalorie';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';

type Course = {
  id?: string;
  _id?: string;
  name?: string;
  title?: string;
  distanceKm?: number;
  distance?: number;
  endsAt?: string | number;
  image?: string;
  imageUrl?: string;
  description?: string;
};

type Medaille = {
  id?: string;
  raceId?: string;
  name?: string;
  title?: string;
  imageUrl?: string;
  image?: string;
  earnedAt?: string | number;
};

const idDe = (c: Course) => String(c.id || c._id || '');
const nomDe = (c: Course) => c.name || c.title || 'Course';
const distanceDe = (c: Course) => Number(c.distanceKm ?? c.distance ?? 0);

export default function PageCourses() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language || 'fr') as Langue;
  const t = traducteur(langue);
  const dir = sensLecture(langue);

  const { donnees: courses, charge: coursesChargees, erreur } = useApi<Course[]>('/races/active');
  const { donnees: medailles } = useApi<Medaille[]>('/races/medals/me');

  const listeCourses = Array.isArray(courses) ? courses : [];
  const listeMedailles = Array.isArray(medailles) ? medailles : [];

  return (
    <div className="me-page" dir={dir}>
      <header className="me-entete">
        <h1>{t('coursesTitre')}</h1>
        <p className="me-sous">{t('coursesSous')}</p>
      </header>

      <h2 className="me-h2">{t('coursesActives')}</h2>
      {!coursesChargees ? (
        <div className="me-vide">…</div>
      ) : erreur ? (
        <div className="me-erreur">{t('coursesErreur')}</div>
      ) : listeCourses.length ? (
        <div className="grille-courses">
          {listeCourses.map((c) => (
            <article key={idDe(c)} className="carte-course">
              {c.image || c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image || c.imageUrl} alt="" className="course-image" />
              ) : (
                <div className="course-image vide" aria-hidden>
                  🏁
                </div>
              )}
              <div className="course-corps">
                <h3>{nomDe(c)}</h3>
                {distanceDe(c) ? <div className="course-distance">{distanceDe(c)} km</div> : null}
                {c.description ? <p className="course-desc">{c.description}</p> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="me-vide">{t('coursesAucune')}</div>
      )}

      <h2 className="me-h2">{t('coursesMedailles')}</h2>
      {listeMedailles.length ? (
        <div className="grille-medailles">
          {listeMedailles.map((m, i) => (
            <div key={m.id || `${m.raceId}-${i}`} className="medaille">
              {m.imageUrl || m.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.imageUrl || m.image} alt="" />
              ) : (
                <div className="medaille-vide" aria-hidden>
                  🥇
                </div>
              )}
              <span>{m.name || m.title || '—'}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="me-vide">{t('coursesAucuneMedaille')}</div>
      )}

      <p className="me-note">{t('coursesNote')}</p>
    </div>
  );
}
