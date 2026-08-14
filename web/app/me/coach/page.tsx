'use client';
// Coach IA, version web.
// ---------------------------------------------------------------------------
// Meme persona, meme construction de prompt et meme point d'entree que l'ecran
// mobile (app/(app)/ai-coach.tsx) : la reponse doit etre la meme des deux cotes.
// Le contexte (objectif, consommation du jour) est lu dans Firestore par le
// navigateur, jamais envoye en clair au serveur Next.
//
// Le prompt ne contient AUCUN identifiant — ni nom, ni email — seulement des
// chiffres et un objectif, comme cote backend pour les insights.
import { useEffect, useRef, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil, useJournal, jourLocal, totaux } from '../../../lib/useFirestoreMe';
import { appelApi } from '../../../lib/apiSalorie';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';

type Message = { role: 'coach' | 'moi'; texte: string };

const PERSONAS = [
  {
    id: 'motiv',
    label: { fr: 'Motivant', en: 'Motivating', ar: 'محفّز' },
    p: {
      fr: "un coach énergique et motivant qui booste l'utilisateur",
      en: 'an energetic, motivating coach who hypes the user up',
      ar: 'مدرب نشيط ومحفّز كيشجّع المستعمل بزّاف بالدارجة المغربية',
    },
  },
  {
    id: 'zen',
    label: { fr: 'Bienveillant', en: 'Gentle', ar: 'لطيف' },
    p: {
      fr: 'un coach doux, bienveillant et rassurant',
      en: 'a gentle, caring and reassuring coach',
      ar: 'مدرب لطيف وحنين كيطمّن المستعمل بالدارجة المغربية',
    },
  },
  {
    id: 'pro',
    label: { fr: 'Technique', en: 'Technical', ar: 'تقني' },
    p: {
      fr: 'un coach technique, précis et basé sur la science',
      en: 'a precise, science-based performance coach',
      ar: 'مدرب تقني ودقيق مبني على العلم بالدارجة المغربية',
    },
  },
];

// La consigne de langue du mobile, mot pour mot : la darija marocaine est un choix
// produit, pas un detail — l'arabe standard sonnerait etranger a l'utilisateur cible.
const CONSIGNE_LANGUE: Record<string, string> = {
  ar: 'Réponds en DARIJA MAROCAINE (arabe dialectal du Maroc, en lettres arabes) — surtout PAS en arabe standard. Tiens compte du contexte marocain (plats locaux, halal, Ramadan le cas échéant).',
  fr: 'Réponds en français.',
  en: 'Reply in English.',
};

export default function PageCoach() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const { lignes } = useJournal(uid, jourLocal());
  const langue = (profil?.language || 'fr') as Langue;
  const t = traducteur(langue);
  const dir = sensLecture(langue);

  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [persona, setPersona] = useState('motiv');
  const fin = useRef<HTMLDivElement>(null);
  const auto = useRef(false);

  const tot = totaux(lignes);
  const cible = Number(profil?.nutritionalPlan?.dailyCalories) || 0;

  const contexte = () => {
    const buts: string[] = [];
    if (profil?.goal) buts.push(`objectif ${profil.goal}`);
    if (cible) buts.push(`cible ${cible} kcal/jour`);
    if (profil?.weight) buts.push(`poids ${Math.round(Number(profil.weight))} kg`);
    return `${buts.join(', ') || 'aucun objectif défini'}. Aujourd'hui : ${tot.kcal} kcal consommées, ${tot.proteines} g de protéines, ${tot.nbRepas} repas, ${tot.nbActivites} séance(s), ${tot.eauMl} ml d'eau.`;
  };

  const demander = async (q: string, initial = false) => {
    setOccupe(true);
    if (!initial) setMessages((m) => [...m, { role: 'moi', texte: q }]);
    try {
      const pers = PERSONAS.find((p) => p.id === persona) || PERSONAS[0];
      const ton = (pers.p as any)[langue] || pers.p.fr;
      const consigne = CONSIGNE_LANGUE[langue] || CONSIGNE_LANGUE.fr;
      const prompt = initial
        ? `Tu es ${ton}, coach nutrition & sport. Contexte de l'utilisateur: ${contexte()} Donne 3 conseils personnalisés, courts et actionnables pour aujourd'hui. ${consigne} Format liste à puces.`
        : `Tu es ${ton}, coach nutrition & sport. Contexte: ${contexte()} Question de l'utilisateur: "${q}". ${consigne} Court et actionnable.`;
      const r = await appelApi<{ text: string }>('/ai/generate', { methode: 'POST', corps: { prompt } });
      setMessages((m) => [...m, { role: 'coach', texte: String(r?.text || '').trim() }]);
    } catch (e: any) {
      const msg = String(e?.message || '');
      setMessages((m) => [
        ...m,
        { role: 'coach', texte: msg.includes('429') ? t('coachQuota') : t('coachIndispo') },
      ]);
    } finally {
      setOccupe(false);
    }
  };

  // Conseils du jour au premier chargement, une seule fois et seulement quand le
  // profil est arrive — sans quoi le coach parlerait sans connaitre l'objectif.
  useEffect(() => {
    if (auto.current || !profil) return;
    auto.current = true;
    demander('', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profil]);

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, occupe]);

  const envoyer = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || occupe) return;
    setQuestion('');
    demander(q);
  };

  return (
    <div className="me-page coach-page" dir={dir}>
      <header className="me-entete">
        <h1>{t('coachTitre')}</h1>
        <p className="me-sous">{t('coachSous')}</p>
      </header>

      <div className="coach-personas">
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            className={`onglet${persona === p.id ? ' actif' : ''}`}
            onClick={() => setPersona(p.id)}
            disabled={occupe}
          >
            {(p.label as any)[langue] || p.label.fr}
          </button>
        ))}
      </div>

      <div className="coach-fil">
        {messages.map((m, i) => (
          <div key={i} className={`bulle ${m.role}`}>
            {m.texte.split('\n').map((l, j) => (
              <p key={j}>{l}</p>
            ))}
          </div>
        ))}
        {occupe ? (
          <div className="bulle coach attente">
            <span className="point" />
            <span className="point" />
            <span className="point" />
          </div>
        ) : null}
        <div ref={fin} />
      </div>

      <form className="coach-saisie" onSubmit={envoyer}>
        <input
          className="input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('coachPlaceholder')}
          disabled={occupe}
        />
        <button className="btn btn-primary" type="submit" disabled={occupe || !question.trim()}>
          {t('coachEnvoyer')}
        </button>
      </form>

      <p className="me-note">{t('coachAvertissement')}</p>
    </div>
  );
}
