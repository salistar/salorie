'use client';
// Équipement — photographier une machine de salle, savoir quoi en faire.
// ---------------------------------------------------------------------------
// Devant une machine inconnue, on sort son téléphone : c'est le geste naturel,
// et le mobile reste le bon endroit pour ça. Cette page sert l'autre moment —
// préparer sa séance chez soi à partir des photos prises la veille, et lire les
// consignes sur un écran où elles tiennent en entier.
import { useCallback, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import AnalysePhoto from '../AnalysePhoto';
import { extraireObjet } from '../../../lib/ia';

const CONSIGNE =
  'Cette image montre un appareil de musculation ou de cardio. Renvoie UNIQUEMENT ' +
  'un objet JSON, sans texte autour : {"nom": string, "muscles": string[], ' +
  '"utilisation": string[], "erreurs": string[], "debutant": string}. ' +
  '"utilisation" = les étapes d\'exécution, 5 maximum. "erreurs" = les fautes ' +
  'courantes, 3 maximum. "debutant" = un réglage de départ prudent. Réponds en ' +
  'français. Si l\'image ne montre pas un appareil de sport, renvoie {"nom": ""}.';

type Fiche = {
  nom?: string; muscles?: string[]; utilisation?: string[]; erreurs?: string[]; debutant?: string;
};

const liste = (v: any): string[] =>
  Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 6) : [];

export default function PageEquipement() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [fiche, setFiche] = useState<Fiche | null>(null);

  const surReponse = useCallback((txt: string) => {
    const o = extraireObjet(txt) as Fiche | null;
    setFiche(o && String(o.nom || '').trim() ? o : null);
  }, []);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('equipTitre')}</h1>
        <p className="me-sous">{t('equipSous')}</p>
      </header>

      <AnalysePhoto
        consigne={CONSIGNE}
        onReponse={surReponse}
        rendu={() => (
          <section className="carte-amis">
            {!fiche ? (
              <p className="me-sous">{t('equipRienLu')}</p>
            ) : (
              <>
                <h2 className="me-h2">{fiche.nom}</h2>

                {liste(fiche.muscles).length ? (
                  <div className="ligne-champ" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
                    {liste(fiche.muscles).map((m) => (
                      <span key={m} className="etiquette-muscle">{m}</span>
                    ))}
                  </div>
                ) : null}

                {([['equipUtilisation', liste(fiche.utilisation)],
                   ['equipErreurs', liste(fiche.erreurs)]] as const).map(([cle, items]) =>
                  items.length ? (
                    <div key={cle}>
                      <h3 className="me-h3">{t(cle)}</h3>
                      <ol className="liste-etapes">
                        {items.map((x, i) => <li key={i}>{x}</li>)}
                      </ol>
                    </div>
                  ) : null,
                )}

                {fiche.debutant ? (
                  <p className="me-note"><strong>{t('equipDebutant')}</strong> {fiche.debutant}</p>
                ) : null}

                <p className="me-erreur">{t('equipAvertissement')}</p>
              </>
            )}
          </section>
        )}
        libelles={{
          choisir: t('equipChoisir'), analyse: t('equipAnalyse'), apercu: t('equipApercu'),
          notePhoto: t('equipNotePhoto'), indispo: t('equipIndispo'), erreur: t('equipErreur'),
          pasDeBackend: t('equipPasDeBackend'), sessionExpiree: t('iaSessionExpiree'),
        }}
      />
    </div>
  );
}
