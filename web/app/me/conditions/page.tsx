'use client';
// Conditions d'utilisation.
// ---------------------------------------------------------------------------
// Un texte légal se lit vraiment sur un grand écran : c'est même l'écran de la
// liste où la différence est la plus nette. Sur six pouces, personne ne lit des
// conditions d'utilisation ; posées sur une page large, avec une table des
// matières, elles deviennent au moins consultables.
//
// Le texte est le MÊME que celui du mobile, à la virgule près. Un texte légal
// qui diverge entre deux clients d'un même service ne protège plus personne.
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';

/** Les sections, dans l'ordre. Les clés résolvent titre et corps. */
const SECTIONS = ['objet', 'compte', 'sante', 'contenu', 'paiement', 'donnees', 'resiliation', 'droit'] as const;

export default function PageConditions() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('cguTitre')}</h1>
        <p className="me-sous">{t('cguSous')}</p>
      </header>

      {/* Table des matieres : c'est ce qui rend un texte legal consultable
          plutot que seulement present. Des ancres, donc partageables. */}
      <section className="carte-amis">
        <h2 className="me-h2">{t('cguSommaire')}</h2>
        <ol className="liste-etapes">
          {SECTIONS.map((s) => (
            <li key={s}><a href={`#cgu-${s}`}>{t(`cgu_${s}_t`)}</a></li>
          ))}
        </ol>
      </section>

      {SECTIONS.map((s) => (
        <section key={s} className="carte-amis" id={`cgu-${s}`}>
          <h2 className="me-h2">{t(`cgu_${s}_t`)}</h2>
          <p className="texte-legal">{t(`cgu_${s}_c`)}</p>
        </section>
      ))}

      <section className="carte-amis">
        <p className="me-note">{t('cguMaj')}</p>
      </section>
    </div>
  );
}
