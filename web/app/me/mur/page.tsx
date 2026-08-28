'use client';
// Le mur : ce que les amis publient, et ce qu'on leur publie.
// ---------------------------------------------------------------------------
// Le fil existant est AUTOMATIQUE — courses, medailles, jalons. Ceci est du texte
// libre, ecrit volontairement. Tout passe donc par le BACKEND : un texte ecrit
// directement dans Firestore contournerait le filtre (liens d'arnaque,
// coordonnees, insultes), la limite de debit, et le signalement que Play exige
// des qu'un utilisateur voit le contenu d'un autre.
//
// Les groupes RESTREIGNENT l'audience, ils ne l'elargissent jamais : un non-ami ne
// voit rien, quel que soit le groupe. La regle vit cote serveur, ou elle compte.
import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { appelApi } from '../../../lib/apiSalorie';

type Publication = {
  id: string;
  auteur: string;
  name: string;
  texte: string;
  image?: string;
  imageType?: string;
  ts: number;
  moi: boolean;
};

type Groupe = { id: string; nom: string; membres: string[] };

const LIMITE = 500;

/** « il y a 3 h » plutot qu'une date : sur un mur, l'anciennete compte plus que le jour. */
function depuis(ts: number, langue: string): string {
  const min = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (min < 1) return langue === 'ar' ? 'الآن' : langue === 'en' ? 'now' : "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return langue === 'ar' ? `${h} س` : `${h} h`;
  const j = Math.floor(h / 24);
  return langue === 'ar' ? `${j} ي` : `${j} j`;
}

export default function PageMur() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [publications, setPublications] = useState<Publication[]>([]);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [charge, setCharge] = useState(false);
  const [texte, setTexte] = useState('');
  const [groupe, setGroupe] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [refus, setRefus] = useState('');

  const charger = useCallback(async () => {
    try {
      const [p, g] = await Promise.all([
        appelApi<Publication[]>('/social/mur'),
        appelApi<Groupe[]>('/social/mur/groupes'),
      ]);
      setPublications(Array.isArray(p) ? p : []);
      setGroupes(Array.isArray(g) ? g : []);
    } catch {
      setPublications([]);
    } finally {
      setCharge(true);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const publier = async () => {
    const v = texte.trim();
    if (!v || occupe) return;
    setOccupe(true);
    setRefus('');
    try {
      const r = await appelApi<{ ok: boolean; motif?: string }>('/social/mur', {
        methode: 'POST',
        corps: { texte: v, groupe },
      });
      if (!r.ok) {
        // Le serveur rend un MOTIF, pas une phrase : c'est lui qui decide, mais
        // c'est ici qu'on sait dans quelle langue le dire.
        setRefus(t(`murRefus_${r.motif}`) || t('murRefusAutre'));
        return;
      }
      setTexte('');
      await charger();
    } catch {
      setRefus(t('murRefusAutre'));
    } finally {
      setOccupe(false);
    }
  };

  const supprimer = async (p: Publication) => {
    if (!window.confirm(t('murSupprimerQ'))) return;
    setPublications((prev) => prev.filter((x) => x.id !== p.id));
    try {
      await appelApi(`/social/mur/${p.id}`, { methode: 'DELETE' });
    } catch {
      await charger();
    }
  };

  const signaler = async (p: Publication) => {
    if (!window.confirm(t('murSignalerQ'))) return;
    try {
      await appelApi(`/social/mur/${p.id}/signaler`, { methode: 'POST' });
      window.alert(t('murSignale'));
    } catch {
      /* un signalement qui echoue ne merite pas d'alerte : il se rejoue */
    }
  };

  const restant = LIMITE - texte.length;

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('murTitre')}</h1>
        <p className="me-sous">{t('murSous')}</p>
      </header>

      <section className="carte-amis">
        <textarea
          className="champ-mur"
          value={texte}
          onChange={(e) => setTexte(e.target.value.slice(0, LIMITE))}
          placeholder={t('murChamp')}
          rows={3}
          aria-label={t('murChamp')}
        />
        <div className="ligne-champ" style={{ marginTop: 10 }}>
          {groupes.length > 0 ? (
            <select
              className="champ-amis"
              style={{ flex: '0 1 200px' }}
              value={groupe}
              onChange={(e) => setGroupe(e.target.value)}
              aria-label={t('murAudience')}
            >
              <option value="">{t('murTousAmis')}</option>
              {groupes.map((g) => (
                <option key={g.id} value={g.id}>{g.nom}</option>
              ))}
            </select>
          ) : null}
          {/* Le compteur n'apparait que dans les cent derniers caracteres : affiche
              d'emblee, il donne l'impression d'ecrire sous contrainte. */}
          {restant <= 100 ? <span className="me-sous">{restant}</span> : null}
          <button className="btn btn-primary" onClick={publier} disabled={!texte.trim() || occupe}>
            {t('murPublier')}
          </button>
        </div>
        {refus ? <p className="me-erreur">{refus}</p> : null}
      </section>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : publications.length === 0 ? (
        <p className="me-sous">{t('murVide')}</p>
      ) : (
        <ul className="liste-mur">
          {publications.map((p) => (
            <li key={p.id} className="carte-publication">
              <div className="pub-entete">
                <strong>{p.name || p.auteur.split('@')[0]}</strong>
                <span className="me-sous">{depuis(p.ts, langue)}</span>
              </div>
              {p.image ? (
                <img loading="lazy" decoding="async"
                  className="pub-image"
                  src={`data:${p.imageType || 'image/jpeg'};base64,${p.image}`}
                  alt={p.texte || ''}
                />
              ) : null}
              {p.texte ? <p className="pub-texte">{p.texte}</p> : null}
              <div className="pub-actions">
                {p.moi ? (
                  <button className="btn btn-ghost" onClick={() => supprimer(p)}>
                    {t('murSupprimer')}
                  </button>
                ) : (
                  // Signaler doit exister sur TOUTE publication qu'on n'a pas
                  // ecrite : Play l'exige des qu'un utilisateur voit le contenu
                  // d'un autre.
                  <button className="btn btn-ghost" onClick={() => signaler(p)}>
                    {t('murSignaler')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
