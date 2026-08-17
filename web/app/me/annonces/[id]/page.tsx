'use client';
// Détail d'une annonce.
// ---------------------------------------------------------------------------
// Une route à part, et non une modale, pour une raison précise : une annonce
// se PARTAGE. Un lien vers `/me/annonces/abc123` s'envoie à quelqu'un ; une
// modale n'a pas d'adresse, et l'astuce du téléphone — revenir en arrière pour
// fermer — n'existe pas au clavier.
//
// La page relit le filtre de sécurité de la liste : `approved && active`. Le
// faire uniquement côté liste laisserait une annonce non validée visible à
// quiconque en devinerait l'identifiant.
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useMe } from '../../MeProvider';
import { useProfil } from '../../../../lib/useFirestoreMe';
import { traducteur, sensLecture, locale, type Langue } from '../../../../lib/i18nMe';
import { firestore } from '../../../../lib/firebaseClient';

type Annonce = {
  id: string; ownerUid?: string; title?: string; description?: string;
  category?: string; price?: number; placeName?: string; approved?: boolean;
  status?: string; createdTs?: number;
};

export default function PageAnnonce() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = String(params?.id || '');
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [annonce, setAnnonce] = useState<Annonce | null>(null);
  const [charge, setCharge] = useState(false);
  const [message, setMessage] = useState('');

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      const snap = await getDoc(doc(firestore(), 'marketplace_listings', id));
      const d = snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Annonce) : null;
      // Le propriétaire voit toujours la sienne, même en attente de relecture —
      // sinon il croirait sa publication perdue. Les autres ne voient que ce
      // qui est validé ET actif.
      const visible = d && (d.ownerUid === uid || (d.approved === true && d.status === 'active'));
      setAnnonce(visible ? d : null);
    } catch {
      setAnnonce(null);
    } finally {
      setCharge(true);
    }
  }, [id, uid]);

  useEffect(() => { charger(); }, [charger]);

  const marquerVendu = async () => {
    if (!annonce || annonce.ownerUid !== uid) return;
    try {
      await updateDoc(doc(firestore(), 'marketplace_listings', annonce.id), { status: 'sold' });
      setMessage(t('annonceMarqueeVendue'));
      await charger();
    } catch {
      setMessage(t('annonceErreur'));
    }
  };

  const estProprietaire = annonce?.ownerUid === uid;

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <button className="btn btn-ghost" onClick={() => router.push('/me/annonces')}>
          {t('annonceRetour')}
        </button>
      </header>

      {!charge ? (
        <section className="carte-amis"><p className="me-sous">{t('communChargement')}</p></section>
      ) : !annonce ? (
        <section className="carte-amis">
          {/* Introuvable et non-autorise donnent le MEME message : distinguer les
              deux dirait a un curieux qu'une annonce existe a cet identifiant. */}
          <p className="me-sous">{t('annonceIntrouvable')}</p>
        </section>
      ) : (
        <>
          <section className="carte-amis">
            <h1 className="me-h1-annonce">{annonce.title}</h1>
            <div className="ligne-champ" style={{ flexWrap: 'wrap', gap: 10 }}>
              {annonce.price != null && annonce.price > 0 ? (
                <strong className="serie-nombre">{annonce.price}</strong>
              ) : (
                <span className="me-sous">{t('annonceGratuit')}</span>
              )}
              {annonce.category ? <span className="etiquette-muscle">{annonce.category}</span> : null}
              {annonce.placeName ? <span className="me-sous">{annonce.placeName}</span> : null}
            </div>

            {annonce.status === 'sold' ? <p className="me-erreur">{t('annonceVendue')}</p> : null}
            {estProprietaire && annonce.approved !== true ? (
              <p className="me-note">{t('annonceEnAttente')}</p>
            ) : null}
          </section>

          <section className="carte-amis">
            <h2 className="me-h2">{t('annonceDescription')}</h2>
            {/* `pre-wrap` : la description a ete saisie avec des retours a la
                ligne, les ecraser rendrait illisible une annonce structuree. */}
            <p className="texte-ia">{annonce.description}</p>
            {annonce.createdTs ? (
              <p className="me-note">
                {t('annoncePubliee')}{' '}
                {new Date(annonce.createdTs).toLocaleDateString(locale(langue), {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </p>
            ) : null}
          </section>

          {estProprietaire && annonce.status === 'active' ? (
            <section className="carte-amis">
              <div className="ligne-champ">
                <button className="btn btn-primary" onClick={marquerVendu}>
                  {t('annonceMarquerVendue')}
                </button>
                {message ? <span className="me-note">{message}</span> : null}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
