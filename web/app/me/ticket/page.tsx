'use client';
// Ticket de caisse — extraire les aliments achetés d'une photo.
// ---------------------------------------------------------------------------
// C'est l'écran de la liste qui gagne le PLUS au navigateur : un ticket se
// photographie mal au téléphone qu'on tient d'une main en sortant du magasin,
// et se scanne très bien posé à plat devant un ordinateur. Le résultat, lui,
// se relit sur un écran large sans faire défiler trente lignes.
//
// Le mobile fait un OCR on-device puis envoie le TEXTE au modèle. Ici l'image
// part directement en analyse : un navigateur n'a pas d'OCR hors ligne.
import { useCallback, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import AnalysePhoto from '../AnalysePhoto';
import { extraireListe } from '../../../lib/ia';
import { ajouterArticles } from '../../../lib/listeCoursesWeb';

const CONSIGNE =
  'Cette image est un ticket de caisse. Renvoie UNIQUEMENT un tableau JSON, sans ' +
  'texte autour, des PRODUITS ALIMENTAIRES uniquement — ignore le total, la TVA, ' +
  'l\'enseigne, les sacs et les articles non alimentaires. Format : ' +
  '[{"nom": string, "prix": number|null}]. Si l\'image n\'est pas un ticket de ' +
  'caisse, renvoie [].';

type Article = { nom?: string; prix?: number | null };

export default function PageTicket() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [articles, setArticles] = useState<Article[] | null>(null);
  const [choisis, setChoisis] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState('');

  const surReponse = useCallback((txt: string) => {
    const liste = extraireListe(txt)
      .filter((a) => a && typeof a === 'object' && String(a.nom || '').trim())
      .slice(0, 80) as Article[];
    setArticles(liste);
    // Tout coché par défaut : on vient de photographier ce qu'on a acheté, le
    // cas courant est de tout garder et d'en décocher un ou deux.
    setChoisis(new Set(liste.map((_, i) => i)));
    setMessage('');
  }, []);

  const basculer = (i: number) =>
    setChoisis((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const versCourses = async () => {
    if (!uid || !articles) return;
    const noms = articles.filter((_, i) => choisis.has(i)).map((a) => String(a.nom).trim());
    if (!noms.length) return;
    try {
      await ajouterArticles(uid, noms);
      setMessage(`${noms.length} ${t('ticketAjoutes')}`);
    } catch {
      setMessage(t('ticketErreurAjout'));
    }
  };

  const total = articles
    ? articles.filter((_, i) => choisis.has(i)).reduce((a, x) => a + (Number(x.prix) || 0), 0)
    : 0;

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('ticketTitre')}</h1>
        <p className="me-sous">{t('ticketSous')}</p>
      </header>

      <AnalysePhoto
        consigne={CONSIGNE}
        onReponse={surReponse}
        rendu={() => (
          <section className="carte-amis">
            {!articles || articles.length === 0 ? (
              <p className="me-sous">{t('ticketRienLu')}</p>
            ) : (
              <>
                <h2 className="me-h2">{articles.length} {t('ticketProduits')}</h2>
                <ul className="liste-nue">
                  {articles.map((a, i) => (
                    <li key={i} className="ligne-champ" style={{ justifyContent: 'space-between' }}>
                      <label className="ligne-champ" style={{ gap: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={choisis.has(i)} onChange={() => basculer(i)} />
                        <span>{a.nom}</span>
                      </label>
                      <span className="me-sous">{a.prix != null ? `${Number(a.prix).toFixed(2)}` : '—'}</span>
                    </li>
                  ))}
                </ul>
                <div className="ligne-champ" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                  <span className="me-sous">{t('ticketTotalSelection')}</span>
                  <strong>{total.toFixed(2)}</strong>
                </div>
                <div className="ligne-champ" style={{ marginTop: 8 }}>
                  <button className="btn btn-primary" onClick={versCourses} disabled={!uid || choisis.size === 0}>
                    {t('ticketVersCourses')}
                  </button>
                  {message ? <span className="me-note">{message}</span> : null}
                </div>
                <p className="me-note">{t('ticketNoteVerif')}</p>
              </>
            )}
          </section>
        )}
        libelles={{
          choisir: t('ticketChoisir'), analyse: t('ticketAnalyse'), apercu: t('ticketApercu'),
          notePhoto: t('ticketNotePhoto'), indispo: t('ticketIndispo'), erreur: t('ticketErreur'),
          pasDeBackend: t('ticketPasDeBackend'), sessionExpiree: t('iaSessionExpiree'),
        }}
      />
    </div>
  );
}
