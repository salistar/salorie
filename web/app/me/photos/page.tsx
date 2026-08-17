'use client';
// Photos de progression — comparer deux dates côte à côte.
// ---------------------------------------------------------------------------
// C'est l'écran pour lequel le grand écran change vraiment quelque chose :
// comparer deux photos à trois mois d'écart, sur six pouces, revient à faire
// défiler d'avant en arrière en essayant de se souvenir. Ici les deux tiennent
// à l'écran en même temps.
//
// ⚠ Ces photos vivent désormais sur un serveur, alors que le mobile les gardait
// sur l'appareil. C'est un changement réel, et la page le dit franchement au
// lieu de le laisser découvrir. Les protections sont dans `storage.rules` et
// `lib/photosProgression.ts` : dossier par personne, propriétaire seul, aucune
// exception administrateur, aucune URL conservée.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil, jourLocal } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, locale, type Langue } from '../../../lib/i18nMe';
import { envoyer, lister, supprimer, type PhotoProgression } from '../../../lib/photosProgression';

export default function PagePhotos() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [photos, setPhotos] = useState<PhotoProgression[]>([]);
  const [charge, setCharge] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [gauche, setGauche] = useState<string>('');
  const [droite, setDroite] = useState<string>('');
  const champ = useRef<HTMLInputElement | null>(null);

  const recharger = useCallback(async () => {
    if (!uid) return;
    try {
      const l = await lister(uid);
      setPhotos(l);
      // Par défaut : la première et la dernière. C'est la comparaison qu'on
      // vient chercher, et l'imposer évite deux clics à chaque visite.
      if (l.length >= 2) {
        setGauche((g) => (g && l.some((p) => p.nom === g) ? g : l[0].nom));
        setDroite((d) => (d && l.some((p) => p.nom === d) ? d : l[l.length - 1].nom));
      }
    } catch {
      setErreur(t('photosErreurListe'));
    } finally {
      setCharge(true);
    }
  }, [uid, t]);

  useEffect(() => { recharger(); }, [recharger]);

  const ajouter = async (file: File) => {
    if (!uid || occupe) return;
    setOccupe(true);
    setErreur('');
    try {
      await envoyer(uid, file, jourLocal());
      await recharger();
    } catch (e: any) {
      const m = String(e?.message || '');
      setErreur(
        m === 'pas-une-image' ? t('photosPasImage')
        : m === 'trop-lourde' ? t('photosTropLourde')
        : t('photosErreurEnvoi'),
      );
    } finally {
      setOccupe(false);
    }
  };

  const retirer = async (nom: string) => {
    if (!uid) return;
    try {
      await supprimer(uid, nom);
      await recharger();
    } catch {
      setErreur(t('photosErreurSuppr'));
    }
  };

  const par = useMemo(() => new Map(photos.map((p) => [p.nom, p])), [photos]);
  const dateLisible = (d: string) => {
    const t0 = Date.parse(`${d}T00:00:00`);
    return Number.isFinite(t0)
      ? new Date(t0).toLocaleDateString(locale(langue), { day: 'numeric', month: 'long', year: 'numeric' })
      : d;
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('photosTitre')}</h1>
        <p className="me-sous">{t('photosSous')}</p>
      </header>

      {/* L'avertissement passe en tete : il doit se lire AVANT d'envoyer une
          premiere photo, pas apres. */}
      <section className="carte-amis">
        <p className="me-erreur">{t('photosAvertissement')}</p>
        <p className="me-note">{t('photosProtections')}</p>
      </section>

      <section className="carte-amis">
        <input
          ref={champ} type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) ajouter(f); e.target.value = ''; }}
        />
        <div className="ligne-champ">
          <button className="btn btn-primary" onClick={() => champ.current?.click()} disabled={occupe || !uid}>
            {occupe ? t('photosEnvoi') : t('photosAjouter')}
          </button>
          <span className="me-note">{photos.length} {t('photosEnregistrees')}</span>
        </div>
        {erreur ? <p className="me-erreur">{erreur}</p> : null}
      </section>

      {!charge ? (
        <section className="carte-amis"><p className="me-sous">{t('communChargement')}</p></section>
      ) : photos.length < 2 ? (
        <section className="carte-amis">
          <p className="me-sous">{t('photosPasAssez')}</p>
        </section>
      ) : (
        <section className="carte-amis">
          <h2 className="me-h2">{t('photosComparer')}</h2>
          <div className="photos-duo">
            {([[gauche, setGauche, 'photosAvant'], [droite, setDroite, 'photosApres']] as const).map(
              ([sel, set, cle]) => (
                <div key={cle} className="photos-colonne">
                  <label className="champ-bloc">
                    <span className="me-sous">{t(cle)}</span>
                    <select
                      className="champ-amis" value={sel} onChange={(e) => set(e.target.value)}
                      aria-label={t(cle)}
                    >
                      {photos.map((p) => (
                        <option key={p.nom} value={p.nom}>{dateLisible(p.date)}</option>
                      ))}
                    </select>
                  </label>
                  {par.get(sel) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={par.get(sel)!.url} alt={`${t(cle)} — ${dateLisible(par.get(sel)!.date)}`}
                         className="photos-image" />
                  ) : null}
                </div>
              ),
            )}
          </div>
        </section>
      )}

      {photos.length > 0 ? (
        <section className="carte-amis">
          <h2 className="me-h2">{t('photosToutes')}</h2>
          <ul className="liste-nue">
            {photos.slice().reverse().map((p) => (
              <li key={p.nom} className="ligne-champ" style={{ justifyContent: 'space-between' }}>
                <span className="me-sous">{dateLisible(p.date)}</span>
                <button className="btn btn-ghost" onClick={() => retirer(p.nom)}>
                  {t('photosSupprimer')}
                </button>
              </li>
            ))}
          </ul>
          <p className="me-note">{t('photosNoteSuppr')}</p>
        </section>
      ) : null}
    </div>
  );
}
