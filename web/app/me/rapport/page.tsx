'use client';
// Rapport medecin — assemble ici, RENDU par le module partage avec le mobile.
// ---------------------------------------------------------------------------
// On le genere pour l'imprimer ou le joindre a un mail. Les deux se font sur un
// ordinateur ; sur telephone, le PDF finit dans un dossier qu'on ne retrouve pas.
//
// Le RENDU vient de `lib/rapportSanteHtml.ts`, le meme module que le telephone
// appelle. C'est un document MEDICAL : deux rendus qui divergent, ce sont deux
// documents differents remis au meme medecin, et personne ne s'en apercevrait
// avant que ca compte. Seul l'ASSEMBLAGE des donnees differe, parce que chaque
// plateforme lit Firestore a sa maniere.
import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import {
  buildReportHtml,
  summarize,
  REPORT_DAYS,
  type HealthReport,
  type ReportLabels,
} from '../../../../lib/rapportSanteHtml';

const jour = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** Les libelles du rapport, dans la langue du compte. */
function libelles(t: (c: string) => string, langue: Langue): ReportLabels {
  return {
    title: t('rapportTitre'),
    subtitle: t('rapportSousTitre'),
    profile: t('rapportProfil'),
    name: t('rapportNom'),
    goal: t('rapportObjectif'),
    weight: t('rapportPoids'),
    targetKcal: t('rapportCible'),
    conditions: t('rapportConditions'),
    noConditions: t('rapportAucuneCondition'),
    nutrition: t('rapportNutrition'),
    basedOn: t('rapportBase'),
    calories: t('rapportCalories'),
    protein: t('rapportProteines'),
    carbs: t('rapportGlucides'),
    fat: t('rapportLipides'),
    water: t('rapportEau'),
    weightTrend: t('rapportTendance'),
    glucose: t('rapportGlycemie'),
    bloodPressure: t('rapportTension'),
    avg: t('rapportMoyenne'),
    min: t('rapportMin'),
    max: t('rapportMax'),
    latest: t('rapportDernier'),
    measures: t('rapportMesures'),
    none: t('rapportAucune'),
    disclaimer: t('rapportAvertissement'),
    generatedOn: t('rapportGenereLe'),
    locale: langue === 'ar' ? 'ar-MA' : langue === 'en' ? 'en-GB' : 'fr-FR',
    rtl: langue === 'ar',
  } as ReportLabels;
}

export default function PageRapport() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [html, setHtml] = useState('');
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');

  const construire = useCallback(async () => {
    if (!uid || !profil) return;
    setCharge(false);
    setErreur('');
    try {
      const depuis = jour(Date.now() - REPORT_DAYS * 86400000);

      // Repas des 30 derniers jours.
      const logs = await getDocs(
        query(collection(firestore(), 'users', uid, 'logs'), where('date', '>=', depuis)),
      );
      const jours = new Set<string>();
      let kcal = 0, prot = 0, gluc = 0, lip = 0, eau = 0;
      logs.forEach((d) => {
        const l = d.data() as any;
        if (l.date) jours.add(String(l.date));
        // L'activite se SOUSTRAIT des calories : le rapport donne un apport NET,
        // comme le mobile. Additionner les deux doublerait la depense.
        const signe = l.type === 'activity' ? -1 : 1;
        kcal += signe * Number(l.calories || 0);
        if (signe > 0) {
          prot += Number(l.protein || 0);
          gluc += Number(l.carbs || 0);
          lip += Number(l.fat || 0);
        }
        if (l.type === 'water') eau += Number(l.amount || l.ml || 0);
      });
      const n = Math.max(1, jours.size);

      // Poids : le plus recent d'abord, comme l'attend le rendu.
      const poids = await getDocs(
        query(collection(firestore(), 'users', uid, 'weight_history'), orderBy('date', 'desc'), limit(60)),
      );
      const weightSeries = poids.docs.map((d) => {
        const w = d.data() as any;
        return { date: String(w.date || ''), kg: Number(w.weight ?? w.kg ?? 0) };
      }).filter((w) => w.date && w.kg > 0);

      // Constantes : glycemie et tension, si elles existent.
      const vals: Record<string, number[]> = { glucose: [], sys: [], dia: [] };
      try {
        const v = await getDocs(
          query(collection(firestore(), 'users', uid, 'vitals'), where('date', '>=', depuis)),
        );
        v.forEach((d) => {
          const x = d.data() as any;
          if (Number(x.glucose) > 0) vals.glucose.push(Number(x.glucose));
          if (Number(x.systolic) > 0) vals.sys.push(Number(x.systolic));
          if (Number(x.diastolic) > 0) vals.dia.push(Number(x.diastolic));
        });
      } catch {
        // Pas de constantes enregistrees : le rendu omet simplement la section.
      }

      const rapport: HealthReport = {
        // Les champs viennent du type ProfilUtilisateur, verifie et pas suppose :
        // c'est `firstName`/`lastName`, et l'objectif calorique vit dans
        // `nutritionalPlan.dailyCalories`.
        name: [profil.firstName, profil.lastName].filter(Boolean).join(' '),
        goal: String(profil.goal || ''),
        weightKg: Number(profil.weight) > 0 ? Number(profil.weight) : null,
        targetCalories: Number(profil.nutritionalPlan?.dailyCalories) > 0
          ? Number(profil.nutritionalPlan?.dailyCalories)
          : null,
        // `conditions` n'est pas dans le type mais peut exister en base : on lit
        // defensivement plutot que d'elargir un type sur une supposition.
        conditions: Array.isArray((profil as any).conditions) ? (profil as any).conditions : [],
        nutrition: {
          days: jours.size,
          calories: Math.round(kcal / n),
          protein: Math.round(prot / n),
          carbs: Math.round(gluc / n),
          fat: Math.round(lip / n),
          water: Math.round(eau / n),
        },
        weightSeries,
        glucose: summarize(vals.glucose),
        bpSystolic: summarize(vals.sys),
        bpDiastolic: summarize(vals.dia),
        generatedAt: Date.now(),
      };

      setHtml(buildReportHtml(rapport, libelles(t, langue)));
    } catch {
      setErreur(t('rapportErreur'));
    } finally {
      setCharge(true);
    }
  }, [uid, profil, langue, t]);

  useEffect(() => {
    construire();
  }, [construire]);

  /**
   * Imprimer, ou enregistrer en PDF depuis la boite d'impression du navigateur.
   *
   * On ouvre une fenetre a part plutot que d'imprimer la page : sinon la
   * navigation, l'en-tete et le menu se retrouveraient dans le document remis au
   * medecin.
   */
  const imprimer = () => {
    const f = window.open('', '_blank');
    if (!f) return;
    f.document.write(html);
    f.document.close();
    // `onload` et non un appel direct : sans attendre, l'impression part avant
    // que les styles inline ne soient appliques, et le document sort en brut.
    f.onload = () => f.print();
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('rapportPageTitre')}</h1>
        <p className="me-sous">{t('rapportPageSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ">
          <button className="btn btn-primary" onClick={imprimer} disabled={!html}>
            {t('rapportImprimer')}
          </button>
          <button className="btn btn-ghost" onClick={construire}>
            {t('rapportActualiser')}
          </button>
        </div>
        <p className="me-sous" style={{ marginTop: 10 }}>{t('rapportAstuce')}</p>
        {erreur ? <p className="me-erreur">{erreur}</p> : null}
      </section>

      <section className="carte-amis">
        {!charge ? (
          <p className="me-sous">{t('communChargement')}</p>
        ) : html ? (
          // Aperçu isolé : le rapport porte ses propres styles, et les laisser
          // fuiter dans la page casserait la mise en page autour.
          <iframe className="apercu-rapport" srcDoc={html} title={t('rapportPageTitre')} />
        ) : null}
      </section>
    </div>
  );
}
