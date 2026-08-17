'use client';
// Ramadan — répartir la journée entre suhoor et iftar.
// ---------------------------------------------------------------------------
// Ce que cette page fait : proposer deux assiettes, à partir du budget
// calorique de la journée et de la base d'aliments locaux. Le calcul vient de
// `lib/ramadanAssiettes.ts` (aucun import, déjà celui du téléphone) et la base
// du même `assets/data/local-foods.json`.
//
// Ce qu'elle NE fait PAS, et le dit : les horaires de suhoor et d'iftar.
// Ils dépendent des horaires de prière géolocalisés, que le mobile obtient du
// GPS. Les recalculer approximativement dans un navigateur, sur une question
// qui décide de quand quelqu'un commence et rompt son jeûne, serait le pire
// endroit possible pour une approximation.
import { useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { jourLocal } from '../../../lib/useFirestoreMe';
import {
  suggererSuhoor, suggererIftar, nomAliment, type Aliment, type Assiette,
} from '../../../../lib/ramadanAssiettes';
import BASE_LOCALE from '../../../../assets/data/local-foods.json';

/** Répartition du budget entre les deux repas. Le suhoor est le plus petit :
 *  il doit tenir jusqu'au soir sans alourdir la nuit. */
const PART_SUHOOR = 0.4;

export default function PageRamadan() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const objectif = Number((profil as any)?.dailyCalories) || 2000;
  const [budget, setBudget] = useState(String(objectif));

  const kcal = useMemo(() => {
    const v = parseInt(budget, 10);
    return Number.isFinite(v) && v > 0 ? Math.min(6000, v) : objectif;
  }, [budget, objectif]);

  const jour = jourLocal();
  const suhoor = useMemo(
    () => suggererSuhoor(BASE_LOCALE as Aliment[], Math.round(kcal * PART_SUHOOR), jour),
    [kcal, jour],
  );
  const iftar = useMemo(
    () => suggererIftar(BASE_LOCALE as Aliment[], Math.round(kcal * (1 - PART_SUHOOR)), jour),
    [kcal, jour],
  );

  const carte = (titre: string, a: Assiette, part: number) => (
    <section className="carte-amis">
      <div className="ligne-champ" style={{ justifyContent: 'space-between' }}>
        <h2 className="me-h2">{titre}</h2>
        <span className="me-sous">{Math.round(kcal * part)} kcal {t('ramVise')}</span>
      </div>
      {!a.portions?.length ? (
        <p className="me-sous">{t('ramRienPropose')}</p>
      ) : (
        <>
          <ul className="liste-nue">
            {a.portions.map((p, i) => (
              <li key={i} className="ligne-champ" style={{ justifyContent: 'space-between' }}>
                <span>{nomAliment(p.aliment, langue)}</span>
                <span className="me-sous">{Math.round(p.grammes)} g · {Math.round(p.kcal)} kcal</span>
              </li>
            ))}
          </ul>
          <div className="grille-series">
            <div className="tuile-serie">
              <span className="serie-nombre">{Math.round(a.kcal)}</span>
              <span className="me-sous">kcal</span>
            </div>
            <div className="tuile-serie">
              <span className="serie-nombre">{Math.round(a.p)}</span>
              <span className="me-sous">{t('ramProt')}</span>
            </div>
          </div>
        </>
      )}
    </section>
  );

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('ramTitre')}</h1>
        <p className="me-sous">{t('ramSous')}</p>
      </header>

      <section className="carte-amis">
        <p className="me-erreur">{t('ramPasDHoraires')}</p>
      </section>

      <section className="carte-amis">
        <label className="champ-bloc">
          <span className="me-sous">{t('ramBudget')}</span>
          <input
            className="champ-amis" style={{ width: 130 }} inputMode="numeric"
            value={budget}
            onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ''))}
            aria-label={t('ramBudget')}
          />
        </label>
        <p className="me-note">{t('ramNoteRepartition')}</p>
      </section>

      {carte(t('ramSuhoor'), suhoor, PART_SUHOOR)}
      {carte(t('ramIftar'), iftar, 1 - PART_SUHOOR)}

      <section className="carte-amis">
        <p className="me-note">{t('ramNoteJour')}</p>
      </section>
    </div>
  );
}
