'use client';
// Plans de repas — les voir en ENTIER, ce qu'un telephone ne permet pas.
// ---------------------------------------------------------------------------
// Planifier sept jours sur un ecran de six pouces oblige a faire defiler sans
// jamais voir l'ensemble. Or planifier, c'est precisement voir l'ensemble : ou
// sont les repetitions, quel jour manque de proteines, quel soir est trop lourd.
//
// Les plans sont GENERES sur le telephone (l'IA y vit deja) et lus ici. On ne
// duplique pas la generation : ce qui manquait n'etait pas de creer un plan,
// c'etait de pouvoir le regarder.
import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

type Plan = { id: string; plan: any; targets?: any; createdAt?: any };

/** Un plan peut arriver sous plusieurs formes selon la version qui l'a ecrit. */
function joursDe(plan: any): { titre: string; repas: { nom: string; kcal?: number; detail?: string }[] }[] {
  if (!plan) return [];
  const brut = Array.isArray(plan) ? plan : plan.days || plan.jours || plan.plan || [];
  if (!Array.isArray(brut)) return [];
  return brut.map((j: any, i: number) => ({
    titre: String(j?.day || j?.jour || j?.title || `J${i + 1}`),
    repas: (Array.isArray(j?.meals || j?.repas) ? j.meals || j.repas : []).map((m: any) => ({
      nom: String(m?.name || m?.nom || m?.title || ''),
      kcal: Number(m?.calories ?? m?.kcal) || undefined,
      detail: String(m?.description || m?.detail || m?.items || ''),
    })),
  }));
}

export default function PagePlans() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [choisi, setChoisi] = useState<string>('');
  const [charge, setCharge] = useState(false);

  const charger = useCallback(async () => {
    if (!uid) return;
    try {
      const snap = await getDocs(
        query(collection(firestore(), 'users', uid, 'meal_plans'), orderBy('createdAt', 'desc'), limit(30)),
      );
      const liste = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Plan[];
      setPlans(liste);
      // On ouvre le plus recent : arriver sur une liste sans rien d'ouvert oblige
      // a un clic pour voir ce qu'on est venu voir.
      if (liste.length) setChoisi(liste[0].id);
    } catch {
      setPlans([]);
    } finally {
      setCharge(true);
    }
  }, [uid]);

  useEffect(() => {
    charger();
  }, [charger]);

  const actif = plans.find((p) => p.id === choisi);
  const jours = joursDe(actif?.plan);

  const quand = (c: any) => {
    const ms = c?.seconds ? c.seconds * 1000 : Number(c) || 0;
    return ms ? new Date(ms).toLocaleDateString(langue === 'ar' ? 'ar-MA' : langue === 'en' ? 'en-GB' : 'fr-FR') : '';
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('plansTitre')}</h1>
        <p className="me-sous">{t('plansSous')}</p>
      </header>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : plans.length === 0 ? (
        <section className="carte-amis">
          <p className="me-sous">{t('plansVide')}</p>
        </section>
      ) : (
        <>
          <section className="carte-amis">
            <div className="ligne-champ">
              <select
                className="champ-amis"
                value={choisi}
                onChange={(e) => setChoisi(e.target.value)}
                aria-label={t('plansChoisir')}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {quand(p.createdAt) || p.id.slice(0, 6)}
                  </option>
                ))}
              </select>
              {actif?.targets?.dailyCalories ? (
                <span className="me-sous">{Math.round(actif.targets.dailyCalories)} kcal / {t('plansJour')}</span>
              ) : null}
            </div>
          </section>

          {jours.length === 0 ? (
            <section className="carte-amis">
              <p className="me-sous">{t('plansIllisible')}</p>
            </section>
          ) : (
            // La semaine ENTIERE d'un coup : c'est tout l'interet du grand ecran.
            // Sur telephone, ces colonnes deviendraient une liste a faire defiler,
            // et on perdrait la comparaison entre les jours.
            <div className="grille-jours">
              {jours.map((j, i) => (
                <section key={i} className="carte-jour">
                  <h2 className="jour-titre">{j.titre}</h2>
                  {j.repas.length === 0 ? (
                    <p className="me-sous">{t('plansJourVide')}</p>
                  ) : (
                    <ul className="liste-repas">
                      {j.repas.map((m, k) => (
                        <li key={k}>
                          <div className="repas-nom">{m.nom}</div>
                          {m.detail ? <div className="me-sous">{m.detail}</div> : null}
                          {m.kcal ? <div className="repas-kcal">{Math.round(m.kcal)} kcal</div> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <p className="me-note">{t('plansNote')}</p>
    </div>
  );
}
