'use client';
// Recettes locales — le verdict est calcule pour TOI, pas en general.
// ---------------------------------------------------------------------------
// Une recette se lit en cuisinant : la liste des courses d'un cote, les etapes
// de l'autre, les deux visibles en meme temps. Un telephone n'affiche qu'un
// panneau a la fois et s'eteint tout seul au milieu de la cuisson.
//
// Le score reutilise EXACTEMENT le moteur du mobile (`objective/scoring`),
// synchronise et verifie par un test. Deux verdicts differents pour le meme plat
// et la meme personne, ce serait pire que pas de verdict : quelqu'un
// d'hypertendu ne saurait plus lequel croire.
import { useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil, useJournal } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { recommendForMe, type RecipeCategory, type ScoredRecipe } from '../../../lib/partage/localRecipes';
import type { ObjectiveContext } from '../../../lib/partage/objective/scoring';

const CATEGORIES: RecipeCategory[] = ['soup', 'main', 'salad', 'bread', 'pastry', 'dessert'];

/** Date du jour au format du journal (YYYY-MM-DD), calculee cote client. */
function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PageRecettes() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const lg = (langue === 'ar' ? 'ar' : langue === 'en' ? 'en' : 'fr') as 'fr' | 'en' | 'ar';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const date = useMemo(() => aujourdhui(), []);
  const { lignes } = useJournal(uid, date);

  const [cat, setCat] = useState<RecipeCategory | ''>('');
  const [ouverte, setOuverte] = useState('');

  // Ce qui reste a manger aujourd'hui. Sans le journal, on retombe sur la cible
  // entiere — un verdict base sur la cible du jour vaut mieux que pas de verdict,
  // et la page dit dans quel cas on est.
  const contexte = useMemo<ObjectiveContext>(() => {
    const plan = profil?.nutritionalPlan || {};
    const cible = Number(plan.dailyCalories) || 2000;
    const cibleP = Number(plan.protein) || 100;
    const cibleG = Number(plan.carbs) || 220;
    const cibleL = Number(plan.fats) || 70;
    const repas = (lignes || []).filter((l) => l.type !== 'activity' && l.type !== 'water');
    const somme = (f: (x: (typeof repas)[number]) => number) => repas.reduce((a, x) => a + (Number(f(x)) || 0), 0);
    const mange = somme((x) => x.calories ?? 0);
    return {
      uid,
      goal: (profil?.goal as ObjectiveContext['goal']) || 'maintain',
      lang: lg,
      tdee: cible,
      dailyKcalTarget: cible,
      remainingKcal: Math.max(0, cible - mange),
      macroTargets: { protein: cibleP, carbs: cibleG, fat: cibleL },
      remainingMacros: {
        protein: Math.max(0, cibleP - somme((x) => x.protein ?? 0)),
        carbs: Math.max(0, cibleG - somme((x) => x.carbs ?? 0)),
        fat: Math.max(0, cibleL - somme((x) => x.fat ?? 0)),
      },
      // Ces listes ne sont pas encore modifiables depuis le web ; elles viennent
      // du telephone quand elles existent. Vides, le moteur ne bloque rien — il
      // ne fabrique pas d'interdit qu'on n'a pas declare.
      diet: (profil as any)?.diet || [],
      allergies: (profil as any)?.allergies || [],
      dislikes: (profil as any)?.dislikes || [],
      conditions: (profil as any)?.conditions || [],
    };
  }, [profil, lignes, uid, lg]);

  const recettes = useMemo<ScoredRecipe[]>(
    () => recommendForMe(contexte, cat ? { category: cat } : undefined),
    [contexte, cat],
  );

  const pastille = (v: string) =>
    v === 'great' ? 'verdict-super' : v === 'ok' ? 'verdict-correct' : 'verdict-eviter';

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('recettesTitre')}</h1>
        <p className="me-sous">{t('recettesSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ">
          <button className={`btn ${cat === '' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCat('')}>
            {t('recettesToutes')}
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} className={`btn ${cat === c ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCat(c)}>
              {t(`recettesCat_${c}`) || c}
            </button>
          ))}
        </div>
        <p className="me-note">
          {t('recettesRestant').replace('{n}', String(Math.round(contexte.remainingKcal)))}
        </p>
      </section>

      <ul className="grille-recettes">
        {recettes.map(({ recipe: r, score }) => {
          const dep = ouverte === r.id;
          return (
            <li key={r.id} className="carte-recette">
              <button className="exo-tete" onClick={() => setOuverte(dep ? '' : r.id)} aria-expanded={dep}>
                <strong>{r.name[lg]}</strong>
                <span className={`puce-verdict ${pastille(score.verdict)}`}>
                  {t(`recettesVerdict_${score.verdict}`) || score.verdict}
                </span>
              </button>

              <div className="recette-macros">
                <span>{r.kcal} kcal</span>
                <span>P {r.protein}g</span>
                <span>G {r.carbs}g</span>
                <span>L {r.fat}g</span>
                <span className="me-sous">{t('recettesParPortion')} · {r.servings}</span>
              </div>

              {/* Les raisons sont montrees TOUJOURS, pas seulement quand on
                  deplie : un verdict sans sa raison est une injonction. */}
              {score.reasons.length ? (
                <ul className="recette-raisons">
                  {score.reasons.slice(0, 3).map((raison, i) => <li key={i}>{raison}</li>)}
                </ul>
              ) : null}

              {dep ? (
                <div className="recette-detail">
                  {/* Ingredients ET etapes cote a cote — c'est tout l'interet du
                      grand ecran quand on a les mains dans la pate. */}
                  <div>
                    <h3 className="me-h3">{t('recettesIngredients')}</h3>
                    <ul className="recette-liste">
                      {r.ingredients.map((x, i) => <li key={i}>{x[lg]}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h3 className="me-h3">{t('recettesEtapes')}</h3>
                    <ol className="recette-liste">
                      {r.steps.map((x, i) => <li key={i}>{x[lg]}</li>)}
                    </ol>
                  </div>
                  {r.healthySwaps.length ? (
                    <div className="recette-astuces">
                      <h3 className="me-h3">{t('recettesAlleger')}</h3>
                      <ul className="recette-liste">
                        {r.healthySwaps.map((x, i) => <li key={i}>{x[lg]}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="me-note">{t('recettesAvertissement')}</p>
    </div>
  );
}
