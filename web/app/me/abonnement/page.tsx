'use client';
// Abonnement — ce que Premium ouvre, et où il se souscrit.
// ---------------------------------------------------------------------------
// ⚠ Cette page ne VEND rien, et c'est délibéré.
//
// Le mobile passe par RevenueCat, le rail de paiement des boutiques
// d'applications. Il n'a aucun équivalent dans un navigateur : encaisser ici
// voudrait dire brancher un second prestataire (Paddle ou Polar), gérer ses
// webhooks, la TVA, les remboursements et la réconciliation des deux sources
// d'abonnement. C'est un chantier de paiement, pas le portage d'un écran.
//
// Une fausse page de paiement qui « ne marche pas encore » serait pire que
// pas de page du tout. Celle-ci dit donc l'état réel de l'abonnement, ce qu'il
// ouvre, et où il se souscrit aujourd'hui.
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';

/** Les fonctions que Premium ouvre. Chaque clé résout titre et description. */
const AVANTAGES = ['scans', 'plans', 'coach', 'rapport', 'famille', 'pub'] as const;

export default function PageAbonnement() {
  const { uid } = useMe();
  const { profil, charge } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  // `premiumOverride` est le champ que l'administration écrit et que le mobile
  // relit. C'est la seule marque d'abonnement visible depuis Firestore : l'état
  // RevenueCat, lui, ne sort pas du téléphone.
  const premium = Boolean((profil as any)?.premiumOverride);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('aboTitre')}</h1>
        <p className="me-sous">{t('aboSous')}</p>
      </header>

      <section className="carte-amis">
        {!charge ? (
          <p className="me-sous">{t('communChargement')}</p>
        ) : (
          <>
            <h2 className="me-h2">{premium ? t('aboActif') : t('aboInactif')}</h2>
            <p className="me-sous">{premium ? t('aboActifTexte') : t('aboInactifTexte')}</p>
          </>
        )}
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('aboCeQuiOuvre')}</h2>
        <ul className="liste-nue">
          {AVANTAGES.map((a) => (
            <li key={a}>
              <strong>{t(`abo_${a}_t`)}</strong>
              <p className="me-sous" style={{ margin: '2px 0 0' }}>{t(`abo_${a}_c`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('aboOuSouscrire')}</h2>
        {/* Pas de bouton « Payer » : il n'y a rien derriere, et un bouton mort
            sur une page d'abonnement est le plus mauvais signal possible. */}
        <p className="me-sous">{t('aboOuSouscrireTexte')}</p>
        <p className="me-note">{t('aboPourquoiPasIci')}</p>
      </section>
    </div>
  );
}
