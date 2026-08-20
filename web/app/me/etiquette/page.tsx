'use client';
// Étiquette — lire un tableau nutritionnel depuis une photo.
// ---------------------------------------------------------------------------
// ⚠ DIFFÉRENCE RÉELLE AVEC LE TÉLÉPHONE, et la page le dit : sur mobile, la
// lecture se fait ENTIÈREMENT sur l'appareil (MLKit), sans que l'image sorte
// jamais. Un navigateur n'a pas d'équivalent hors ligne : ici la photo part
// vers le serveur. C'est le même écran, ce n'est pas la même promesse, et
// laisser croire le contraire serait le pire choix possible.
//
// En échange, le web fait quelque chose que le mobile ne fait pas : les
// valeurs lues alimentent directement le Nutri-Score, calculé par le même
// fichier que celui du téléphone.
import { useCallback, useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import AnalysePhoto from '../AnalysePhoto';
import { extraireObjet } from '../../../lib/ia';
import { nutriScore, GRADE_COLOR, type NutriGrade } from '../../../../lib/nutriScore';
import { ajouterLog } from '../../../lib/ecrireLog';

const CONSIGNE =
  'Cette image montre un tableau de valeurs nutritionnelles. Renvoie UNIQUEMENT ' +
  'un objet JSON, sans texte autour, avec ces clés (nombres, pour 100 g, 0 si ' +
  'absent) : {"nom": string, "energyKcal": number, "sugars": number, "satFat": ' +
  'number, "sodiumMg": number, "fiber": number, "protein": number, "carbs": ' +
  'number, "fat": number}. Si le sodium est donné en sel (g), convertis en mg de ' +
  'sodium (sel_g * 400). Si l\'image ne montre pas de tableau nutritionnel, ' +
  'renvoie {"nom": ""}.';

type Valeurs = {
  nom?: string; energyKcal?: number; sugars?: number; satFat?: number;
  sodiumMg?: number; fiber?: number; protein?: number; carbs?: number; fat?: number;
};

export default function PageEtiquette() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [vals, setVals] = useState<Valeurs | null>(null);
  const [message, setMessage] = useState('');

  const surReponse = useCallback((txt: string) => {
    const obj = extraireObjet(txt) as Valeurs | null;
    // Un objet sans nom ET sans énergie signifie que le modèle n'a rien
    // reconnu. Afficher un tableau de zéros ferait croire à un produit sans
    // calories, ce qui est bien pire que de dire qu'on n'a pas su lire.
    setVals(obj && (obj.nom || Number(obj.energyKcal) > 0) ? obj : null);
    setMessage('');
  }, []);

  const n = (v: any) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : 0; };

  const note = useMemo(() => {
    if (!vals || !(n(vals.energyKcal) > 0)) return null;
    return nutriScore({
      energyKcal: n(vals.energyKcal), sugars: n(vals.sugars), satFat: n(vals.satFat),
      sodiumMg: n(vals.sodiumMg), fiber: n(vals.fiber), protein: n(vals.protein),
    });
  }, [vals]);

  const journaliser = async () => {
    if (!uid || !vals) return;
    try {
      await ajouterLog(uid, {
        type: 'meal',
        name: vals.nom || t('etiqSansNom'),
        calories: n(vals.energyKcal),
        protein: n(vals.protein),
        carbs: n(vals.carbs),
        fat: n(vals.fat),
      });
      setMessage(t('etiqJournalise'));
    } catch {
      setMessage(t('etiqErreurJournal'));
    }
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('etiqTitre')}</h1>
        <p className="me-sous">{t('etiqSous')}</p>
      </header>

      {/* L'avertissement passe AVANT le bouton : il doit se lire avant de
          choisir une photo, pas apres l'avoir envoyee. */}
      <section className="carte-amis">
        <p className="me-erreur">{t('etiqPasOnDevice')}</p>
      </section>

      <AnalysePhoto
        consigne={CONSIGNE}
        onReponse={surReponse}
        rendu={() => (
          <section className="carte-amis">
            {!vals ? (
              <p className="me-sous">{t('etiqRienLu')}</p>
            ) : (
              <>
                <h2 className="me-h2">{vals.nom || t('etiqSansNom')}</h2>
                <div className="grille-series">
                  {([['etiqKcal', vals.energyKcal], ['etiqProt', vals.protein],
                     ['etiqGluc', vals.carbs], ['etiqLip', vals.fat],
                     ['etiqSucres', vals.sugars], ['etiqSodium', vals.sodiumMg]] as const).map(([cle, v]) => (
                    <div key={cle} className="tuile-serie">
                      <span className="serie-nombre">{n(v)}</span>
                      <span className="me-sous">{t(cle)}</span>
                    </div>
                  ))}
                </div>

                {note ? (
                  <div className="ligne-champ" style={{ alignItems: 'center', gap: 14, marginTop: 10 }}>
                    <span className="ns-pastille" style={{ background: GRADE_COLOR[note.grade as NutriGrade] }}>
                      {note.grade}
                    </span>
                    <span className="me-sous">{t('etiqNutriScore')}</span>
                  </div>
                ) : null}

                <div className="ligne-champ" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={journaliser} disabled={!uid}>
                    {t('etiqAjouterJournal')}
                  </button>
                  {message ? <span className="me-note">{message}</span> : null}
                </div>
                <p className="me-note">{t('etiqNoteVerif')}</p>
              </>
            )}
          </section>
        )}
        libelles={{
          choisir: t('etiqChoisir'), analyse: t('etiqAnalyse'), apercu: t('etiqApercu'),
          notePhoto: t('etiqNotePhoto'), indispo: t('etiqIndispo'), erreur: t('etiqErreur'),
          pasDeBackend: t('etiqPasDeBackend'), sessionExpiree: t('iaSessionExpiree'),
        }}
      />
    </div>
  );
}
