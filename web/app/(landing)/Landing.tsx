"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import SelecteurTheme from "@/components/ui/SelecteurTheme";
import { Camera, Activity, Brain, TrendingUp, Globe, Shield, Smartphone, ExternalLink, Download, Package, Trophy, Dumbbell, Heart, Sparkles, Quote, ChevronDown, Check, X, LogIn, UserPlus } from "lucide-react";
import type { ReleaseMeta } from "./releaseMeta";
import { lireTemoin } from "../../lib/temoinPrenom";

// L'accent de la landing SUIT LE THEME choisi.
//
// Ces deux constantes valaient "#298f50" / "#1f6b3c". Comme elles alimentent 31
// styles inline, un vert fixe survivait a tous les themes : le fond passait bien
// en dore ou en rose, les boutons restaient verts. C'est ce qui donnait
// l'impression que rien n'avait change.
//
// ⚠ Ce sont des chaines CSS, pas des couleurs manipulables en JS : on ne peut
// donc plus en deriver un rgba(). La ou il fallait de la transparence, on passe
// par color-mix(), qui melange la couleur RESOLUE du theme.
const PRIMARY = "var(--t-accent)";
const PRIMARY_DARK = "var(--t-accent2)";
/** L'accent a l'opacite voulue, quel que soit le theme. */
const teinte = (pct: number) => `color-mix(in srgb, var(--t-accent) ${pct}%, transparent)`;
const REL = "https://github.com/salistar/salorie/releases/download/v1.0.0";
const APK_URL = `${REL}/salorie-v1.0.0-prod.apk`;
const AAB_URL = `${REL}/salorie-v1.0.0-prod.aab`;
// Connect the landing to the live web app.
// L'espace de connexion. Le bouton « Essayer sur le web » qui pointait ici a ete
// retire : il envoyait les visiteurs sur une page de connexion, en laissant croire
// qu'une application web complete existait. On assume desormais ce que c'est —
// se connecter ou creer un compte — et le telechargement redevient l'action
// principale, puisque le produit est mobile.
const APP_URL = "https://app.salorie.com";

const SHOT_SRCS = [
  "/screenshots/01-home.png", "/screenshots/19-scan-barcode.png", "/screenshots/20-nutrients.png",
  "/screenshots/03-analytics.png", "/screenshots/03-coach.png", "/screenshots/04-meal-plan.png",
  "/screenshots/05-social.png", "/screenshots/21-coach-achievements.png", "/screenshots/06-health.png",
  "/screenshots/17-workout-lifting.png", "/screenshots/18-workout-run.png", "/screenshots/07-add-water.png",
  "/screenshots/02-home-activity.png", "/screenshots/12-personal-details.png", "/screenshots/10-notifications.png",
  "/screenshots/11-preferences.png",
];
// Indices used by the auto-playing demo.
const DEMO_IDX = [0, 1, 2, 3, 5, 6];

const FEAT_ICONS = [
  <Camera size={26} key="c" />, <Activity size={26} key="a" />, <Brain size={26} key="b" />,
  <TrendingUp size={26} key="t" />, <Trophy size={26} key="tr" />, <Heart size={26} key="h" />,
  <Dumbbell size={26} key="d" />, <Globe size={26} key="g" />, <Shield size={26} key="s" />,
];

type Lang = "fr" | "en" | "ar";

const T: Record<Lang, any> = {
  fr: {
    dir: "ltr",
    nav: { features: "Fonctions", shots: "Captures", testi: "Avis", download: "Télécharger", member: "Espace membre", admin: "Administration", resume: "Reprendre" },
    badge: "Propulsé par l'IA",
    h1a: "Scanne ton repas,", h1b: "suis tes calories", h1c: ", atteins tes objectifs.",
    heroSub: "Salorie analyse tes repas en temps réel par photo. Macros, calories, micronutriments, coach adaptatif et plans de repas — tout en un scan.",
    ctaApk: "Télécharger l'APK", ctaSee: "Voir l'app",
    stats: [{ v: "100%", l: "Privé & sécurisé" }, { v: "<2s", l: "Analyse IA" }, { v: "3", l: "Langues · FR/EN/AR" }],
    featTitle: "Tout pour atteindre tes objectifs", featSub: "Une app complète, pensée pour de vrais utilisateurs.",
    features: [
      { t: "Scan IA instantané", d: "Photographie ton assiette : l'IA identifie les aliments et calcule les macros en moins de 2 secondes." },
      { t: "Suivi nutritionnel complet", d: "Calories, protéines, glucides, lipides, eau, exercice — centralisés dans un dashboard clair." },
      { t: "Micronutriments + insights", d: "Vitamines, fer, magnésium… estimés par IA, avec recommandations personnalisées en 3 langues." },
      { t: "Coach TDEE adaptatif", d: "Tes besoins recalculés en continu selon ta dépense réelle et ta tendance de poids." },
      { t: "Social & gamification", d: "Classement entre amis, streaks et succès à débloquer pour rester motivé sur la durée." },
      { t: "Health Connect", d: "Synchronise pas, activité et données santé avec l'écosystème Android Health Connect." },
      { t: "Workouts & plans repas", d: "Séances musculation/course avec calories dépensées, et plans de repas générés par IA." },
      { t: "3 langues · RTL", d: "Français, English, العربية — interface arabe right-to-left parfaitement intégrée." },
      { t: "Auth & données sécurisées", d: "Connexion Clerk (Google/email) et Firestore verrouillé par utilisateur." },
    ],
    howTitle: "Comment ça marche",
    steps: [
      { t: "Onboarding rapide", d: "Renseigne ton profil (5 questions). On calcule tes besoins en moins d'une minute." },
      { t: "Scan tes repas", d: "Pointe la caméra sur ton assiette. l'IA te dit ce que tu manges, avec macros précis." },
      { t: "Suis tes progrès", d: "Dashboard quotidien, graphiques hebdo, insights IA pour ajuster ton plan." },
    ],
    demoTitle: "Démo en direct", demoSub: "Un aperçu animé des écrans clés.",
    shotsTitle: "L'app en images", shotsSub: "Captures réelles de Salorie sur Android — 16 écrans.", scrollHint: "← Fais défiler pour voir tous les écrans →",
    shots: ["Tableau de bord", "Scan IA", "Micronutriments", "Analytics & insights", "Coach adaptatif", "Plans de repas", "Classement social", "Gamification", "Health Connect", "Musculation", "Course", "Hydratation", "Activité du jour", "Objectifs perso", "Notifications", "Préférences · 3 langues"],
    testTitle: "Ils utilisent Salorie", testSub: "Retours de nos bêta-testeurs.",
    testimonials: [
      { q: "Le scan IA est bluffant : je photographie mon plat et tout est calculé. Je n'ai jamais autant tenu un suivi.", n: "Yasmine B.", r: "Étudiante, Casablanca" },
      { q: "Le coach adaptatif ajuste mes calories tout seul selon mon poids. Bien plus malin que les autres apps.", n: "Karim L.", r: "Coureur amateur" },
      { q: "Enfin une app en arabe, et le suivi des micronutriments m'aide vraiment au quotidien.", n: "Salma E.", r: "Diététicienne" },
    ],
    dlTitle: "Disponible sur Android", dlSub: "APK signé de production — installation directe. Bientôt sur Google Play.",
    build: "Build", dlApk: "Télécharger l'APK", dlAab: "Bundle .aab (Play Store)", source: "Code source & releases sur GitHub",
    footer: { privacy: "Confidentialité", terms: "Conditions", refund: "Remboursement", contact: "Contact", deleteAccount: "Supprimer mon compte", github: "GitHub", releases: "Versions", bug: "Signaler un bug" },
    releaseNotes: "Notes de version",
  },
  en: {
    dir: "ltr",
    nav: { features: "Features", shots: "Screens", testi: "Reviews", download: "Download", member: "Member area", admin: "Administration", resume: "Resume" },
    badge: "Powered by AI",
    h1a: "Scan your meal,", h1b: "track your calories", h1c: ", hit your goals.",
    heroSub: "Salorie analyzes your meals in real time from a photo. Macros, calories, micronutrients, an adaptive coach and meal plans — all in one scan.",
    ctaApk: "Download the APK", ctaSee: "See the app",
    stats: [{ v: "100%", l: "Private & secure" }, { v: "<2s", l: "AI analysis" }, { v: "3", l: "Languages · EN/FR/AR" }],
    featTitle: "Everything you need to reach your goals", featSub: "A complete app, built for real users.",
    features: [
      { t: "Instant AI scan", d: "Snap your plate: the AI identifies the foods and computes macros in under 2 seconds." },
      { t: "Full nutrition tracking", d: "Calories, protein, carbs, fat, water, exercise — centralized in a clean dashboard." },
      { t: "Micronutrients + insights", d: "Vitamins, iron, magnesium… AI-estimated, with personalized tips in 3 languages." },
      { t: "Adaptive TDEE coach", d: "Your needs recalculated continuously from your real burn and weight trend." },
      { t: "Social & gamification", d: "Leaderboard with friends, streaks and achievements to stay motivated over time." },
      { t: "Health Connect", d: "Sync steps, activity and health data with the Android Health Connect ecosystem." },
      { t: "Workouts & meal plans", d: "Lifting/running sessions with calories burned, plus AI-generated meal plans." },
      { t: "3 languages · RTL", d: "Français, English, العربية — Arabic right-to-left UI fully integrated." },
      { t: "Secure auth & data", d: "Clerk sign-in (Google/email) and per-user locked Firestore." },
    ],
    howTitle: "How it works",
    steps: [
      { t: "Quick onboarding", d: "Fill in your profile (5 questions). We compute your needs in under a minute." },
      { t: "Scan your meals", d: "Point the camera at your plate. the AI tells you what you're eating, with precise macros." },
      { t: "Track progress", d: "Daily dashboard, weekly charts, AI insights to fine-tune your plan." },
    ],
    demoTitle: "Live demo", demoSub: "An animated preview of the key screens.",
    shotsTitle: "The app in pictures", shotsSub: "Real captures of Salorie on Android — 16 screens.", scrollHint: "← Scroll to see all screens →",
    shots: ["Dashboard", "AI scan", "Micronutrients", "Analytics & insights", "Adaptive coach", "Meal plans", "Social leaderboard", "Gamification", "Health Connect", "Lifting", "Running", "Hydration", "Daily activity", "Personal goals", "Notifications", "Preferences · 3 languages"],
    testTitle: "They use Salorie", testSub: "Feedback from our beta testers.",
    testimonials: [
      { q: "The AI scan is mind-blowing: I photograph my dish and everything is calculated. I've never tracked so consistently.", n: "Yasmine B.", r: "Student, Casablanca" },
      { q: "The adaptive coach adjusts my calories on its own based on my weight. Way smarter than other apps.", n: "Karim L.", r: "Amateur runner" },
      { q: "Finally an app in Arabic, and the micronutrient tracking genuinely helps me day to day.", n: "Salma E.", r: "Dietitian" },
    ],
    dlTitle: "Available on Android", dlSub: "Signed production APK — direct install. Coming soon to Google Play.",
    build: "Build", dlApk: "Download the APK", dlAab: "Bundle .aab (Play Store)", source: "Source code & releases on GitHub",
    footer: { privacy: "Privacy", terms: "Terms", refund: "Refunds", contact: "Contact", deleteAccount: "Delete my account", github: "GitHub", releases: "Releases", bug: "Report a bug" },
    releaseNotes: "Release notes",
  },
  ar: {
    dir: "rtl",
    nav: { features: "الميزات", shots: "اللقطات", testi: "الآراء", download: "تحميل", member: "حسابي", admin: "الإدارة", resume: "متابعة" },
    badge: "مدعوم بالذكاء الاصطناعي",
    h1a: "صوّر وجبتك،", h1b: "تتبّع سعراتك", h1c: "، وحقّق أهدافك.",
    heroSub: "يحلّل Salorie وجباتك فوريًا من صورة. الماكروز والسعرات والعناصر الدقيقة ومدرّب متكيّف وخطط وجبات — كل ذلك بمسحة واحدة.",
    ctaApk: "تحميل APK", ctaSee: "شاهد التطبيق",
    stats: [{ v: "100%", l: "خاص وآمن" }, { v: "<2 ث", l: "تحليل بالذكاء" }, { v: "3", l: "لغات · ع/إن/فر" }],
    featTitle: "كل ما تحتاجه لتحقيق أهدافك", featSub: "تطبيق متكامل مصمّم لمستخدمين حقيقيين.",
    features: [
      { t: "مسح فوري بالذكاء", d: "صوّر طبقك: يتعرّف الذكاء الاصطناعي على الأطعمة ويحسب الماكروز في أقل من ثانيتين." },
      { t: "تتبّع غذائي كامل", d: "السعرات والبروتين والكربوهيدرات والدهون والماء والتمارين — في لوحة واحدة واضحة." },
      { t: "عناصر دقيقة + رؤى", d: "الفيتامينات والحديد والمغنيسيوم… تُقدَّر بالذكاء مع نصائح مخصّصة بثلاث لغات." },
      { t: "مدرّب TDEE متكيّف", d: "تُعاد حسابات احتياجك باستمرار وفق حرقك الفعلي واتجاه وزنك." },
      { t: "اجتماعي وتحفيز", d: "ترتيب بين الأصدقاء وسلاسل وإنجازات للبقاء متحفزًا على المدى الطويل." },
      { t: "Health Connect", d: "مزامنة الخطوات والنشاط وبيانات الصحة مع منظومة أندرويد Health Connect." },
      { t: "تمارين وخطط وجبات", d: "جلسات حديد/جري مع السعرات المحروقة وخطط وجبات يولّدها الذكاء." },
      { t: "3 لغات · RTL", d: "العربية والإنجليزية والفرنسية — واجهة عربية من اليمين لليسار مدمجة بإتقان." },
      { t: "مصادقة وبيانات آمنة", d: "تسجيل عبر Clerk (Google/البريد) وFirestore مقفل لكل مستخدم." },
    ],
    howTitle: "كيف يعمل",
    steps: [
      { t: "إعداد سريع", d: "أدخل ملفك (5 أسئلة). نحسب احتياجك في أقل من دقيقة." },
      { t: "صوّر وجباتك", d: "وجّه الكاميرا نحو طبقك. يخبرك l’IA بما تأكله مع ماكروز دقيقة." },
      { t: "تابع تقدّمك", d: "لوحة يومية ورسوم أسبوعية ورؤى بالذكاء لضبط خطتك." },
    ],
    demoTitle: "عرض مباشر", demoSub: "معاينة متحركة للشاشات الرئيسية.",
    shotsTitle: "التطبيق بالصور", shotsSub: "لقطات حقيقية من Salorie على أندرويد — 16 شاشة.", scrollHint: "← مرّر لرؤية كل الشاشات →",
    shots: ["لوحة التحكم", "مسح بالذكاء", "العناصر الدقيقة", "التحليلات والرؤى", "المدرّب المتكيّف", "خطط الوجبات", "الترتيب الاجتماعي", "التحفيز", "Health Connect", "حديد", "جري", "الترطيب", "نشاط اليوم", "الأهداف الشخصية", "الإشعارات", "التفضيلات · 3 لغات"],
    testTitle: "يستخدمون Salorie", testSub: "آراء من المختبرين الأوائل.",
    testimonials: [
      { q: "المسح بالذكاء مذهل: أصوّر طبقي فيُحسب كل شيء. لم ألتزم بالتتبّع هكذا من قبل.", n: "ياسمين ب.", r: "طالبة، الدار البيضاء" },
      { q: "المدرّب المتكيّف يضبط سعراتي تلقائيًا حسب وزني. أذكى بكثير من التطبيقات الأخرى.", n: "كريم ل.", r: "عدّاء هاوٍ" },
      { q: "أخيرًا تطبيق بالعربية، وتتبّع العناصر الدقيقة يساعدني فعلاً يوميًا.", n: "سلمى إ.", r: "أخصائية تغذية" },
    ],
    dlTitle: "متوفّر على أندرويد", dlSub: "APK موقّع للإنتاج — تثبيت مباشر. قريبًا على Google Play.",
    build: "إصدار", dlApk: "تحميل APK", dlAab: "حزمة ‎.aab (Play Store)", source: "الشيفرة والإصدارات على GitHub",
    footer: { privacy: "الخصوصية", terms: "الشروط", refund: "الاسترداد", contact: "اتصل بنا", deleteAccount: "حذف حسابي", github: "GitHub", releases: "الإصدارات", bug: "الإبلاغ عن خلل" },
    releaseNotes: "ملاحظات الإصدار",
  },
};

const FAQ: Record<Lang, { faqTitle: string; faqSub: string; items: { q: string; a: string }[] }> = {
  fr: {
    faqTitle: "Questions fréquentes", faqSub: "Tout ce qu'il faut savoir avant de commencer.",
    items: [
      { q: "Salorie est-il gratuit ?", a: "Oui, les fonctions principales (scan IA, suivi, coach) sont gratuites. L'offre Premium optionnelle — 4,99 €/mois ou 29,99 €/an — débloque des insights avancés." },
      { q: "Le scan par photo est-il précis ?", a: "Il utilise l'IA l’IA pour estimer les aliments et les macros. Tu peux toujours ajuster les quantités avant d'enregistrer." },
      { q: "Mes données sont-elles privées ?", a: "Oui. Chaque utilisateur n'accède qu'à ses propres données (Firestore verrouillé par utilisateur, connexion sécurisée Clerk)." },
      { q: "Sur quelles plateformes ?", a: "Android maintenant (APK signé, bientôt sur Google Play). iOS est prévu." },
      { q: "L'app est-elle en arabe ?", a: "Oui — français, anglais et arabe, avec une interface RTL complète." },
    ],
  },
  en: {
    faqTitle: "Frequently asked questions", faqSub: "Everything you need to know before starting.",
    items: [
      { q: "Is Salorie free?", a: "Yes, the core features (AI scan, tracking, coach) are free. The optional Premium tier — €4.99/month or €29.99/year — unlocks advanced insights." },
      { q: "Is the photo scan accurate?", a: "It uses l’IA AI to estimate foods and macros. You can always adjust the quantities before saving." },
      { q: "Is my data private?", a: "Yes. Each user can only access their own data (per-user locked Firestore, secure Clerk sign-in)." },
      { q: "Which platforms?", a: "Android now (signed APK, soon on Google Play). iOS is planned." },
      { q: "Is the app available in Arabic?", a: "Yes — French, English and Arabic, with a full RTL interface." },
    ],
  },
  ar: {
    faqTitle: "الأسئلة الشائعة", faqSub: "كل ما تحتاج معرفته قبل البدء.",
    items: [
      { q: "هل Salorie مجاني؟", a: "نعم، الميزات الأساسية (المسح بالذكاء، التتبّع، المدرّب) مجانية. وتتيح باقة Premium الاختيارية — 4.99 € شهريًا أو 29.99 € سنويًا — رؤى متقدمة." },
      { q: "هل المسح بالصورة دقيق؟", a: "يستخدم ذكاء l’IA لتقدير الأطعمة والماكروز. يمكنك دائمًا تعديل الكميات قبل الحفظ." },
      { q: "هل بياناتي خاصة؟", a: "نعم. كل مستخدم يصل إلى بياناته فقط (Firestore مقفل لكل مستخدم وتسجيل آمن عبر Clerk)." },
      { q: "ما المنصات المدعومة؟", a: "أندرويد الآن (APK موقّع، وقريبًا على Google Play). iOS قيد التخطيط." },
      { q: "هل التطبيق متوفر بالعربية؟", a: "نعم — الفرنسية والإنجليزية والعربية، بواجهة RTL كاملة." },
    ],
  },
};

const COMPARE: Record<Lang, { title: string; sub: string; us: string; them: string; rows: { f: string; us: boolean | string; them: boolean | string }[] }> = {
  fr: {
    title: "Pourquoi Salorie", sub: "Comparé aux apps de suivi classiques.", us: "Salorie", them: "Autres apps",
    rows: [
      { f: "Scan repas par IA (photo)", us: true, them: "Souvent payant" },
      { f: "Micronutriments estimés", us: true, them: false },
      { f: "Coach TDEE adaptatif", us: true, them: "Rarement" },
      { f: "3 langues + arabe RTL", us: true, them: false },
      { f: "Social & gamification", us: true, them: "Limité" },
      { f: "Health Connect", us: true, them: "Parfois" },
    ],
  },
  en: {
    title: "Why Salorie", sub: "Compared to classic tracking apps.", us: "Salorie", them: "Other apps",
    rows: [
      { f: "AI meal scan (photo)", us: true, them: "Often paid" },
      { f: "Estimated micronutrients", us: true, them: false },
      { f: "Adaptive TDEE coach", us: true, them: "Rarely" },
      { f: "3 languages + Arabic RTL", us: true, them: false },
      { f: "Social & gamification", us: true, them: "Limited" },
      { f: "Health Connect", us: true, them: "Sometimes" },
    ],
  },
  ar: {
    title: "لماذا Salorie", sub: "مقارنةً بتطبيقات التتبّع التقليدية.", us: "Salorie", them: "تطبيقات أخرى",
    rows: [
      { f: "مسح الوجبة بالذكاء (صورة)", us: true, them: "غالبًا مدفوع" },
      { f: "تقدير العناصر الدقيقة", us: true, them: false },
      { f: "مدرّب TDEE متكيّف", us: true, them: "نادرًا" },
      { f: "3 لغات + عربية RTL", us: true, them: false },
      { f: "اجتماعي وتحفيز", us: true, them: "محدود" },
      { f: "Health Connect", us: true, them: "أحيانًا" },
    ],
  },
};

const PRICING: Record<Lang, {
  title: string; sub: string;
  free: { name: string; price: string; items: string[] };
  premium: { name: string; badge: string; mo: string; moSuffix: string; yrLine: string; items: string[]; note: string };
}> = {
  fr: {
    title: "Tarifs simples", sub: "Gratuit pour l'essentiel. Premium pour aller plus loin.",
    free: { name: "Gratuit", price: "0 €", items: ["Scan IA des repas", "Suivi calories, macros & eau", "Coach TDEE adaptatif", "Social & gamification"] },
    premium: {
      name: "Salorie Premium", badge: "Bientôt", mo: "4,99 €", moSuffix: "/ mois",
      yrLine: "ou 29,99 € / an — 2 mois offerts",
      items: ["Tout le gratuit, plus :", "Insights IA avancés", "Micronutriments détaillés", "Plans de repas IA illimités", "Support prioritaire"],
      note: "Prix en EUR, taxes incluses selon ton pays. Annulable à tout moment. Garantie 14 jours satisfait ou remboursé sur les achats web.",
    },
  },
  en: {
    title: "Simple pricing", sub: "Free for the essentials. Premium to go further.",
    free: { name: "Free", price: "€0", items: ["AI meal scan", "Calories, macros & water tracking", "Adaptive TDEE coach", "Social & gamification"] },
    premium: {
      name: "Salorie Premium", badge: "Coming soon", mo: "€4.99", moSuffix: "/ month",
      yrLine: "or €29.99 / year — 2 months free",
      items: ["Everything in Free, plus:", "Advanced AI insights", "Detailed micronutrients", "Unlimited AI meal plans", "Priority support"],
      note: "Prices in EUR, tax included where applicable. Cancel anytime. 14-day money-back guarantee on web purchases.",
    },
  },
  ar: {
    title: "أسعار بسيطة", sub: "مجاني للأساسيات. وPremium للذهاب أبعد.",
    free: { name: "مجاني", price: "0 €", items: ["مسح الوجبات بالذكاء", "تتبّع السعرات والماكروز والماء", "مدرّب TDEE متكيّف", "اجتماعي وتحفيز"] },
    premium: {
      name: "Salorie Premium", badge: "قريبًا", mo: "4.99 €", moSuffix: "/ شهريًا",
      yrLine: "أو 29.99 € سنويًا — شهران مجانًا",
      items: ["كل المجاني، بالإضافة إلى:", "رؤى متقدمة بالذكاء", "عناصر دقيقة مفصّلة", "خطط وجبات غير محدودة", "دعم ذو أولوية"],
      note: "الأسعار بالدولار وتشمل الضرائب حسب بلدك. يمكن الإلغاء في أي وقت. ضمان استرداد خلال 14 يومًا لمشتريات الويب.",
    },
  },
};

export default function Landing({
  meta,
  langueForcee,
}: {
  // Type importe plutot que redeclare : une copie locale aurait diverge des
  // que releaseMeta.ts a gagne les URLs et les empreintes.
  meta: ReleaseMeta;
  /** Langue imposee par l'URL (/en, /ar). Quand elle est fournie, ni la preference
   *  memorisee ni celle du navigateur ne s'y substituent : une page servie sous /en
   *  DOIT rendre de l'anglais, sinon Google indexerait un contenu qui ne correspond
   *  pas a son URL — et le lecteur arrive dans une langue qu'il n'a pas demandee. */
  langueForcee?: Lang;
}) {
  const [lang, setLang] = useState<Lang>(langueForcee ?? "fr");
  const [demo, setDemo] = useState(0);

  // Restore prefs.
  useEffect(() => {
    const nav = (typeof navigator !== "undefined" ? navigator.language : "").slice(0, 2);
    const detected: Lang = nav === "ar" ? "ar" : nav === "en" ? "en" : "fr";
    const sl = langueForcee || (localStorage.getItem("salorie-lang") as Lang) || detected;
    setLang(sl);
  }, []);
  // ⚠ LA LANDING NE GERE PLUS LE THEME — et surtout ne l'ECRIT plus.
  // Elle en gardait une copie initialisee a "light". Au montage, l'effet
  // ecrivait donc "light" dans localStorage AVANT que la valeur memorisee ne
  // soit restauree : un theme « ocean » choisi puis rechargé revenait en
  // clair. C'est le selecteur a six pastilles qui en est proprietaire, et le
  // script du layout qui le pose avant la premiere peinture.
  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", T[lang].dir);
    localStorage.setItem("salorie-lang", lang);
  }, [lang]);
  // Auto-play demo.
  useEffect(() => {
    const id = setInterval(() => setDemo((d) => (d + 1) % DEMO_IDX.length), 2200);
    return () => clearInterval(id);
  }, []);

  // ⚠ Lu dans un effet, PAS a l'initialisation : le serveur rend cette page en
  // statique et n'a pas de cookie. Initialiser depuis `document` ferait diverger
  // le HTML serveur et le premier rendu client — React signalerait une erreur
  // d'hydratation, et le bouton pourrait clignoter.
  const [prenom, setPrenom] = useState<string | null>(null);
  useEffect(() => { setPrenom(lireTemoin()); }, []);

  const t = T[lang];
  const faq = FAQ[lang];
  const cmp = COMPARE[lang];
  const pr = PRICING[lang];
  const dateStr = meta?.iso ? new Date(meta.iso).toLocaleDateString(lang === "ar" ? "ar" : lang === "en" ? "en-GB" : "fr-FR", { year: "numeric", month: "long", day: "numeric" }) : null;
  const demoShot = DEMO_IDX[demo];

  return (
    <main style={{ overflow: "hidden" }}>
      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "var(--nav-bg)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="Salorie" width={34} height={34} style={{ borderRadius: 10, boxShadow: `0 4px 12px ${teinte(25)}` }} />
            <span style={{ fontSize: 21, fontWeight: 900, letterSpacing: -0.5 }}>Salorie</span>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <a className="nav-text" href="#features" style={navLink}>{t.nav.features}</a>
            <a className="nav-text" href="#screenshots" style={navLink}>{t.nav.shots}</a>
            <a className="nav-text" href="#testimonials" style={navLink}>{t.nav.testi}</a>
            {/* Language switcher */}
            <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", padding: 4, borderRadius: 10 }}>
              {(["fr", "en", "ar"] as Lang[]).map((l) => (
                <button key={l} onClick={() => setLang(l)} style={{
                  border: "none", cursor: "pointer", padding: "5px 9px", borderRadius: 7, fontSize: 12, fontWeight: 800,
                  background: lang === l ? PRIMARY : "transparent", color: lang === l ? "#fff" : "var(--muted)",
                }}>{l.toUpperCase()}</button>
              ))}
            </div>
            {/* Les six themes, et non plus deux.
                La bascule lune n'ouvrait que clair/sombre : quatre palettes sur
                six etaient inatteignables depuis la page d'accueil. Le
                selecteur est le MEME composant que dans /me et le back-office,
                et il ecrit la meme cle — un choix fait ici suit l'utilisateur
                partout. */}
            <SelecteurTheme compact />
            {/* GitHub n'est PLUS ici.
                Le code source n'interesse pas un visiteur venu suivre ses
                calories : ce lien occupait une place de premier plan pour un
                usage reserve a l'equipe. Il vit desormais dans la barre du
                back-office, apres identification. */}

            {/* Espace membre — la porte d'entree qui manquait : RIEN, sur la
                landing, ne menait a l'application web.
                Le libelle devient « Reprendre — {prenom} » quand un temoin est
                present. Ce temoin est un simple cookie, lu ICI, dans le
                navigateur : le lire cote serveur rendrait la page dynamique et
                lui ferait perdre son cache CDN, et passer par Clerk couterait
                407 Ko sur une page publique qui en pese 706. */}
            <a href="/me"
               style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 10, background: prenom ? PRIMARY : "var(--surface-2)", border: prenom ? "1px solid transparent" : "1px solid var(--border)", color: prenom ? "#fff" : "var(--text)", fontWeight: 700, fontSize: 14 }}>
              {prenom ? `${t.nav.resume} — ${prenom}` : t.nav.member}
            </a>

            <a href="#download"
               style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 10, background: PRIMARY, color: "#fff", fontWeight: 800, fontSize: 14 }}>
              {t.nav.download}
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ paddingTop: 128, paddingBottom: 64, background: `radial-gradient(1200px 500px at 80% -10%, ${teinte(10)}, transparent), linear-gradient(180deg, var(--hero-from) 0%, transparent 60%)` }}>
        <div className="hero-grid" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999, background: teinte(12), color: PRIMARY, fontSize: 13, fontWeight: 800, marginBottom: 22 }}>
              <Sparkles size={14} /> {t.badge}
            </div>
            <h1 className="h1-resp" style={{ fontSize: 54, fontWeight: 900, lineHeight: 1.06, letterSpacing: -1.5, margin: "0 0 22px 0" }}>
              {t.h1a}<br /><span style={{ color: PRIMARY }}>{t.h1b}</span>{t.h1c}
            </h1>
            <p style={{ fontSize: 19, color: "var(--muted-2)", lineHeight: 1.6, margin: "0 0 30px 0", maxWidth: 520 }}>{t.heroSub}</p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <a href={APK_URL} download style={{ ...btnPrimary, boxShadow: `0 10px 30px ${teinte(30)}` }}>
                <Download size={18} /> {t.ctaApk}{meta?.apkMB && <span style={{ opacity: 0.8, fontSize: 13 }}>({meta.apkMB} MB)</span>}
              </a>
              <a href={`${APP_URL}/login`} target="_blank" rel="noopener" style={btnGhost}>
                <LogIn size={18} /> {({ fr: "Se connecter", en: "Sign in", ar: "تسجيل الدخول" } as Record<Lang, string>)[lang]}
              </a>
              <a href={`${APP_URL}/register`} target="_blank" rel="noopener" style={btnGhost}>
                <UserPlus size={18} /> {({ fr: "Créer un compte", en: "Create an account", ar: "إنشاء حساب" } as Record<Lang, string>)[lang]}
              </a>
              <a href="#screenshots" style={btnGhost}><Smartphone size={18} /> {t.ctaSee}</a>
            </div>
            <div style={{ display: "flex", gap: 30, marginTop: 42, flexWrap: "wrap" }}>
              {t.stats.map((s: any, i: number) => (
                <div key={i}><div style={{ fontSize: 27, fontWeight: 900, color: PRIMARY }}>{s.v}</div><div style={{ fontSize: 13, color: "var(--muted)" }}>{s.l}</div></div>
              ))}
            </div>
          </div>
          <div className="hero-phone" style={{ position: "relative", height: 620, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", width: 360, height: 360, borderRadius: "50%", background: `radial-gradient(circle, ${teinte(20)}, transparent 70%)`, filter: "blur(20px)" }} />
            <Phone src={SHOT_SRCS[0]} big />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <Reveal>
      <section id="features" style={{ padding: "66px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <Head title={t.featTitle} sub={t.featSub} />
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22 }}>
            {t.features.map((f: any, i: number) => (
              <div key={i} style={card}>
                <div style={{ width: 54, height: 54, borderRadius: 14, background: teinte(12), color: PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>{FEAT_ICONS[i]}</div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{f.t}</h3>
                <p style={{ fontSize: 15, color: "var(--muted)", marginTop: 10, marginBottom: 0, lineHeight: 1.6 }}>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      </Reveal>

      {/* DEMO (auto-play) */}
      <section id="demo" style={{ padding: "66px 24px", background: "var(--how-bg)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }} className="hero-grid">
          <div>
            <Head title={t.demoTitle} sub={t.demoSub} left />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {DEMO_IDX.map((idx, i) => (
                <button key={i} onClick={() => setDemo(i)} aria-label="demo" style={{
                  border: "none", cursor: "pointer", height: 8, borderRadius: 999,
                  width: demo === i ? 28 : 8, background: demo === i ? PRIMARY : "var(--border)", transition: "all .3s",
                }} />
              ))}
            </div>
            <p style={{ marginTop: 18, fontSize: 17, fontWeight: 800, color: PRIMARY }}>{t.shots[demoShot]}</p>
          </div>
          <div className="hero-phone" style={{ display: "flex", justifyContent: "center" }}>
            <Phone key={demoShot} src={SHOT_SRCS[demoShot]} fade />
          </div>
        </div>
      </section>

      {/* SCREENSHOTS */}
      <section id="screenshots" style={{ padding: "66px 0 26px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
          <Head title={t.shotsTitle} sub={t.shotsSub} />
        </div>
        <div className="shots-scroll" style={{ display: "flex", gap: 26, overflowX: "auto", padding: "26px 24px 34px", scrollSnapType: "x mandatory" }}>
          {SHOT_SRCS.map((src, i) => (
            <div key={src} style={{ flex: "0 0 auto", scrollSnapAlign: "center", textAlign: "center" }}>
              <Phone src={src} />
              <div style={{ marginTop: 13, fontSize: 14, fontWeight: 700, color: "var(--muted-2)" }}>{t.shots[i]}</div>
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, marginTop: 4 }}>{t.scrollHint}</p>
      </section>

      {/* TESTIMONIALS */}
      <Reveal>
      <section id="testimonials" style={{ padding: "66px 24px", background: "var(--how-bg)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <Head title={t.testTitle} sub={t.testSub} />
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22 }}>
            {t.testimonials.map((tm: any, i: number) => (
              <div key={i} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                <Quote size={26} color={PRIMARY} />
                <p style={{ fontSize: 15.5, lineHeight: 1.65, margin: 0, color: "var(--text)" }}>{tm.q}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "auto" }}>
                  <div style={{ width: 42, height: 42, borderRadius: 999, background: "linear-gradient(135deg," + PRIMARY + "," + PRIMARY_DARK + ")", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{tm.n.charAt(0)}</div>
                  <div><div style={{ fontWeight: 800, fontSize: 14 }}>{tm.n}</div><div style={{ fontSize: 13, color: "var(--muted)" }}>{tm.r}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      </Reveal>

      {/* COMPARISON */}
      <Reveal>
        <section id="compare" style={{ padding: "66px 24px" }}>
          <div style={{ maxWidth: 820, margin: "0 auto" }}>
            <Head title={cmp.title} sub={cmp.sub} />
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr" }}>
                <Cell>{""}</Cell>
                <Cell accent>{cmp.us}</Cell>
                <Cell>{cmp.them}</Cell>
                {cmp.rows.map((r, i) => (
                  <CmpRow key={i} feat={r.f} us={r.us} them={r.them} last={i === cmp.rows.length - 1} />
                ))}
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* PRICING */}
      <Reveal>
        <section id="pricing" style={{ padding: "66px 24px" }}>
          <div style={{ maxWidth: 820, margin: "0 auto" }}>
            <Head title={pr.title} sub={pr.sub} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 22, alignItems: "stretch" }}>
              <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ fontWeight: 900, fontSize: 20 }}>{pr.free.name}</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: PRIMARY }}>{pr.free.price}</div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                  {pr.free.items.map((it, i) => (
                    <li key={i} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14.5 }}><Check size={17} color={PRIMARY} style={{ flex: "0 0 auto" }} /> {it}</li>
                  ))}
                </ul>
              </div>
              <div style={{ ...card, border: `2px solid ${PRIMARY}`, display: "flex", flexDirection: "column", gap: 14, position: "relative" }}>
                <div style={{ position: "absolute", top: -13, insetInlineStart: 20, background: PRIMARY, color: "#fff", fontSize: 12, fontWeight: 800, padding: "4px 12px", borderRadius: 999 }}>{pr.premium.badge}</div>
                <div style={{ fontWeight: 900, fontSize: 20 }}>{pr.premium.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 36, fontWeight: 900, color: PRIMARY }}>{pr.premium.mo}</span>
                  <span style={{ color: "var(--muted)", fontSize: 14.5, fontWeight: 700 }}>{pr.premium.moSuffix}</span>
                </div>
                <div style={{ color: "var(--muted-2)", fontSize: 14.5, fontWeight: 700 }}>{pr.premium.yrLine}</div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                  {pr.premium.items.map((it, i) => (
                    <li key={i} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14.5, fontWeight: i === 0 ? 700 : 400 }}>
                      {i > 0 && <Check size={17} color={PRIMARY} style={{ flex: "0 0 auto" }} />} {it}
                    </li>
                  ))}
                </ul>
                <p style={{ margin: "auto 0 0", color: "var(--muted)", fontSize: 12.5, lineHeight: 1.55 }}>{pr.premium.note}</p>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {/* FAQ */}
      <Reveal>
        <section id="faq" style={{ padding: "66px 24px", background: "var(--how-bg)" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <Head title={faq.faqTitle} sub={faq.faqSub} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {faq.items.map((it, i) => <FaqItem key={i} q={it.q} a={it.a} />)}
            </div>
          </div>
        </section>
      </Reveal>

      {/* DOWNLOAD */}
      <section id="download" style={{ padding: "66px 24px" }}>
        <div style={{ maxWidth: 920, margin: "0 auto", padding: 54, borderRadius: 32, background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_DARK})`, color: "#fff", textAlign: "center", boxShadow: `0 30px 60px ${teinte(30)}` }}>
          <Smartphone size={50} style={{ marginBottom: 18 }} />
          <h2 style={{ fontSize: 38, fontWeight: 900, letterSpacing: -1, margin: 0 }}>{t.dlTitle}</h2>
          <p style={{ fontSize: 18, marginTop: 14, opacity: 0.95 }}>{t.dlSub}</p>
          {/* La version affichee vient du build REEL, plus d'un « v1.0.0 » ecrit
              a la main qui restait juste alors que les fichiers vieillissaient. */}
          {dateStr && (
            <p style={{ fontSize: 13, marginTop: 8, opacity: 0.78 }}>
              {t.build} {meta?.versionCode ?? meta?.tag ?? "—"} · {dateStr}
              {meta?.apkMB && ` · APK ${meta.apkMB} MB`}
              {meta?.aabMB && ` · AAB ${meta.aabMB} MB`}
            </p>
          )}
          <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 26, flexWrap: "wrap" }}>
            <a href={meta?.apk?.url ?? APK_URL} download style={{ padding: "16px 28px", borderRadius: 14, background: "#fff", color: PRIMARY_DARK, fontWeight: 800, fontSize: 16, display: "inline-flex", alignItems: "center", gap: 10 }}>
              <Download size={20} /> {t.dlApk}{meta?.apkMB && <span style={{ opacity: 0.7, fontSize: 13 }}>({meta.apkMB} MB)</span>}
            </a>
            <a href={meta?.aab?.url ?? AAB_URL} download style={{ padding: "16px 28px", borderRadius: 14, background: "rgba(255,255,255,0.15)", color: "#fff", fontWeight: 800, fontSize: 16, display: "inline-flex", alignItems: "center", gap: 10, border: "2px solid rgba(255,255,255,0.35)" }}>
              <Package size={20} /> {t.dlAab}{meta?.aabMB && <span style={{ opacity: 0.7, fontSize: 13 }}>({meta.aabMB} MB)</span>}
            </a>
          </div>

          {/* L'empreinte est PUBLIEE : sans elle, personne ne peut verifier que
              le fichier telecharge est bien celui sorti de la CI. C'est ce qui
              separe un telechargement direct d'un acte de foi. */}
          {meta?.apk?.sha256 && (
            <p style={{ marginTop: 16, fontSize: 11, opacity: 0.72, fontFamily: "ui-monospace, monospace", wordBreak: "break-all", maxWidth: 620, marginInline: "auto" }}>
              SHA-256 · {meta.apk.sha256}
            </p>
          )}
          {meta?.notesUrl && (
            <div style={{ marginTop: 10 }}>
              <a href={meta.notesUrl} target="_blank" rel="noopener" style={{ fontSize: 13, fontWeight: 700, opacity: 0.9, textDecoration: "underline" }}>
                {t.releaseNotes}
              </a>
            </div>
          )}
          <div style={{ marginTop: 20 }}>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: "40px 24px", textAlign: "center", borderTop: "1px solid var(--border)", color: "var(--muted)", fontSize: 14 }}>
        <div style={{ display: "flex", gap: 20, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <a href="/privacy" style={{ color: PRIMARY, fontWeight: 600 }}>{t.footer.privacy}</a>
          <a href="/terms" style={{ color: PRIMARY, fontWeight: 600 }}>{t.footer.terms}</a>
          <a href="/refund" style={{ color: PRIMARY, fontWeight: 600 }}>{t.footer.refund}</a>
          {/* Paddle/Polar exigent un contact joignable depuis la homepage. */}
          <a href="/contact" style={{ color: PRIMARY, fontWeight: 600 }}>{t.footer.contact}</a>
          {/* Google Play exige une URL de demande de suppression de compte « facilement
              trouvable ». La page /delete-account existait deja et figurait au sitemap,
              mais n etait liee depuis AUCUNE page — un relecteur ne l aurait pas trouvee. */}
          <a href="/delete-account" style={{ color: PRIMARY, fontWeight: 600 }}>{t.footer.deleteAccount}</a>
          {/* Code source, releases et signalement de bug ne sont PLUS ici.
              Ils vivent dans la barre du back-office, apres identification :
              ils ne servent qu'a l'equipe, et les afficher publiquement
              revenait a indiquer a tout le monde ou vit le depot. */}
          {/* L'administration doit etre TROUVABLE, pas mise en avant. Un bouton
              criard dans l'en-tete inviterait chaque visiteur a pousser une porte
              qui ne le concerne pas ; l'absence de lien obligerait l'equipe a
              retenir une URL. Un lien sobre en pied de page tranche les deux. */}
          <a href="/login" style={{ color: "var(--muted)", fontWeight: 600 }}>{t.nav.admin}</a>
        </div>
        <p>© 2026 Salorie — <a href="https://salistar.com" style={{ color: PRIMARY, fontWeight: 600 }}>salistar.com</a> — Idriss Kriouile</p>
      </footer>
    </main>
  );
}

const navLink: CSSProperties = { fontSize: 15, fontWeight: 500, color: "var(--muted-2)" };
const btnPrimary: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 10, padding: "16px 28px", borderRadius: 14, background: PRIMARY, color: "#fff", fontWeight: 700, fontSize: 16 };
const btnGhost: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 10, padding: "16px 28px", borderRadius: 14, background: "var(--surface)", color: "var(--text)", fontWeight: 700, fontSize: 16, border: "2px solid var(--border)" };
const card: CSSProperties = { padding: 26, borderRadius: 20, background: "var(--surface)", border: "1px solid var(--border)" };

function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } }, { threshold: 0.12 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={"reveal" + (vis ? " in" : "")}>{children}</div>;
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="faq-item" data-open={open}>
      <button className="faq-q" onClick={() => setOpen((o) => !o)}>
        <span>{q}</span>
        <ChevronDown size={20} className="faq-chev" />
      </button>
      <div className="faq-a"><div className="faq-a-inner">{a}</div></div>
    </div>
  );
}

function Cell({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return <div style={{ padding: "14px 16px", fontWeight: 800, fontSize: 15, color: accent ? PRIMARY : "var(--text)", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", textAlign: "center" }}>{children}</div>;
}

function CmpRow({ feat, us, them, last }: { feat: string; us: boolean | string; them: boolean | string; last?: boolean }) {
  const render = (v: boolean | string): ReactNode => {
    if (v === true) return <Check size={20} color={PRIMARY} />;
    if (v === false) return <X size={18} color="#cbd5e1" />;
    return <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{v}</span>;
  };
  const base: CSSProperties = { padding: "14px 16px", borderBottom: last ? "none" : "1px solid var(--border)", display: "flex", alignItems: "center" };
  return (
    <>
      <div style={{ ...base, fontWeight: 600, fontSize: 14.5, color: "var(--text)" }}>{feat}</div>
      <div style={{ ...base, justifyContent: "center", background: teinte(6) }}>{render(us)}</div>
      <div style={{ ...base, justifyContent: "center" }}>{render(them)}</div>
    </>
  );
}

function Head({ title, sub, left }: { title: string; sub?: string; left?: boolean }) {
  return (
    <div style={{ textAlign: left ? "start" : "center", marginBottom: left ? 16 : 42 }}>
      <h2 style={{ fontSize: 38, fontWeight: 900, letterSpacing: -1, margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 18, color: "var(--muted)", marginTop: 12 }}>{sub}</p>}
    </div>
  );
}

// ⚠ Le fond de la capture etait `#fff` en dur — c'est-a-dire exactement la
// « vignette blanche » que la charte reproche, et la seule couleur de cette
// page a ne suivre aucun theme. Sur Obsidian ou Dore, un rectangle blanc
// s'allumait dans le cadre du telephone le temps du chargement.
function Phone({ src, big = false, fade = false }: { src: string; big?: boolean; fade?: boolean }) {
  const h = big ? 600 : 540;
  return (
    <div className={fade ? "demo-fade" : undefined} style={{ height: h, width: big ? 296 : 266, padding: 10, borderRadius: 42, background: "linear-gradient(135deg, #1f2937, #0f172a)", boxShadow: "0 26px 60px rgba(15,23,42,0.35)", flex: "0 0 auto", position: "relative" }}>
      <div style={{ position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)", width: 90, height: 18, borderRadius: 999, background: "#0f172a", zIndex: 2 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Salorie" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 32, display: "block", background: "var(--t-surface)" }} />
    </div>
  );
}
