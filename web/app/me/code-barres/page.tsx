'use client';
// Code-barres — taper les chiffres, obtenir la fiche produit.
// ---------------------------------------------------------------------------
// J'avais classé cet écran « bloqué par le matériel ». C'était faux : la caméra
// n'est qu'un moyen d'obtenir treize chiffres, et un clavier les obtient très
// bien. Tout ce qui suit — interroger OpenFoodFacts, lire la fiche, calculer la
// note, journaliser — n'a jamais eu besoin d'un appareil photo.
//
// Le web ajoute même quelque chose : la portion se saisit au clavier, et la
// fiche complète (allergènes, ingrédients, NOVA) tient à l'écran sans défiler.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { chercherProduit, codeValide, pourPortion, type ProduitOFF } from '../../../lib/codeBarres';
import { nutriScore, GRADE_COLOR, type NutriGrade } from '../../../../lib/nutriScore';
import { ajouterLog, type Creneau } from '../../../lib/ecrireLog';

const CRENEAUX: Creneau[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export default function PageCodeBarres() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [code, setCode] = useState('');
  const [produit, setProduit] = useState<ProduitOFF | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [grammes, setGrammes] = useState('100');
  const [creneau, setCreneau] = useState<Creneau>('snack');
  const [message, setMessage] = useState('');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const chercher = useCallback(async () => {
    if (!codeValide(code) || occupe) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setOccupe(true);
    setProduit(null);
    setIntrouvable(false);
    setMessage('');
    try {
      const p = await chercherProduit(code, ctrl.signal);
      setProduit(p);
      setIntrouvable(p === null);
    } catch (e: any) {
      if (e?.name !== 'AbortError') setIntrouvable(true);
    } finally {
      if (!ctrl.signal.aborted) setOccupe(false);
    }
  }, [code, occupe]);

  const g = useMemo(() => {
    const v = parseFloat(grammes.replace(',', '.'));
    return Number.isFinite(v) && v > 0 ? v : 0;
  }, [grammes]);

  const portion = produit ? pourPortion(produit, g) : null;

  const note = useMemo(() => {
    if (!produit || !(produit.kcal100 > 0)) return null;
    return nutriScore({
      energyKcal: produit.kcal100, sugars: produit.sucres100, satFat: produit.satures100,
      sodiumMg: produit.sodiumMg100, fiber: produit.fibres100, protein: produit.prot100,
    });
  }, [produit]);

  const journaliser = async () => {
    if (!uid || !produit || !portion || g <= 0) return;
    try {
      await ajouterLog(uid, {
        type: 'meal',
        name: [produit.nom || t('cbSansNom'), produit.marque].filter(Boolean).join(' — '),
        calories: portion.kcal,
        protein: portion.prot,
        carbs: portion.gluc,
        fat: portion.lip,
        slot: creneau,
      });
      setMessage(t('cbJournalise'));
    } catch {
      setMessage(t('cbErreurJournal'));
    }
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('cbTitre')}</h1>
        <p className="me-sous">{t('cbSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ">
          <input
            className="champ-amis" style={{ flex: '0 1 220px' }} inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 14))}
            onKeyDown={(e) => e.key === 'Enter' && chercher()}
            placeholder={t('cbPlaceholder')} aria-label={t('cbPlaceholder')}
          />
          <button className="btn btn-primary" onClick={chercher} disabled={!codeValide(code) || occupe}>
            {occupe ? t('cbRecherche') : t('cbChercher')}
          </button>
        </div>
        {code && !codeValide(code) ? <p className="me-note">{t('cbCodeInvalide')}</p> : null}
        <p className="me-note">{t('cbNoteSource')}</p>
      </section>

      {introuvable ? (
        <section className="carte-amis"><p className="me-sous">{t('cbIntrouvable')}</p></section>
      ) : null}

      {produit ? (
        <>
          <section className="carte-amis">
            <div className="ligne-champ" style={{ gap: 14, alignItems: 'flex-start' }}>
              {produit.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async" src={produit.image} alt="" className="cb-vignette" />
              ) : null}
              <div style={{ minWidth: 0 }}>
                <h2 className="me-h2">{produit.nom || t('cbSansNom')}</h2>
                {produit.marque ? <p className="me-sous">{produit.marque}</p> : null}
                {note ? (
                  <div className="ligne-champ" style={{ alignItems: 'center', gap: 10, marginTop: 6 }}>
                    <span className="ns-pastille" style={{ background: GRADE_COLOR[note.grade as NutriGrade] }}>
                      {note.grade}
                    </span>
                    {produit.nova ? <span className="etiquette-muscle">NOVA {produit.nova}</span> : null}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          {produit.allergenes.length ? (
            <section className="carte-amis">
              {/* Les allergenes en ROUGE et dans leur propre carte : c'est la
                  seule information de cette page qui peut envoyer quelqu'un
                  a l'hopital. */}
              <h2 className="me-h2">{t('cbAllergenes')}</h2>
              <p className="me-erreur">{produit.allergenes.join(' · ')}</p>
            </section>
          ) : null}

          <section className="carte-amis">
            <h2 className="me-h2">{t('cbPourPortion')}</h2>
            <div className="ligne-champ">
              <label className="champ-bloc">
                <span className="me-sous">{t('cbGrammes')}</span>
                <input
                  className="champ-amis" style={{ width: 110 }} inputMode="decimal"
                  value={grammes}
                  onChange={(e) => setGrammes(e.target.value.replace(/[^0-9.,]/g, ''))}
                  aria-label={t('cbGrammes')}
                />
              </label>
            </div>
            {portion ? (
              <div className="grille-series">
                <div className="tuile-serie"><span className="serie-nombre">{portion.kcal}</span><span className="me-sous">kcal</span></div>
                <div className="tuile-serie"><span className="serie-nombre">{portion.prot}</span><span className="me-sous">{t('cbProt')}</span></div>
                <div className="tuile-serie"><span className="serie-nombre">{portion.gluc}</span><span className="me-sous">{t('cbGluc')}</span></div>
                <div className="tuile-serie"><span className="serie-nombre">{portion.lip}</span><span className="me-sous">{t('cbLip')}</span></div>
              </div>
            ) : null}

            <div className="ligne-champ" style={{ flexWrap: 'wrap', marginTop: 8 }}>
              {CRENEAUX.map((c) => (
                <button key={c} className={`btn ${creneau === c ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCreneau(c)}>
                  {t(`saisieCreneau_${c}`)}
                </button>
              ))}
            </div>
            <div className="ligne-champ" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" onClick={journaliser} disabled={!uid || g <= 0}>
                {t('cbAjouterJournal')}
              </button>
              {message ? <span className="me-note">{message}</span> : null}
            </div>
          </section>

          {produit.ingredients ? (
            <section className="carte-amis">
              <h2 className="me-h2">{t('cbIngredients')}</h2>
              <p className="texte-legal">{produit.ingredients}</p>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
