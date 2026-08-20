'use client';
// Plan de repas — trois jours générés selon l'objectif et les préférences.
// ---------------------------------------------------------------------------
// L'écran de la liste qui gagne le plus au clavier ET au grand écran : on
// décrit ce qu'on a dans son frigo — plusieurs lignes, à l'aise — et on lit
// trois journées de menus sans faire défiler.
//
// La consigne reprend celle du mobile, y compris les préférences alimentaires
// et les conditions de santé déclarées. Ce dernier point n'est pas cosmétique :
// générer un plan sans tenir compte d'un diabète ou d'une maladie cœliaque
// produirait des menus concrètement mauvais pour la personne.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { genererTexte, iaConfiguree, IaIndisponible, IaNonAutorise } from '../../../lib/ia';

const OBJECTIFS: Record<string, string> = {
  lose: 'perte de poids', gain: 'prise de masse', maintain: 'maintien du poids',
};

/** Préférences que le profil peut porter, avec leur formulation pour la consigne. */
const PREFS: { cle: string; phrase: string }[] = [
  { cle: 'halal', phrase: 'strictement halal (aucun porc, aucun alcool)' },
  { cle: 'vegetarian', phrase: 'végétarien' },
  { cle: 'keto', phrase: 'cétogène (très pauvre en glucides)' },
  { cle: 'glutenFree', phrase: 'sans gluten' },
  { cle: 'lowFodmap', phrase: 'pauvre en FODMAP' },
];

const CONDITIONS: Record<string, string> = {
  diabetes: 'diabète (limiter les sucres rapides)',
  hypertension: 'hypertension (limiter le sel)',
  high_cholesterol: 'cholestérol élevé (limiter les graisses saturées)',
  celiac: 'maladie cœliaque (aucun gluten, strictement)',
  kidney: 'insuffisance rénale (limiter les protéines et le potassium)',
  gout: 'goutte (limiter les purines)',
};

export default function PagePlanIA() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [frigo, setFrigo] = useState('');
  const [budget, setBudget] = useState(false);
  const [local, setLocal] = useState(true);
  const [plan, setPlan] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const kcal = Number((profil as any)?.dailyCalories) || 2000;
  const but = OBJECTIFS[String((profil as any)?.goal || '')] || OBJECTIFS.maintain;

  const contraintes = useMemo(() => {
    const p: string[] = [];
    for (const { cle, phrase } of PREFS) if ((profil as any)?.[cle]) p.push(phrase);
    const cs = Array.isArray((profil as any)?.conditions) ? (profil as any).conditions : [];
    for (const c of cs) if (CONDITIONS[c]) p.push(CONDITIONS[c]);
    return p;
  }, [profil]);

  const generer = useCallback(async () => {
    if (occupe) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setOccupe(true);
    setPlan('');
    setErreur('');
    try {
      // Les contraintes sont annoncées comme IMPÉRATIVES et placées en tête :
      // noyées en fin de consigne, un modèle les traite comme une préférence.
      const contrainte = contraintes.length
        ? ` Contraintes IMPÉRATIVES à respecter : ${contraintes.join(' ; ')}.`
        : '';
      const localHint = local
        ? ' Privilégie des ingrédients LOCAUX et de la région MENA (Maroc/Maghreb/Moyen-Orient) :'
          + ' légumes de saison, légumineuses, huile d’olive, épices locales, pain complet.'
        : '';
      const budgetHint = budget ? ' Reste sur des ingrédients bon marché.' : '';
      const frigoHint = frigo.trim()
        ? ` Privilégie ces ingrédients disponibles : ${frigo.trim().slice(0, 400)}.`
        : '';
      const txt = await genererTexte(
        `Génère un plan de repas sur 3 JOURS (Jour 1, Jour 2, Jour 3). Objectif : ${but}, `
        + `~${kcal} kcal/jour.${contrainte}${budgetHint}${localHint}${frigoHint} Pour chaque jour donne : `
        + `petit-déjeuner, déjeuner, collation, dîner — chacun avec les aliments et une estimation `
        + `calories, puis le total du jour. Réponds en français, concis, structuré par jour.`,
        ctrl.signal,
      );
      setPlan(txt);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setErreur(e instanceof IaNonAutorise ? t('iaSessionExpiree') : e instanceof IaIndisponible ? t('planIndispo') : t('planErreur'));
    } finally {
      if (!ctrl.signal.aborted) setOccupe(false);
    }
  }, [occupe, contraintes, local, budget, frigo, but, kcal, t]);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('planTitre')}</h1>
        <p className="me-sous">{t('planSous')}</p>
      </header>

      {!iaConfiguree() ? (
        <section className="carte-amis"><p className="me-erreur">{t('planPasDeBackend')}</p></section>
      ) : null}

      <section className="carte-amis">
        <div className="grille-series">
          <div className="tuile-serie">
            <span className="serie-nombre">{kcal}</span>
            <span className="me-sous">{t('planKcalJour')}</span>
          </div>
          <div className="tuile-serie">
            <span className="serie-nombre">{contraintes.length}</span>
            <span className="me-sous">{t('planContraintes')}</span>
          </div>
        </div>
        {contraintes.length ? (
          <p className="me-note">{t('planContraintesLues')} {contraintes.join(' · ')}</p>
        ) : (
          <p className="me-note">{t('planAucuneContrainte')}</p>
        )}
      </section>

      <section className="carte-amis">
        <label className="champ-bloc">
          <span className="me-sous">{t('planFrigo')}</span>
          {/* Un textarea, pas un input : on decrit un frigo en plusieurs lignes,
              et c'est justement ce que le clavier permet et le pouce non. */}
          <textarea
            className="champ-amis" rows={3} value={frigo}
            onChange={(e) => setFrigo(e.target.value)}
            placeholder={t('planFrigoExemple')} aria-label={t('planFrigo')}
          />
        </label>
        <div className="ligne-champ" style={{ flexWrap: 'wrap', marginTop: 8 }}>
          <button className={`btn ${local ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setLocal((v) => !v)}>
            {t('planLocal')}
          </button>
          <button className={`btn ${budget ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBudget((v) => !v)}>
            {t('planBudget')}
          </button>
          <button className="btn btn-primary" onClick={generer} disabled={occupe}>
            {occupe ? t('planGeneration') : t('planGenerer')}
          </button>
        </div>
      </section>

      {erreur ? <section className="carte-amis"><p className="me-erreur">{erreur}</p></section> : null}

      {plan ? (
        <section className="carte-amis">
          <h2 className="me-h2">{t('planTroisJours')}</h2>
          <p className="texte-ia">{plan}</p>
          <p className="me-note">{t('planNoteIA')}</p>
        </section>
      ) : null}
    </div>
  );
}
