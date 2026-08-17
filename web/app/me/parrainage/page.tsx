'use client';
// Parrainage — copier un lien et l'envoyer a vingt personnes se fait au clavier.
// ---------------------------------------------------------------------------
// C'est une boucle de croissance : chaque friction s'y paie en installations
// perdues. Sur telephone, partager a vingt contacts demande vingt fois la meme
// serie de gestes ; ici, on copie une fois et on colle ou l'on veut.
import { useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { useApi } from '../../../lib/apiSalorie';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';

type Statut = { code?: string; count?: number; reward?: string | null };

export default function PageParrainage() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const { donnees, charge } = useApi<Statut>('/referral/status');
  const [copie, setCopie] = useState('');

  const code = donnees?.code || '';
  // La source dit par quel canal le filleul est arrive. Sans elle, tout le trafic
  // de parrainage se confond avec le direct et on ne peut rien arbitrer.
  const lien = code ? `https://salorie.com/r?code=${encodeURIComponent(code)}&utm_source=parrainage&utm_medium=web` : '';

  const copier = async (texte: string, quoi: string) => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(quoi);
      // Le retour disparait tout seul : un « copié » qui reste affiche laisse
      // douter de ce qui a ete copie au coup suivant.
      setTimeout(() => setCopie(''), 2200);
    } catch {
      // Le presse-papiers peut etre refuse (page non securisee, permission). Le
      // champ reste selectionnable a la main : on ne bloque personne.
    }
  };

  const message = t('parrainageMessage').replace('{code}', code);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('parrainageTitre')}</h1>
        <p className="me-sous">{t('parrainageSous')}</p>
      </header>

      <section className="carte-amis">
        <h2 className="me-h2">{t('parrainageMonCode')}</h2>
        {!charge ? (
          <p className="me-sous">{t('communChargement')}</p>
        ) : !code ? (
          <p className="me-sous">{t('parrainageAucunCode')}</p>
        ) : (
          <>
            <p className="code-parrainage">{code}</p>
            <div className="ligne-champ">
              <button className="btn btn-primary" onClick={() => copier(lien, 'lien')}>
                {copie === 'lien' ? t('parrainageCopie') : t('parrainageCopierLien')}
              </button>
              <button className="btn btn-ghost" onClick={() => copier(message, 'message')}>
                {copie === 'message' ? t('parrainageCopie') : t('parrainageCopierMessage')}
              </button>
            </div>
            {/* Le lien reste VISIBLE et selectionnable : si le presse-papiers est
                refuse par le navigateur, on peut encore le prendre a la main. */}
            <p className="lien-parrainage">{lien}</p>
          </>
        )}
      </section>

      {charge && code ? (
        <section className="carte-amis">
          <h2 className="me-h2">{t('parrainageFilleuls')}</h2>
          <div className="grille-series">
            <div className="tuile-serie">
              <span className="serie-nombre">{donnees?.count ?? 0}</span>
              <span className="me-sous">{t('parrainageInscrits')}</span>
            </div>
            {donnees?.reward ? (
              <div className="tuile-serie">
                <span className="serie-recompense">{donnees.reward}</span>
                <span className="me-sous">{t('parrainageRecompense')}</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
