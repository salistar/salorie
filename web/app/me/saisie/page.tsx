'use client';
// Saisie manuelle — ajouter un repas au journal, macros comprises.
// ---------------------------------------------------------------------------
// Réunit `log-manual` et `log-food-details`. C'est l'écran qui gagne le plus au
// clavier de toute la liste : sur un téléphone, taper un nom puis quatre
// nombres demande de changer de clavier à chaque champ. Ici, la tabulation
// suffit, et les quatre valeurs tiennent sur une ligne.
import { useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil, useJournal, totaux, jourLocal } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { ajouterLog, supprimerLog, type Creneau } from '../../../lib/ecrireLog';
import { kcalDepuisMacros } from '../../../lib/calculsNutrition';

const CRENEAUX: Creneau[] = ['breakfast', 'lunch', 'snack', 'dinner'];

const nb = (s: string) => {
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : 0;
};

export default function PageSaisie() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const aujourdhui = jourLocal();
  const { lignes, charge } = useJournal(uid, aujourdhui);

  const [nom, setNom] = useState('');
  const [kcal, setKcal] = useState('');
  const [prot, setProt] = useState('');
  const [gluc, setGluc] = useState('');
  const [lip, setLip] = useState('');
  const [creneau, setCreneau] = useState<Creneau>('lunch');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState('');

  // Aperçu vivant : on voit le total avant d'enregistrer, donc on repère une
  // virgule mal placée avant qu'elle n'entre dans le journal.
  const kcalCalculees = kcalDepuisMacros(nb(prot), nb(gluc), nb(lip));
  const kcalFinales = kcal ? nb(kcal) : kcalCalculees;

  const repasDuJour = useMemo(
    () => lignes.filter((l) => l.type === 'meal').sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
    [lignes],
  );
  const tot = useMemo(() => totaux(lignes), [lignes]);

  const vider = () => { setNom(''); setKcal(''); setProt(''); setGluc(''); setLip(''); };

  const enregistrer = async () => {
    if (!uid || !nom.trim() || occupe) return;
    setOccupe(true);
    setMessage('');
    try {
      await ajouterLog(uid, {
        type: 'meal',
        name: nom,
        calories: kcalFinales,
        protein: nb(prot),
        carbs: nb(gluc),
        fat: nb(lip),
        slot: creneau,
      });
      vider();
      setMessage(t('saisieAjoute'));
    } catch {
      setMessage(t('saisieErreur'));
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('saisieTitre')}</h1>
        <p className="me-sous">{t('saisieSous')}</p>
      </header>

      <section className="carte-amis">
        <h2 className="me-h2">{t('saisieNouveau')}</h2>

        <div className="ligne-champ">
          <input
            className="champ-amis" style={{ flex: '1 1 260px' }}
            value={nom} onChange={(e) => setNom(e.target.value)}
            placeholder={t('saisieNom')} aria-label={t('saisieNom')}
          />
        </div>

        <div className="ligne-champ" style={{ flexWrap: 'wrap', marginTop: 8 }}>
          {([['saisieProt', prot, setProt], ['saisieGluc', gluc, setGluc], ['saisieLip', lip, setLip],
             ['saisieKcal', kcal, setKcal]] as const).map(([cle, val, set]) => (
            <label key={cle} className="champ-bloc">
              <span className="me-sous">{t(cle)}</span>
              <input
                className="champ-amis" style={{ width: 96 }} inputMode="decimal"
                value={val} onChange={(e) => set(e.target.value.replace(/[^0-9.,]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && enregistrer()}
                aria-label={t(cle)}
              />
            </label>
          ))}
        </div>

        <div className="ligne-champ" style={{ flexWrap: 'wrap', marginTop: 8 }}>
          {CRENEAUX.map((c) => (
            <button
              key={c}
              className={`btn ${creneau === c ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setCreneau(c)}
            >
              {t(`saisieCreneau_${c}`)}
            </button>
          ))}
        </div>

        <p className="me-note">
          {kcal
            ? t('saisieKcalSaisies')
            : `${t('saisieKcalDeduites')} ${kcalCalculees} kcal`}
        </p>

        <div className="ligne-champ" style={{ marginTop: 6 }}>
          <button className="btn btn-primary" onClick={enregistrer} disabled={!nom.trim() || occupe}>
            {t('saisieEnregistrer')}
          </button>
          <button className="btn btn-ghost" onClick={vider} disabled={occupe}>{t('saisieVider')}</button>
          {message ? <span className="me-note">{message}</span> : null}
        </div>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('saisieJournee')}</h2>
        <div className="grille-series">
          <div className="tuile-serie"><span className="serie-nombre">{tot.kcal}</span><span className="me-sous">kcal</span></div>
          <div className="tuile-serie"><span className="serie-nombre">{tot.proteines}</span><span className="me-sous">{t('saisieProt')}</span></div>
          <div className="tuile-serie"><span className="serie-nombre">{tot.glucides}</span><span className="me-sous">{t('saisieGluc')}</span></div>
          <div className="tuile-serie"><span className="serie-nombre">{tot.lipides}</span><span className="me-sous">{t('saisieLip')}</span></div>
        </div>

        {!charge ? (
          <p className="me-sous">{t('communChargement')}</p>
        ) : repasDuJour.length === 0 ? (
          <p className="me-sous">{t('saisieRien')}</p>
        ) : (
          <ul className="liste-nue">
            {repasDuJour.map((l) => (
              <li key={l.id} className="ligne-champ" style={{ justifyContent: 'space-between' }}>
                <span>
                  <strong>{l.name}</strong>
                  <span className="me-sous"> · {l.calories} kcal</span>
                </span>
                <button className="btn btn-ghost" onClick={() => uid && supprimerLog(uid, l.id)}>
                  {t('saisieSupprimer')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
