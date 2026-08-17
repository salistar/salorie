'use client';
// Confidentialité — ce qui est collecté, et comment partir.
// ---------------------------------------------------------------------------
// Même texte que l'écran mobile : une politique de confidentialité qui diverge
// entre deux clients du même service ne vaut rien.
//
// La suppression de compte, elle, n'est PAS refaite ici. Sur mobile elle efface
// le profil, les journaux, l'historique de poids et les entrées santé en une
// opération éprouvée. La réécrire côté web sans pouvoir la tester en conditions
// réelles risquerait de laisser des données derrière — c'est-à-dire d'annoncer
// une suppression qui n'en est pas une. La page renvoie donc vers l'application,
// et le dit franchement.
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';

const RUBRIQUES = ['compte', 'journaux', 'sante', 'photos', 'position', 'tiers'] as const;

export default function PageConfidentialite() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('confTitre')}</h1>
        <p className="me-sous">{t('confSous')}</p>
      </header>

      <section className="carte-amis">
        <p className="me-note">{t('confChiffrement')}</p>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('confCollecte')}</h2>
        <ul className="liste-nue">
          {RUBRIQUES.map((r) => (
            <li key={r}>
              <strong>{t(`conf_${r}_t`)}</strong>
              <p className="me-sous" style={{ margin: '2px 0 0' }}>{t(`conf_${r}_c`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('confSuppression')}</h2>
        <p className="me-sous">{t('confSuppressionTexte')}</p>
        {/* Pas de bouton : promettre ici une suppression que cette page ne sait
            pas executer entierement serait pire que de ne rien promettre. */}
        <p className="me-erreur">{t('confSuppressionOu')}</p>
      </section>
    </div>
  );
}
