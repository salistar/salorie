'use client';
// Substitutions — trouver mieux que ce qu'on allait manger.
// ---------------------------------------------------------------------------
// Le classement des alternatives dépend de la santé de la personne : sel pour
// l'hypertension, sucre pour le diabète, calories pour une perte de poids. La
// règle vit dans `lib/substitutions.ts` et y est testée — c'est la partie qui
// peut donner un mauvais conseil, pas l'affichage.
//
// La page DIT quelle priorité s'applique. Sur mobile elle est silencieuse : on
// reçoit un classement sans savoir sur quel critère. Ici il y a la place de
// l'écrire, et un conseil de santé dont on ignore le critère est un conseil
// qu'on ne peut pas juger.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { genererTexte, iaConfiguree, IaIndisponible, IaNonAutorise } from '../../../lib/ia';
import { prioriteSubstitution, consigneSubstitution, type Priorite } from '../../../lib/substitutions';

export default function PageSubstitutions() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [aliment, setAliment] = useState('');
  const [reponse, setReponse] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const priorite: Priorite = prioriteSubstitution({
    conditions: (profil as any)?.conditions,
    goal: (profil as any)?.goal,
  });

  // Une requête en vol doit mourir avec la page : sans cela, la réponse
  // arriverait dans un composant démonté et React s'en plaindrait.
  useEffect(() => () => abort.current?.abort(), []);

  const demander = useCallback(async () => {
    const nom = aliment.trim();
    if (!nom || occupe) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setOccupe(true);
    setReponse('');
    setErreur('');
    try {
      const txt = await genererTexte(consigneSubstitution(nom, priorite), ctrl.signal);
      setReponse(txt);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setErreur(e instanceof IaNonAutorise ? t('iaSessionExpiree') : e instanceof IaIndisponible ? t('subsIndispo') : t('subsErreur'));
    } finally {
      if (!ctrl.signal.aborted) setOccupe(false);
    }
  }, [aliment, occupe, priorite, t]);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('subsTitre')}</h1>
        <p className="me-sous">{t('subsSous')}</p>
      </header>

      {!iaConfiguree() ? (
        <section className="carte-amis">
          {/* Dire pourquoi ca ne marche pas vaut mieux qu'un bouton qui echoue
              en silence a chaque clic. */}
          <p className="me-erreur">{t('subsPasDeBackend')}</p>
        </section>
      ) : null}

      <section className="carte-amis">
        <div className="ligne-champ">
          <input
            className="champ-amis" style={{ flex: '1 1 280px' }}
            value={aliment}
            onChange={(e) => setAliment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && demander()}
            placeholder={t('subsQuoi')}
            aria-label={t('subsQuoi')}
          />
          <button className="btn btn-primary" onClick={demander} disabled={!aliment.trim() || occupe}>
            {occupe ? t('subsRecherche') : t('subsChercher')}
          </button>
        </div>

        <p className="me-note">
          {priorite
            ? `${t('subsClasseSelon')} ${t(`subsPrio_${priorite}`)}`
            : t('subsPrioNeutre')}
        </p>
      </section>

      {erreur ? (
        <section className="carte-amis"><p className="me-erreur">{erreur}</p></section>
      ) : null}

      {reponse ? (
        <section className="carte-amis">
          <h2 className="me-h2">{t('subsAlternatives')}</h2>
          {/* La reponse arrive en texte libre : `pre-wrap` garde les retours a
              la ligne du modele sans interpreter quoi que ce soit. */}
          <p className="texte-ia">{reponse}</p>
          <p className="me-note">{t('subsNoteIA')}</p>
        </section>
      ) : null}
    </div>
  );
}
