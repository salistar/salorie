'use client';
// Medailles et series — ce qu'on MONTRE.
// ---------------------------------------------------------------------------
// Une medaille sur un ecran de telephone se montre a une personne a la fois ; sur
// un ecran d'ordinateur, a toute une table. Et elle se capture pour etre
// partagee, ce qui est precisement ce a quoi sert une medaille.
//
// Les series viennent des journaux (Firestore), les medailles de l'API — les deux
// memes sources que le telephone.
import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { useApi } from '../../../lib/apiSalorie';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, query, where, getDocs } from 'firebase/firestore';

type Medaille = { id?: string; raceId?: string; name?: string; title?: string; imageUrl?: string; image?: string; earnedAt?: string | number };

const jour = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/**
 * La plus longue serie de jours consecutifs se terminant AUJOURD'HUI ou HIER.
 *
 * « Ou hier » n'est pas une tolerance de confort : quelqu'un qui consulte a 8 h
 * du matin n'a rien logge aujourd'hui, et voir sa serie tomber a zero avant meme
 * le petit-dejeuner est une punition pour rien.
 */
function serie(jours: Set<string>): number {
  const aujourdhui = jour(Date.now());
  const hier = jour(Date.now() - 86400000);
  let curseur = jours.has(aujourdhui) ? aujourdhui : jours.has(hier) ? hier : '';
  if (!curseur) return 0;
  let n = 0;
  let ms = new Date(curseur).getTime();
  while (jours.has(jour(ms))) {
    n += 1;
    ms -= 86400000;
  }
  return n;
}

export default function PageMedailles() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const { donnees: medailles } = useApi<Medaille[]>('/races/medals/me');
  const [series, setSeries] = useState<{ repas: number; activite: number }>({ repas: 0, activite: 0 });
  const [charge, setCharge] = useState(false);

  const charger = useCallback(async () => {
    if (!uid) return;
    try {
      // 90 jours suffisent : une serie plus longue est rarissime, et lire un an de
      // journaux pour l'afficher couterait bien plus que ce que ca apprend.
      const depuis = jour(Date.now() - 90 * 86400000);
      const snap = await getDocs(
        query(collection(firestore(), 'users', uid, 'logs'), where('date', '>=', depuis)),
      );
      const repas = new Set<string>();
      const activite = new Set<string>();
      snap.forEach((d) => {
        const l = d.data() as any;
        if (!l.date) return;
        if (l.type === 'activity') activite.add(String(l.date));
        else repas.add(String(l.date));
      });
      setSeries({ repas: serie(repas), activite: serie(activite) });
    } catch {
      setSeries({ repas: 0, activite: 0 });
    } finally {
      setCharge(true);
    }
  }, [uid]);

  useEffect(() => {
    charger();
  }, [charger]);

  const liste = Array.isArray(medailles) ? medailles : [];

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('medaillesTitre')}</h1>
        <p className="me-sous">{t('medaillesSous')}</p>
      </header>

      <section className="carte-amis">
        <h2 className="me-h2">{t('medaillesSeries')}</h2>
        {!charge ? (
          <p className="me-sous">{t('communChargement')}</p>
        ) : (
          <div className="grille-series">
            <div className="tuile-serie">
              <span className="serie-nombre">{series.repas}</span>
              <span className="me-sous">{t('medaillesSerieRepas')}</span>
            </div>
            <div className="tuile-serie">
              <span className="serie-nombre">{series.activite}</span>
              <span className="me-sous">{t('medaillesSerieActivite')}</span>
            </div>
          </div>
        )}
        <p className="me-note">{t('medaillesSerieNote')}</p>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('medaillesMiennes')} ({liste.length})</h2>
        {liste.length === 0 ? (
          <p className="me-sous">{t('medaillesAucune')}</p>
        ) : (
          <ul className="grille-medailles-web">
            {liste.map((m, i) => (
              <li key={m.id || m.raceId || i} className="carte-medaille">
                {m.imageUrl || m.image ? (
                  <img src={m.imageUrl || m.image} alt="" className="medaille-img" />
                ) : (
                  <div className="medaille-img vide">🏅</div>
                )}
                <strong>{m.name || m.title || t('medaillesSansNom')}</strong>
                {m.earnedAt ? (
                  <span className="me-sous">
                    {new Date(typeof m.earnedAt === 'number' ? m.earnedAt : String(m.earnedAt)).toLocaleDateString(
                      langue === 'ar' ? 'ar-MA' : langue === 'en' ? 'en-GB' : 'fr-FR',
                    )}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
