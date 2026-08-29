'use client';
// Navigation de l'espace personnel — barre latérale GROUPÉE, trilingue.
// ---------------------------------------------------------------------------
// Les groupes disent OÙ chercher (les mêmes familles que les onglets du
// mobile), et le contenu récupère toute la largeur. Sur mobile, la barre
// devient un tiroir : un bouton l'ouvre, un voile la referme.
//
// Trilingue depuis le 20/08/2026 : les PAGES parlaient trois langues mais la
// barre restait en français figé — un utilisateur arabophone naviguait dans
// une langue étrangère. Les libellés vivent ici en {fr, en, ar} plutôt que
// dans i18nMe : ils n'existent que pour cette barre, les colocaliser évite
// 200 lignes de dictionnaire et garde chaque entrée lisible d'un coup d'œil.
import { useState } from 'react';
import SelecteurTheme from '@/components/ui/SelecteurTheme';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/clerk-react';
// Lucide : la bibliotheque d'icones que le MOBILE utilise deja
// (lucide-react-native). Meme langage visuel des deux cotes — et des traits
// dessines, pas des emoji dont le rendu depend de l'OS.
import {
  Home, Hand, UtensilsCrossed, PenLine, Camera, Barcode, Mic, Tag, ReceiptText,
  GlassWater, Gauge, Repeat, Refrigerator, Salad, CookingPot, ChefHat, Link2,
  CalendarRange, NotebookPen, Bookmark, Hourglass, MoonStar, Utensils,
  ShoppingCart, ShoppingBasket, Package, Footprints, Activity, Dumbbell, Cable,
  CalendarDays, Shirt, MapPin, Flag, Trophy, Swords, Building2, Map, Medal,
  Star, Sprout, ChartColumn, Flame, TrendingDown, Scale, BatteryCharging, Dna,
  Microscope, Images, Stethoscope, HeartPulse, Ruler, Pill, StickyNote, Users,
  House, Newspaper, MessageCircle, Gift, Download, Bell, Sparkles,
  ClipboardList, Settings, Lock, FileText, Mail, Menu, X,
  type LucideIcon,
} from 'lucide-react';
import { useMe } from './MeProvider';
import { useProfil, enregistrerTheme, enregistrerLangue } from '../../lib/useFirestoreMe';
import { sensLecture, type Langue } from '../../lib/i18nMe';

type Tri = { fr: string; en: string; ar: string };
type Lien = { href: string; label: Tri; icone: LucideIcon };
type Groupe = { titre: Tri | null; liens: Lien[] };

/** Les 67 routes, inchangées — seuls les libellés sont devenus trilingues. */
const GROUPES: Groupe[] = [
  {
    titre: null,
    liens: [
      { href: '/me', label: { fr: 'Accueil', en: 'Home', ar: 'الرئيسية' }, icone: Home },
      { href: '/me/bienvenue', label: { fr: 'Bienvenue', en: 'Welcome', ar: 'مرحباً' }, icone: Hand },
    ],
  },
  {
    titre: { fr: 'Nutrition', en: 'Nutrition', ar: 'التغذية' },
    liens: [
      { href: '/me/diary', label: { fr: 'Repas du jour', en: "Today's meals", ar: 'وجبات اليوم' }, icone: UtensilsCrossed },
      { href: '/me/saisie', label: { fr: 'Saisie manuelle', en: 'Manual entry', ar: 'إدخال يدوي' }, icone: PenLine },
      { href: '/me/scan', label: { fr: 'Scanner', en: 'Scan a meal', ar: 'مسح وجبة' }, icone: Camera },
      { href: '/me/code-barres', label: { fr: 'Code-barres', en: 'Barcode', ar: 'الباركود' }, icone: Barcode },
      { href: '/me/dicter', label: { fr: 'Dictée', en: 'Dictation', ar: 'الإملاء' }, icone: Mic },
      { href: '/me/etiquette', label: { fr: 'Étiquette', en: 'Label', ar: 'الملصق' }, icone: Tag },
      { href: '/me/ticket', label: { fr: 'Ticket de caisse', en: 'Receipt', ar: 'الإيصال' }, icone: ReceiptText },
      { href: '/me/eau', label: { fr: 'Eau', en: 'Water', ar: 'الماء' }, icone: GlassWater },
      { href: '/me/nutri-score', label: { fr: 'Nutri-Score', en: 'Nutri-Score', ar: 'نوتري سكور' }, icone: Gauge },
      { href: '/me/substitutions', label: { fr: 'Substitutions', en: 'Substitutions', ar: 'البدائل' }, icone: Repeat },
      { href: '/me/frigo', label: { fr: 'Frigo', en: 'Fridge', ar: 'الثلاجة' }, icone: Refrigerator },
      { href: '/me/aliments', label: { fr: 'Aliments', en: 'Foods', ar: 'الأطعمة' }, icone: Salad },
      { href: '/me/composer', label: { fr: 'Composer', en: 'Meal builder', ar: 'تركيب وجبة' }, icone: CookingPot },
      { href: '/me/recettes', label: { fr: 'Recettes', en: 'Recipes', ar: 'الوصفات' }, icone: ChefHat },
      { href: '/me/recette-url', label: { fr: 'Import recette', en: 'Import recipe', ar: 'استيراد وصفة' }, icone: Link2 },
      { href: '/me/plans', label: { fr: 'Plans', en: 'Plans', ar: 'الخطط' }, icone: CalendarRange },
      { href: '/me/plan-ia', label: { fr: 'Plan de repas', en: 'Meal plan', ar: 'خطة الوجبات' }, icone: NotebookPen },
      { href: '/me/modeles', label: { fr: 'Modèles', en: 'Templates', ar: 'القوالب' }, icone: Bookmark },
      { href: '/me/jeune', label: { fr: 'Jeûne', en: 'Fasting', ar: 'الصيام' }, icone: Hourglass },
      { href: '/me/ramadan', label: { fr: 'Ramadan', en: 'Ramadan', ar: 'رمضان' }, icone: MoonStar },
      { href: '/me/restaurant', label: { fr: 'Mode resto', en: 'Restaurant', ar: 'المطعم' }, icone: Utensils },
    ],
  },
  {
    titre: { fr: 'Courses & marché', en: 'Shopping & market', ar: 'التسوّق والسوق' },
    liens: [
      { href: '/me/courses', label: { fr: 'Liste de courses', en: 'Shopping list', ar: 'قائمة التسوّق' }, icone: ShoppingCart },
      { href: '/me/panier', label: { fr: 'Panier du souk', en: 'Souk basket', ar: 'سلّة السوق' }, icone: ShoppingBasket },
      { href: '/me/annonces', label: { fr: 'Annonces', en: 'Listings', ar: 'الإعلانات' }, icone: Package },
    ],
  },
  {
    titre: { fr: 'Sport', en: 'Sport', ar: 'الرياضة' },
    liens: [
      { href: '/me/activite', label: { fr: 'Activité', en: 'Activity', ar: 'النشاط' }, icone: Footprints },
      { href: '/me/seance', label: { fr: 'Dernière séance', en: 'Last session', ar: 'آخر حصة' }, icone: Activity },
      { href: '/me/exercices', label: { fr: 'Exercices', en: 'Exercises', ar: 'التمارين' }, icone: Dumbbell },
      { href: '/me/equipement', label: { fr: 'Équipement', en: 'Equipment', ar: 'المعدّات' }, icone: Cable },
      { href: '/me/agenda', label: { fr: 'Agenda', en: 'Agenda', ar: 'المفكرة الرياضية' }, icone: CalendarDays },
      { href: '/me/matchs', label: { fr: 'Matchs', en: 'Matches', ar: 'المباريات' }, icone: Shirt },
      { href: '/me/terrains', label: { fr: 'Terrains', en: 'Fields', ar: 'الملاعب' }, icone: MapPin },
      { href: '/me/races', label: { fr: 'Courses', en: 'Races', ar: 'السباقات' }, icone: Flag },
      { href: '/me/ligues', label: { fr: 'Ligue', en: 'League', ar: 'الدوري' }, icone: Trophy },
      { href: '/me/duel', label: { fr: 'Duel', en: 'Duel', ar: 'المبارزة' }, icone: Swords },
      { href: '/me/villes', label: { fr: 'Villes', en: 'Cities', ar: 'المدن' }, icone: Building2 },
      { href: '/me/parcours', label: { fr: 'Parcours', en: 'Routes', ar: 'المسارات' }, icone: Map },
      { href: '/me/medailles', label: { fr: 'Médailles', en: 'Medals', ar: 'الميداليات' }, icone: Medal },
      { href: '/me/progression', label: { fr: 'Progression', en: 'Progress', ar: 'التقدّم' }, icone: Star },
      { href: '/me/sadaqa', label: { fr: 'Sadaqa', en: 'Sadaqa', ar: 'صدقة جارية' }, icone: Sprout },
    ],
  },
  {
    titre: { fr: 'Santé', en: 'Health', ar: 'الصحة' },
    liens: [
      { href: '/me/analytics', label: { fr: 'Analyses', en: 'Analytics', ar: 'التحليلات' }, icone: ChartColumn },
      { href: '/me/metabolisme', label: { fr: 'Métabolisme', en: 'Metabolism', ar: 'الأيض' }, icone: Flame },
      { href: '/me/projection', label: { fr: 'Projection', en: 'Projection', ar: 'التوقّع' }, icone: TrendingDown },
      { href: '/me/poids', label: { fr: 'Poids', en: 'Weight', ar: 'الوزن' }, icone: Scale },
      { href: '/me/forme', label: { fr: 'Forme du jour', en: 'Readiness', ar: 'جاهزية اليوم' }, icone: BatteryCharging },
      { href: '/me/composition', label: { fr: 'Composition', en: 'Body composition', ar: 'تركيب الجسم' }, icone: Dna },
      { href: '/me/microbiote', label: { fr: 'Microbiote', en: 'Microbiome', ar: 'الميكروبيوم' }, icone: Microscope },
      { href: '/me/photos', label: { fr: 'Photos de progression', en: 'Progress photos', ar: 'صور التقدّم' }, icone: Images },
      { href: '/me/rapport', label: { fr: 'Rapport', en: 'Health report', ar: 'التقرير الصحي' }, icone: Stethoscope },
      { href: '/me/constantes', label: { fr: 'Constantes', en: 'Vitals', ar: 'المؤشّرات الحيوية' }, icone: HeartPulse },
      { href: '/me/mesures', label: { fr: 'Mensurations', en: 'Measurements', ar: 'القياسات' }, icone: Ruler },
      { href: '/me/micronutriments', label: { fr: 'Micronutriments', en: 'Micronutrients', ar: 'المغذّيات الدقيقة' }, icone: Pill },
    ],
  },
  {
    titre: { fr: 'Social', en: 'Social', ar: 'الاجتماعي' },
    liens: [
      { href: '/me/mur', label: { fr: 'Mur', en: 'Wall', ar: 'الحائط' }, icone: StickyNote },
      { href: '/me/amis', label: { fr: 'Amis', en: 'Friends', ar: 'الأصدقاء' }, icone: Users },
      { href: '/me/famille', label: { fr: 'Famille', en: 'Family', ar: 'العائلة' }, icone: House },
      { href: '/me/journal', label: { fr: 'Journal', en: 'Feed', ar: 'الأخبار' }, icone: Newspaper },
      { href: '/me/coach', label: { fr: 'Coach', en: 'Coach', ar: 'المدرّب' }, icone: MessageCircle },
      { href: '/me/parrainage', label: { fr: 'Parrainage', en: 'Referral', ar: 'الإحالة' }, icone: Gift },
    ],
  },
  {
    titre: { fr: 'Compte', en: 'Account', ar: 'الحساب' },
    liens: [
      { href: '/me/strava', label: { fr: 'Strava', en: 'Strava', ar: 'سترافا' }, icone: Download },
      { href: '/me/import', label: { fr: 'Import', en: 'Import', ar: 'الاستيراد' }, icone: Download },
      { href: '/me/notifications', label: { fr: 'Notifications', en: 'Notifications', ar: 'الإشعارات' }, icone: Bell },
      { href: '/me/abonnement', label: { fr: 'Abonnement', en: 'Subscription', ar: 'الاشتراك' }, icone: Sparkles },
      { href: '/me/reglages', label: { fr: 'Mes infos', en: 'My info', ar: 'معلوماتي' }, icone: ClipboardList },
      { href: '/me/profile', label: { fr: 'Profil', en: 'Profile', ar: 'الملف الشخصي' }, icone: Settings },
      { href: '/me/confidentialite', label: { fr: 'Confidentialité', en: 'Privacy', ar: 'الخصوصية' }, icone: Lock },
      { href: '/me/conditions', label: { fr: 'Conditions', en: 'Terms', ar: 'الشروط' }, icone: FileText },
      { href: '/me/contact', label: { fr: 'Contact', en: 'Contact', ar: 'اتصل بنا' }, icone: Mail },
    ],
  },
];

const MENU: Tri = { fr: 'Menu', en: 'Menu', ar: 'القائمة' };
const MON_COMPTE: Tri = { fr: 'Mon compte', en: 'My account', ar: 'حسابي' };

export default function MeNav() {
  const chemin = usePathname() || '/me';
  const [ouvert, setOuvert] = useState(false);
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  // La langue de la barre est celle du PROFIL — le même réglage que le
  // téléphone et que les pages. Français tant que le profil n'est pas chargé.
  const langue: Langue = (profil?.language as Langue) || 'fr';
  const sens = sensLecture(langue);
  const l = (t: Tri) => t[langue] || t.fr;
  const actif = (href: string) => (href === '/me' ? chemin === '/me' : chemin.startsWith(href));

  return (
    <>
      {/* Mobile : le bouton qui ouvre le tiroir. Invisible au-dela de 980px. */}
      <button
        className="nav-bouton"
        aria-label={l(MENU)}
        aria-expanded={ouvert}
        onClick={() => setOuvert((v) => !v)}
      >
        <span aria-hidden>{ouvert ? <X size={19} /> : <Menu size={19} />}</span>
      </button>
      {ouvert ? <div className="nav-voile" onClick={() => setOuvert(false)} aria-hidden /> : null}

      <aside className={`me-nav${ouvert ? ' nav-ouverte' : ''}`} dir={sens}>
        {/* La marque pointe vers le SITE PUBLIC, plus vers /me lui-meme.
            Depuis l'espace membre, rien ne ramenait a salorie.com : le seul
            chemin etait de retaper l'adresse. Un logo qui renvoie a la page ou
            l'on se trouve deja ne sert a personne — c'est « rentrer » qu'on
            attend d'un logo. L'accueil de l'espace reste accessible par le
            premier lien du menu. */}
        <a className="me-nav-marque" href="/" title="Retour au site public">
          {/* Le VRAI logo — l'exact fichier de l'app mobile, la marque doit etre
              la meme des deux cotes. */}
          <img className="me-nav-logo" src="/me/logo.png" alt="" width={28} height={28} />
          <span>Salorie</span>
        </a>

        {/* Les six themes, ici aussi.
            L'espace membre etait la seule des trois surfaces sans selecteur :
            landing et back-office l'avaient, /me obligeait a repasser par la
            page d'accueil pour changer de palette. Meme composant, meme cle de
            stockage — le choix suit l'utilisateur d'une surface a l'autre. */}
        {/* Les trois langues, sur chaque page de l espace membre.
            Elles n existaient que sur la page d accueil publique : depuis
            /me, changer de langue demandait de ressortir du site. Le
            changement est immediat — `useProfil` ecoute le document, la
            nouvelle valeur redescend sans rechargement. */}
        <div className="me-nav-langues" role="group" aria-label="Langue">
          {(["fr", "en", "ar"] as Langue[]).map((l) => (
            <button
              key={l}
              type="button"
              className={'me-nav-langue' + (langue === l ? ' actif' : '')}
              aria-pressed={langue === l}
              onClick={() => { void enregistrerLangue(uid, l); }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="me-nav-themes">
          {/* Le theme suit l'utilisateur d'un appareil a l'autre.
              Le mobile ecrit `preferences.theme` dans le meme document que
              celui-ci lit : il n'y a pas de synchronisation a maintenir, les
              deux clients ecoutent la meme cle. Le reglage du telephone est
              PROPOSE ici, et cede des que l'utilisateur choisit sur ce
              navigateur — voir `themeDistant` dans le composant. */}
          <SelecteurTheme
            compact
            themeDistant={profil?.preferences?.theme ?? null}
            onChoix={(c) => { void enregistrerTheme(uid, c); }}
          />
        </div>

        <nav className="me-nav-liens">
          {GROUPES.map((g, gi) => (
            <div key={gi} className="nav-groupe">
              {g.titre ? <div className="nav-groupe-titre">{l(g.titre)}</div> : null}
              {g.liens.map((li) => {
                const Icone = li.icone;
                return (
                  <a
                    key={li.href}
                    href={li.href}
                    className={`me-nav-lien${actif(li.href) ? ' actif' : ''}`}
                    onClick={() => setOuvert(false)}
                  >
                    <span className="nav-icone" aria-hidden>
                      <Icone size={15} strokeWidth={2.1} />
                    </span>
                    {l(li.label)}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="me-nav-compte">
          <UserButton afterSignOutUrl="/me" />
          <span className="me-nav-compte-note">{l(MON_COMPTE)}</span>
        </div>
      </aside>
    </>
  );
}
