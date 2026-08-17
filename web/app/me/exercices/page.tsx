'use client';
// Catalogue d'exercices — 95 mouvements, filtrables, avec la consigne en entier.
// ---------------------------------------------------------------------------
// Sur telephone on cherche un exercice ; sur grand ecran on PREPARE sa seance,
// assis, la veille. Ce n'est pas le meme geste, et ca demande de voir plusieurs
// mouvements a la fois plutot qu'un seul a l'ecran.
//
// Le catalogue est le MEME fichier que le mobile, synchronise par
// `npm run sync:partage` et verifie par un test : deux listes qui divergent, ce
// sont deux apps qui ne proposent pas les memes exercices.
import { useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { EXERCICES_PLUS, type ExercicePlus } from '../../../lib/partage/exercicesPlus';

const MATERIELS: ExercicePlus['materiel'][] = ['aucun', 'halteres', 'barre', 'machine', 'poulie', 'kettlebell', 'elastique'];

export default function PageExercices() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const lg = (langue === 'ar' ? 'ar' : langue === 'en' ? 'en' : 'fr') as 'fr' | 'en' | 'ar';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [terme, setTerme] = useState('');
  const [materiel, setMateriel] = useState<string>('');
  const [ouvert, setOuvert] = useState<string>('');

  const liste = useMemo(() => {
    const q = terme.trim().toLowerCase();
    return EXERCICES_PLUS.filter((e) => {
      if (materiel && e.materiel !== materiel) return false;
      if (!q) return true;
      // On cherche dans la langue AFFICHEE, pas dans l'identifiant technique :
      // personne ne tape « bench_press » pour trouver un developpe couche.
      return e.label[lg].toLowerCase().includes(q) || e.howto[lg].toLowerCase().includes(q);
    });
  }, [terme, materiel, lg]);

  /** Recherche YouTube — le meme repli que le mobile, sur le nom traduit. */
  const lienDemo = (e: ExercicePlus) => {
    const suffixe = lg === 'ar' ? 'تمرين طريقة صحيحة' : lg === 'en' ? 'exercise proper form' : 'exercice technique';
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${e.label[lg]} ${suffixe}`)}`;
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('exercicesTitre')}</h1>
        <p className="me-sous">{t('exercicesSous').replace('{n}', String(EXERCICES_PLUS.length))}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ">
          <input
            className="champ-amis"
            value={terme}
            onChange={(e) => setTerme(e.target.value)}
            placeholder={t('exercicesChercher')}
            aria-label={t('exercicesChercher')}
          />
          <select
            className="champ-amis"
            style={{ flex: '0 1 190px' }}
            value={materiel}
            onChange={(e) => setMateriel(e.target.value)}
            aria-label={t('exercicesMateriel')}
          >
            <option value="">{t('exercicesTousMateriels')}</option>
            {MATERIELS.map((m) => (
              <option key={m} value={m}>{t(`exercicesMat_${m}`) || m}</option>
            ))}
          </select>
          <span className="me-sous">{liste.length}</span>
        </div>
      </section>

      {liste.length === 0 ? (
        <p className="me-sous">{t('exercicesAucun')}</p>
      ) : (
        <ul className="grille-exercices">
          {liste.map((e) => {
            const dep = ouvert === e.id;
            return (
              <li key={e.id} className="carte-exercice">
                <button
                  className="exo-tete"
                  onClick={() => setOuvert(dep ? '' : e.id)}
                  aria-expanded={dep}
                >
                  <strong>{e.label[lg]}</strong>
                  <span className="puce-role">{t(`exercicesMat_${e.materiel}`) || e.materiel}</span>
                </button>
                {dep ? (
                  <div className="exo-corps">
                    <p className="exo-consigne">{e.howto[lg]}</p>
                    <p className="me-sous">
                      {t('exercicesMuscles')} : {e.muscles.map((m) => t(m.replace('muscle.', 'muscle_')) || m.replace('muscle.', '')).join(' · ')}
                    </p>
                    <p className="me-sous">
                      {t('exercicesMet')} : {e.mets.join(' / ')}
                    </p>
                    <a className="btn btn-ghost" href={lienDemo(e)} target="_blank" rel="noopener noreferrer">
                      {t('exercicesVoirDemo')}
                    </a>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
