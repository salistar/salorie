# -*- coding: utf-8 -*-
"""
Rapport d'améliorations et nouvelles features pour Salorie
Basé sur le document SallyHealth - Idriss Kriouile / SALISTAR
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, ListFlowable, ListItem
)

PRIMARY = colors.HexColor('#298f50')
PRIMARY_DARK = colors.HexColor('#0f3a22')
PRIMARY_LIGHT = colors.HexColor('#e8f5ee')
GRAY = colors.HexColor('#6b7280')
GRAY_LIGHT = colors.HexColor('#f3f4f6')
AMBER = colors.HexColor('#f59e0b')
BLUE = colors.HexColor('#3b82f6')
RED = colors.HexColor('#ef4444')

OUTPUT = r"C:\Users\21266\Desktop\sdk52\salorie\salorie\rapports\SALORIE_RAPPORT_AMELIORATIONS.pdf"

styles = getSampleStyleSheet()

def mk(name, **kw):
    base = kw.pop('parent', styles['Normal'])
    return ParagraphStyle(name, parent=base, **kw)

S_TITLE = mk('T', fontSize=26, textColor=PRIMARY_DARK, alignment=TA_CENTER,
             spaceAfter=12, fontName='Helvetica-Bold', leading=30)
S_SUB = mk('Sb', fontSize=13, textColor=GRAY, alignment=TA_CENTER, spaceAfter=20)
S_H1 = mk('H1', fontSize=18, textColor=colors.white, fontName='Helvetica-Bold',
          backColor=PRIMARY, borderPadding=8, spaceBefore=18, spaceAfter=10, leading=22)
S_H2 = mk('H2', fontSize=14, textColor=PRIMARY_DARK, fontName='Helvetica-Bold',
          spaceBefore=12, spaceAfter=6, leading=18)
S_H3 = mk('H3', fontSize=11.5, textColor=PRIMARY, fontName='Helvetica-Bold',
          spaceBefore=8, spaceAfter=4)
S_BODY = mk('B', fontSize=10, textColor=colors.HexColor('#1f2937'),
            alignment=TA_JUSTIFY, leading=14, spaceAfter=6)
S_BULLET = mk('Bu', fontSize=10, textColor=colors.HexColor('#1f2937'),
              leading=13, leftIndent=14, bulletIndent=2, spaceAfter=3)
S_NOTE = mk('N', fontSize=9, textColor=GRAY, alignment=TA_CENTER, spaceAfter=4)

def page_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(GRAY)
    canvas.drawString(2*cm, 1*cm, "Salorie - Rapport d'ameliorations et nouvelles features")
    canvas.drawRightString(A4[0] - 2*cm, 1*cm, f"Page {doc.page}")
    canvas.setStrokeColor(PRIMARY_LIGHT)
    canvas.line(2*cm, 1.3*cm, A4[0] - 2*cm, 1.3*cm)
    canvas.restoreState()

def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(x, S_BULLET), leftIndent=10, value='circle') for x in items],
        bulletType='bullet', leftIndent=10
    )

def section_table(title, rows, col_widths=None):
    data = [[Paragraph(f"<b>{c}</b>", mk('th', fontSize=10, textColor=colors.white, fontName='Helvetica-Bold'))
             for c in rows[0]]]
    for r in rows[1:]:
        data.append([Paragraph(str(c), mk('td', fontSize=9, leading=12)) for c in r])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, GRAY_LIGHT]),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#d1d5db')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return t

# ------------------- Construction du document -------------------
doc = SimpleDocTemplate(OUTPUT, pagesize=A4,
                        leftMargin=2*cm, rightMargin=2*cm,
                        topMargin=2*cm, bottomMargin=2*cm)
story = []

# COVER
story.append(Spacer(1, 4*cm))
story.append(Paragraph("SALORIE", S_TITLE))
story.append(Paragraph("Rapport d'ameliorations, optimisations et nouvelles features", S_SUB))
story.append(Spacer(1, 1*cm))
story.append(Paragraph(
    "Document d'analyse et de recommandations pour faire evoluer l'application mobile "
    "Salorie a partir de l'etat actuel (Expo SDK 52, Clerk, Firebase, Gemini, FatSecret, "
    "RevenueCat) vers une version enrichie, optimisee et differenciante sur le marche "
    "marocain et MENA.", S_BODY))
story.append(Spacer(1, 2*cm))

info = Table([
    ['Projet', 'Salorie Mobile App'],
    ['Version actuelle', '1.0.0 (Production-ready)'],
    ['Auteur', 'Claude AI Assistant'],
    ['Base de reference', 'SallyHealth Prompts v1.0 - Idriss Kriouile'],
    ['Date du rapport', 'Avril 2026'],
], colWidths=[5*cm, 10*cm])
info.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (0, -1), PRIMARY_LIGHT),
    ('TEXTCOLOR', (0, 0), (0, -1), PRIMARY_DARK),
    ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
    ('GRID', (0, 0), (-1, -1), 0.5, PRIMARY),
    ('LEFTPADDING', (0, 0), (-1, -1), 10),
    ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
]))
story.append(info)
story.append(PageBreak())

# ========== PARTIE 1 : OPTIMISATIONS TECHNIQUES ==========
story.append(Paragraph("PARTIE 1 - Optimisations techniques", S_H1))
story.append(Paragraph(
    "Cette section liste les optimisations a apporter au code existant pour ameliorer "
    "les performances, la stabilite, la securite et l'experience utilisateur.",
    S_BODY))

story.append(Paragraph("1.1 Performance et rendu", S_H2))
story.append(bullets([
    "<b>Memoisation systematique</b> : wrapper les composants Home, Analytics, Profile avec React.memo et utiliser useMemo/useCallback pour eviter les re-renders inutiles sur chaque onSnapshot Firestore.",
    "<b>FlatList virtualisee</b> pour la liste RecentActivity avec getItemLayout, removeClippedSubviews et initialNumToRender=8.",
    "<b>Lazy loading</b> des ecrans peu utilises (paywall, terms, privacy) via React.lazy + Suspense.",
    "<b>Images optimisees</b> : remplacer les .jpg Unsplash par des versions compressees WebP 80% qualite (gain ~60% de poids APK).",
    "<b>expo-image</b> a la place de Image RN : cache memoire + disk, transitions fluides.",
    "<b>Skeleton loaders</b> sur toutes les cards au lieu du spinner global : perception de vitesse x2.",
    "<b>Animations Reanimated 3</b> avec useAnimatedStyle pour les transitions de la tab bar flotante (remplacer les Animated.timing actuels).",
]))

story.append(Paragraph("1.2 Offline first", S_H2))
story.append(bullets([
    "<b>Firestore persistence</b> : activer enablePersistence() pour cache automatique des reads.",
    "<b>SQLite offline DB</b> (expo-sqlite) avec 1000 codes-barres marocains pre-seedes au premier lancement.",
    "<b>Queue de sync</b> : quand le user logge offline, stocker dans AsyncStorage, flush au retour de connexion.",
    "<b>Indicateur reseau</b> (@react-native-community/netinfo) : banner 'Hors-ligne - sync en attente'.",
    "<b>Optimistic UI</b> : afficher immediatement le log meme avant confirmation Firestore.",
]))

story.append(Paragraph("1.3 Securite et robustesse", S_H2))
story.append(bullets([
    "<b>Firestore Security Rules</b> strictes : interdire la lecture/ecriture cross-user, valider les types de donnees cote serveur.",
    "<b>Rate limiting</b> Gemini : implementer un debounce + retry avec exponential backoff pour eviter les 429.",
    "<b>Validation Zod</b> des reponses IA : parser tous les JSON Gemini avec un schema strict avant write Firestore.",
    "<b>Secrets expo-constants</b> : deplacer toutes les cles API du .env vers app.config.ts extra pour eviter le bundle.",
    "<b>Sentry</b> pour le crash reporting en production (remplacer les console.error).",
    "<b>App Check</b> Firebase pour bloquer les abus API cote backend.",
]))

story.append(Paragraph("1.4 Architecture code", S_H2))
story.append(bullets([
    "<b>Zustand</b> au lieu du Context API pour le state global (selectedDate, onboarding, subscription) : perf + DX.",
    "<b>React Query / Tanstack Query</b> pour les fetch Firestore au lieu de useEffect + onSnapshot manuels.",
    "<b>Separation lib/services</b> : creer services/nutrition.ts, services/exercise.ts, services/ai.ts pour isoler la logique metier.",
    "<b>Barrel exports</b> (index.ts) dans chaque dossier components/, lib/, hooks/ pour des imports plus courts.",
    "<b>TypeScript strict mode</b> + pas de any : active noUncheckedIndexedAccess.",
    "<b>Eslint + Prettier + Husky</b> + lint-staged pour enforcer les conventions.",
]))

story.append(PageBreak())

story.append(Paragraph("1.5 UX / UI polish", S_H2))
story.append(bullets([
    "<b>Haptic feedback</b> (expo-haptics) sur tous les boutons primaires (log food, add water, Continue onboarding).",
    "<b>Transitions Shared Element</b> (react-native-shared-element) entre la liste de foods et le detail log.",
    "<b>Bottom sheets</b> (gorhom/bottom-sheet) pour edit calories, log water, choisir methode scan - plus naturel que Modal.",
    "<b>Pull-to-refresh</b> sur Home et Analytics avec RefreshControl.",
    "<b>Empty states illustres</b> : SVG animes a la place des texts gris 'No activity yet'.",
    "<b>Confetti</b> (react-native-confetti-cannon) a l'atteinte d'un goal quotidien.",
    "<b>Toast library</b> (sonner-native ou react-native-toast-message) pour les feedbacks de log.",
    "<b>Dark mode complet</b> : actuellement seul le background change, aussi refaire les cards, inputs, chart colors.",
]))

story.append(Paragraph("1.6 Build et deployment", S_H2))
story.append(bullets([
    "<b>EAS Update</b> configure pour OTA updates (correctifs JS sans re-submit store).",
    "<b>ProGuard</b> active pour Android production : reduit la taille de l'APK de 30%.",
    "<b>Hermes engine</b> active par defaut : startup time ameliore.",
    "<b>Splash screen natif</b> expo-splash-screen au lieu de l'ecran index.tsx actuel.",
    "<b>App icon adaptive</b> Android avec foreground + background separes.",
    "<b>i18n extraction automatique</b> avec i18n-ally VSCode : detecter les strings hardcodees restantes.",
    "<b>CI/CD GitHub Actions</b> : lint + typecheck + EAS preview build sur chaque PR.",
]))

story.append(Paragraph("1.7 Observabilite et analytics", S_H2))
story.append(bullets([
    "<b>PostHog</b> ou Mixpanel : tracker les events cles (signup, onboarding_completed, food_logged, paywall_shown, subscription_started).",
    "<b>Firebase Analytics</b> : entonnoirs d'acquisition et retention.",
    "<b>Crashlytics</b> : alertes temps reel sur les crash natifs.",
    "<b>Performance Monitoring</b> Firebase : mesurer le temps de chargement Home, API latency Gemini/FatSecret.",
    "<b>Dashboard admin</b> interne (web) pour voir stats utilisateurs, MRR, churn.",
]))

story.append(PageBreak())

# ========== PARTIE 2 : NOUVELLES FEATURES ==========
story.append(Paragraph("PARTIE 2 - Nouvelles features a ajouter", S_H1))
story.append(Paragraph(
    "Features issues du document SallyHealth, categorisees par priorite et impact business. "
    "Chaque feature est evaluee sur la difficulte technique et la valeur utilisateur.", S_BODY))

story.append(Paragraph("2.1 Features critiques (MVP v2) - Priorite HAUTE", S_H2))
rows = [
    ["Feature", "Description courte", "Impact", "Effort"],
    ["Mode Ramadan intelligent", "Iftar/Suhoor, prayer times Aladhan, Ramadan recipes marocaines", "Eleve", "M"],
    ["Base plats marocains (3000+)", "Tajine, couscous, harira, chebakia avec macro verifies", "Tres eleve", "L"],
    ["Logging vocal en Darija", "Whisper + Gemini parsing darija -> food JSON", "Eleve", "M"],
    ["Filtre Halal", "Exclusion porc/alcool/gelatine dans recherche FatSecret", "Moyen", "S"],
    ["Mode offline complet", "SQLite barcodes + Firestore persistence + sync queue", "Eleve", "M"],
    ["Coach IA multilingue", "Claude API chat en darija/ar/fr/en avec contexte nutrition", "Eleve", "M"],
    ["Reminders heures de priere", "Notifications contextuelles Fajr/Dhuhr/Maghrib/Isha", "Moyen", "S"],
    ["Bot WhatsApp Twilio", "Log via photo/texte WhatsApp, hub d'usage pour users MENA", "Tres eleve", "L"],
]
story.append(section_table("P1", rows, col_widths=[4.3*cm, 7.2*cm, 2.5*cm, 1.5*cm]))
story.append(Spacer(1, 0.3*cm))

story.append(Paragraph("2.2 Features de retention - Priorite MOYENNE", S_H2))
rows = [
    ["Feature", "Description courte", "Impact", "Effort"],
    ["Planification repas hebdo", "Meal planner 7 jours + liste courses auto", "Eleve", "M"],
    ["Createur de recettes", "Build recipe custom avec macro auto-calcul", "Moyen", "M"],
    ["Timer jeune intermittent", "16:8, 18:6, 20:4 avec countdown visuel", "Moyen", "S"],
    ["Suivi mensurations", "Tour taille/hanches/bras + photos progres", "Moyen", "M"],
    ["Micronutriments panel", "12 vitamines/mineraux avec % RDA", "Moyen", "M"],
    ["Export CSV", "Export logs sur periode pour medecin/nutritionniste", "Faible", "S"],
    ["Compteur de pas", "Apple Health / Google Fit integration", "Eleve", "M"],
    ["Net calories mode", "Consomme - brule = restant (style MFP)", "Moyen", "S"],
    ["Logeur gym complet", "500+ exercices, sets x reps x weight, PR detection", "Eleve", "L"],
    ["Gamification sociale", "Amis + challenges + badges + leaderboard", "Eleve", "L"],
    ["Scan etiquette OCR", "Gemini Vision lit nutrition facts sur emballage", "Moyen", "M"],
    ["Suivi supplements", "Whey, creatine, vitamines avec reminders", "Moyen", "S"],
    ["Mood check-in", "Energie/humeur 1-5 + correlation IA", "Moyen", "S"],
    ["Food quality score", "Green/yellow/red par aliment (style Noom)", "Faible", "S"],
    ["Widgets home screen", "iOS + Android widgets calories remaining", "Moyen", "M"],
    ["Sync wearables", "Fitbit/Garmin OAuth + import activities", "Moyen", "L"],
    ["Macro adaptatif", "Ajustement auto hebdomadaire selon poids reel", "Eleve", "M"],
    ["Correlation sommeil", "Apple Health sleep vs adherence nutrition", "Moyen", "M"],
]
story.append(section_table("P2", rows, col_widths=[4.3*cm, 7.2*cm, 2.5*cm, 1.5*cm]))

story.append(PageBreak())

story.append(Paragraph("2.3 Features differenciantes marche marocain - UNIQUE", S_H2))
rows = [
    ["Feature", "Description", "Avantage concurrentiel"],
    ["Base codes-barres Maroc", "Crowdsourcing produits Bimo, Centrale Lait, Marjane...", "Aucun concurrent ne l'a"],
    ["Mode partage plat famille", "Tajine pour 6, chacun log sa portion", "Culture marocaine specifique"],
    ["Calendrier saisonnier MA", "Fruits/legumes marocains par mois + prix MAD", "Contenu educatif unique"],
    ["Marketplace nutritionnistes", "Booking DtN Maroc avec video call, 20% commission", "B2B2C revenue stream"],
    ["Prix en dirhams", "Cout de chaque repas en MAD, budget journalier", "Tres parlant Maroc"],
    ["Mode grossesse/allaitement", "Recettes traditionnelles (sellou, harira, droo)", "Rien sur le marche MENA"],
    ["Prediction glycemie", "GIS 1-10 sans CGM, base de donnees GI", "Unique sans hardware"],
    ["Communaute recettes", "Recettes user-generated verifiees par IA", "Effet reseau fort"],
    ["Rapport mensuel IA", "3 paragraphes personnalises chaque mois", "Retention premium"],
    ["Multi-food photo analysis", "Detection plusieurs aliments sur meme photo", "Precision superieure"],
    ["Ecosysteme SALISTAR", "SSO Clerk avec SallyRecruit, SallyLLM, SallyAccount", "Cross-sell corporate"],
]
story.append(section_table("UNIQUE", rows, col_widths=[4.3*cm, 6.7*cm, 4.5*cm]))
story.append(Spacer(1, 0.3*cm))

story.append(Paragraph("2.4 Features long-terme (v3+) - Priorite BASSE", S_H2))
story.append(bullets([
    "<b>Suivi glycemie avance</b> : blood glucose log avec reference bands, partage avec medecin.",
    "<b>Zones cardiaques</b> : import HR depuis wearables, calcul MET-based plus precis.",
    "<b>Diets specialises</b> : Keto (net carbs), Vegan, Vegetarian, Gluten-free avec recalcul macros.",
    "<b>Prep competition sportive</b> : periodisation glucides avant marathon/bodybuilding.",
    "<b>Scanner restaurant</b> : QR menu + base de donnees chaines marocaines.",
    "<b>Check-in quotidien IA</b> : 5 questions rotation avec micro-tips personnalises.",
    "<b>Notifications intelligentes</b> : contextuelles selon logs et hour du jour.",
    "<b>Wellness corporate</b> : dashboard entreprise anonymise pour RH.",
]))

story.append(PageBreak())

# ========== PARTIE 3 : ROADMAP ==========
story.append(Paragraph("PARTIE 3 - Roadmap proposee", S_H1))

story.append(Paragraph("Phase 1 - Localisation marocaine (Q2 2026)", S_H2))
story.append(bullets([
    "Base de donnees plats marocains (3000+ plats verifies par dieteticienne)",
    "Mode Ramadan avec Aladhan API + recettes traditionnelles",
    "Filtre Halal automatique dans toutes les recherches",
    "Logging vocal en Darija via Whisper + Gemini",
    "Prix en dirhams et calendrier saisonnier",
    "Traductions darija/arabe completes dans i18n",
]))

story.append(Paragraph("Phase 2 - Engagement et retention (Q3 2026)", S_H2))
story.append(bullets([
    "Coach IA multilingue (Claude API) accessible depuis home screen",
    "Bot WhatsApp Twilio pour logging hors app",
    "Planification de repas hebdomadaire + liste de courses generee",
    "Mode offline complet avec SQLite + sync queue",
    "Widgets home screen iOS/Android",
    "Reminders bases sur heures de priere",
]))

story.append(Paragraph("Phase 3 - Social et gamification (Q4 2026)", S_H2))
story.append(bullets([
    "Systeme d'amis + challenges hebdomadaires",
    "Badges et achievements (30+ milestones)",
    "Communaute recettes crowdsourcees avec verification IA",
    "Partage de plats familiaux (shared dish)",
    "Integration Apple Health / Google Fit pour pas et sommeil",
    "Rapport IA mensuel automatique",
]))

story.append(Paragraph("Phase 4 - Marketplace et B2B (Q1 2027)", S_H2))
story.append(bullets([
    "Marketplace de nutritionnistes marocains avec video calls",
    "Dashboard entreprise pour wellness corporate",
    "Integration ecosysteme SALISTAR (SallyRecruit, SallyLLM)",
    "Prep pour competitions sportives",
    "Logger gym complet avec 500+ exercices",
]))

story.append(Paragraph("Phase 5 - IA avancee (Q2+ 2027)", S_H2))
story.append(bullets([
    "Multi-food photo analysis (detection plusieurs plats par image)",
    "Prediction glycemie sans CGM (Glucose Impact Score)",
    "Macro adaptatif automatique selon evolution poids reel",
    "Correlation sommeil/nutrition/humeur avec insights hebdomadaires",
    "Check-in quotidien avec questions personnalisees par IA",
]))

story.append(PageBreak())

# ========== PARTIE 4 : METRIQUES CIBLES ==========
story.append(Paragraph("PARTIE 4 - KPI cibles apres implementation", S_H1))

rows = [
    ["Metrique", "Actuel (estime)", "Cible 6 mois", "Cible 12 mois"],
    ["Retention J7", "~25%", "40%", "55%"],
    ["Retention J30", "~10%", "20%", "30%"],
    ["DAU/MAU ratio", "~15%", "25%", "35%"],
    ["Conversion free -> premium", "~2%", "5%", "8%"],
    ["Churn mensuel premium", "~10%", "6%", "4%"],
    ["Food logs / user / jour", "1.5", "3.0", "4.5"],
    ["Streak moyen", "3 jours", "7 jours", "12 jours"],
    ["App Store rating", "?", "4.5", "4.7"],
    ["NPS", "?", "40", "55"],
    ["Crash rate", "?", "< 1%", "< 0.5%"],
    ["Cold start time", "~3s", "< 2s", "< 1.5s"],
]
story.append(section_table("KPI", rows, col_widths=[5.5*cm, 3.5*cm, 3.5*cm, 3.5*cm]))

story.append(Spacer(1, 0.5*cm))
story.append(Paragraph("Hypotheses pour atteindre ces chiffres", S_H2))
story.append(bullets([
    "<b>Retention J7/J30</b> : gamification, streaks, bot WhatsApp, reminders contextuels, rapport mensuel.",
    "<b>Conversion premium</b> : paywall contextuel au bon moment (apres 3-5 logs), features unique (Ramadan mode payant), free trial 7 jours.",
    "<b>DAU</b> : bot WhatsApp ramene les users sans ouvrir l'app, widgets affichent valeur immediate.",
    "<b>Crash rate</b> : Sentry + Crashlytics + tests E2E Detox + TypeScript strict.",
    "<b>Cold start</b> : Hermes + ProGuard + lazy loading + splash screen natif.",
]))

story.append(PageBreak())

# ========== CONCLUSION ==========
story.append(Paragraph("Conclusion", S_H1))
story.append(Paragraph(
    "Salorie dispose d'une base solide (auth Clerk, Firestore, Gemini, FatSecret, RevenueCat, "
    "i18n EN/FR/AR, themes dark/light) mais peut franchir un palier majeur en combinant 3 axes :",
    S_BODY))
story.append(Spacer(1, 0.2*cm))
story.append(Paragraph(
    "<b>1. Localisation marocaine forte</b> : base de donnees plats marocains, mode Ramadan, "
    "filtre Halal, darija vocal, prix en MAD. Aucun concurrent international ne couvre "
    "serieusement le marche MENA.", S_BODY))
story.append(Paragraph(
    "<b>2. Engagement par l'IA</b> : coach multilingue Claude, bot WhatsApp Twilio, rapports "
    "mensuels personnalises, check-in quotidien. Le differenciateur n'est plus le tracking "
    "mais l'accompagnement conversationnel.", S_BODY))
story.append(Paragraph(
    "<b>3. Ecosysteme et B2B</b> : marketplace nutritionnistes (20% commission), integration "
    "SallyRecruit pour wellness corporate, ouverture d'un canal de revenus recurrent au-dela "
    "du SaaS consommateur.", S_BODY))
story.append(Spacer(1, 0.4*cm))
story.append(Paragraph(
    "La priorite absolue pour les 6 prochains mois : <b>plats marocains + mode Ramadan + "
    "darija vocal + bot WhatsApp</b>. Ces 4 features transforment Salorie d'un clone "
    "MyFitnessPal en l'application nutrition de reference au Maroc.", S_BODY))
story.append(Spacer(1, 0.4*cm))
story.append(Paragraph(
    "Sur le plan technique, la priorite est la robustesse (offline first, Sentry, Firestore "
    "rules, Zod) avant la vitesse de livraison de nouvelles features. Un utilisateur qui "
    "perd ses donnees ne revient jamais.", S_BODY))

story.append(Spacer(1, 1*cm))
story.append(Paragraph("Fin du rapport d'ameliorations.", S_NOTE))

doc.build(story, onFirstPage=page_footer, onLaterPages=page_footer)
print(f"PDF genere: {OUTPUT}")
