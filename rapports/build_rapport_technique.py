# -*- coding: utf-8 -*-
"""
Build the Salorie technical report PDF.

Sections:
  1. Architecture
  2. Explanation of every file
  3. Explanation of every route
  4. Firestore data models
  5. Features
  6. Test scenarios
  7. Security / perf / deploy

Run: python build_rapport_technique.py
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
)
from reportlab.lib.enums import TA_JUSTIFY

OUT = r"C:\Users\21266\Desktop\sdk52\salorie\salorie\rapports\SALORIE_RAPPORT_TECHNIQUE.pdf"

styles = getSampleStyleSheet()
H1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=20, textColor=colors.HexColor('#0F172A'), spaceAfter=10, spaceBefore=16)
H2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=15, textColor=colors.HexColor('#1E3A8A'), spaceAfter=6, spaceBefore=14)
H3 = ParagraphStyle('H3', parent=styles['Heading3'], fontSize=12, textColor=colors.HexColor('#334155'), spaceAfter=4, spaceBefore=10)
BODY = ParagraphStyle('Body', parent=styles['BodyText'], fontSize=10, leading=14, alignment=TA_JUSTIFY, spaceAfter=6)
CODE = ParagraphStyle('Code', parent=styles['Code'], fontSize=8.5, leading=11, textColor=colors.HexColor('#0F172A'), backColor=colors.HexColor('#F1F5F9'), leftIndent=8, rightIndent=8, spaceAfter=6, spaceBefore=4)
BULLET = ParagraphStyle('Bullet', parent=BODY, leftIndent=14, bulletIndent=4, spaceAfter=2)
COVER_TITLE = ParagraphStyle('CT', parent=styles['Title'], fontSize=30, textColor=colors.HexColor('#0EA5E9'), alignment=1, spaceAfter=20)
COVER_SUB = ParagraphStyle('CS', parent=styles['Normal'], fontSize=14, textColor=colors.HexColor('#475569'), alignment=1)

def p(text, style=BODY):
    return Paragraph(text, style)

def bullets(items):
    return [Paragraph(f"&bull; {it}", BULLET) for it in items]

def code(text):
    esc = text.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('\n','<br/>').replace(' ','&nbsp;')
    return Paragraph(f"<font face='Courier'>{esc}</font>", CODE)

def section_table(rows, col_widths=None):
    wrapped = []
    for i, row in enumerate(rows):
        if i == 0:
            wrapped.append([Paragraph(f"<b>{c}</b>", ParagraphStyle('th', parent=BODY, textColor=colors.white, fontSize=9)) for c in row])
        else:
            wrapped.append([Paragraph(c, ParagraphStyle('td', parent=BODY, fontSize=9, leading=12, spaceAfter=0)) for c in row])
    t = Table(wrapped, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), colors.HexColor('#0EA5E9')),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('GRID',(0,0),(-1,-1), 0.3, colors.HexColor('#CBD5E1')),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#F8FAFC'), colors.white]),
        ('LEFTPADDING',(0,0),(-1,-1),5),
        ('RIGHTPADDING',(0,0),(-1,-1),5),
        ('TOPPADDING',(0,0),(-1,-1),4),
        ('BOTTOMPADDING',(0,0),(-1,-1),4),
    ]))
    return t

story = []

# COVER
story += [
    Spacer(1, 6*cm),
    Paragraph("SALORIE", COVER_TITLE),
    Paragraph("Rapport Technique Complet", ParagraphStyle('CS2', parent=COVER_SUB, fontSize=20, textColor=colors.HexColor('#0F172A'))),
    Spacer(1, 1*cm),
    Paragraph("Application mobile de suivi calorique avec IA", COVER_SUB),
    Paragraph("Expo SDK 52 &bull; React Native 0.76 &bull; Firebase &bull; Clerk &bull; Gemini 2.5", COVER_SUB),
    Spacer(1, 4*cm),
    Paragraph("Date : 22 avril 2026", COVER_SUB),
    Paragraph("Auteur : Equipe Salorie", COVER_SUB),
    PageBreak(),
]

# TOC
story += [p("Table des matieres", H1)]
story += bullets([
    "1. Architecture generale",
    "2. Stack technique et dependances",
    "3. Structure des fichiers - explication detaillee",
    "4. Routes et navigation (expo-router)",
    "5. Modeles Firestore (collections et documents)",
    "6. Fonctionnalites (features)",
    "7. Scenarios de test (unitaires, integration, E2E, edge cases)",
    "8. Securite, performance et deploiement",
])
story += [PageBreak()]

# 1. ARCHITECTURE
story += [p("1. Architecture generale", H1)]
story += [p(
    "Salorie est une application mobile multiplateforme (iOS + Android) construite avec "
    "Expo SDK 52 et React Native 0.76.9 en mode <i>new architecture / bridgeless</i>. "
    "L'architecture suit le pattern d'une application mobile moderne a trois couches : "
    "presentation (ecrans et composants React Native), couche domaine (contextes React "
    "et services dans <b>lib/</b>) et couche donnees (Firebase Firestore pour la "
    "persistance, AsyncStorage pour le cache local, SecureStore pour les tokens, et APIs "
    "externes : Gemini 2.5 Flash, FatSecret OAuth2, Clerk Auth, RevenueCat).", BODY)]

story += [p("Diagramme en couches", H2)]
story += [code(
    "+------------------------------------------------------------+\n"
    "|  UI LAYER  (app/*.tsx, components/*.tsx)                   |\n"
    "|  Expo Router file-based routes + shared components         |\n"
    "+------------------------------------------------------------+\n"
    "|  DOMAIN LAYER  (lib/*.tsx)                                 |\n"
    "|  LoggingContext - ThemeContext - i18n - AiModel - etc.     |\n"
    "+------------------------------------------------------------+\n"
    "|  DATA LAYER                                                |\n"
    "|  Firebase Firestore  |  AsyncStorage  |  SecureStore       |\n"
    "+------------------------------------------------------------+\n"
    "|  EXTERNAL APIs                                             |\n"
    "|  Clerk | Gemini 2.5 | FatSecret | RevenueCat | Unsplash    |\n"
    "+------------------------------------------------------------+"
)]

story += [p("Flux de donnees principal", H2)]
story += bullets([
    "<b>Auth</b> : Clerk gere les sessions (email/password, Google OAuth). Le token est stocke via expo-secure-store.",
    "<b>Onboarding</b> : les reponses sont ecrites dans Firestore via lib/firebase.ts &rarr; saveUserToFirestore().",
    "<b>Logging alimentaire</b> : scan photo (expo-camera CameraView inline) &rarr; Gemini Vision 2.5 Flash &rarr; JSON macros &rarr; Firestore <b>nutritionLogs</b> &rarr; triggerRefresh() &rarr; UI rafraichie.",
    "<b>Logging exercice</b> : formule MET + raffinement Gemini &rarr; Firestore nutritionLogs type='activity' &rarr; jauge calories mise a jour.",
    "<b>Cache</b> : LoggingContext garde les logs du jour en memoire, AsyncStorage persiste entre sessions (LocalDataStore).",
    "<b>i18n</b> : useTranslation() hook ; 3 langues (EN/FR/AR) avec support RTL pour l'arabe.",
    "<b>Theme</b> : ThemeContext resout 'system' / 'light' / 'dark' et expose la palette.",
])
story += [PageBreak()]

# 2. STACK
story += [p("2. Stack technique et dependances", H1)]
stack_rows = [
    ["Domaine", "Librairie", "Version", "Role"],
    ["Framework", "Expo SDK", "52.0.49", "Build tooling + OTA"],
    ["Runtime", "React Native", "0.76.9", "Bridgeless (new architecture)"],
    ["UI", "React", "18.3.1", "Composants fonctionnels + hooks"],
    ["Routing", "expo-router", "4.0", "File-based navigation"],
    ["Auth", "@clerk/clerk-expo", "2.19", "Session + OAuth + JWT"],
    ["DB", "firebase", "12.12", "Firestore"],
    ["Cache local", "AsyncStorage", "1.23", "Persistance hors-ligne"],
    ["Secrets", "expo-secure-store", "14.0", "Stockage securise tokens"],
    ["IA Vision", "@google/generative-ai", "0.24", "Gemini 2.5 Flash multimodal"],
    ["Camera", "expo-camera", "16.0", "CameraView inline (pas d'Intent)"],
    ["Animations", "react-native-reanimated", "3.16", "Transitions UI fluides"],
    ["Icones", "lucide-react-native", "1.8", "Icones vectorielles"],
    ["Graphiques", "react-native-chart-kit", "6.12", "Analytics"],
    ["Listes perf.", "@shopify/flash-list", "1.7", "Scroll virtualise"],
    ["IAP", "react-native-purchases", "10.0", "RevenueCat premium"],
    ["Notifications", "expo-notifications", "0.29", "Rappels repas/eau"],
]
story += [section_table(stack_rows, col_widths=[2.8*cm, 4.2*cm, 2*cm, 7.5*cm])]
story += [PageBreak()]

# 3. FILES
story += [p("3. Structure des fichiers - explication detaillee", H1)]
story += [p("3.1 Dossier <b>app/</b> (routes expo-router)", H2)]

app_files = [
    ("_layout.tsx", "Layout racine. Fournit ClerkProvider, ThemeProvider, i18nProvider, LoggingProvider. Monte le Stack de navigation, gere le splash screen (expo-splash-screen) et les polices custom."),
    ("index.tsx", "Point d'entree. Redirige vers (auth)/sign-in si non connecte, sinon vers (onboarding) si profil incomplet, sinon vers (tabs)."),
    ("welcome.tsx", "Ecran d'accueil marketing avant sign-in. Presente les features premium."),
    ("(auth)/_layout.tsx", "Stack nav pour sign-in et sign-up."),
    ("(auth)/sign-in.tsx", "Connexion Clerk email + Google OAuth. Stocke le token en SecureStore."),
    ("(auth)/sign-up.tsx", "Inscription Clerk avec verification email (OTP)."),
    ("oauth-callback.tsx", "Gere le retour d'un flux OAuth externe (Google)."),
    ("(onboarding)/_layout.tsx", "Stack nav pour l'onboarding en plusieurs etapes."),
    ("(onboarding)/index.tsx", "Questionnaire multi-etapes (genre, age, taille, poids, objectif, niveau d'activite). Utilise react-native-ruler-picker."),
    ("(onboarding)/results.tsx", "Affiche l'objectif calorique calcule (Mifflin-St Jeor x facteur activite) et enregistre dans Firestore."),
    ("(tabs)/_layout.tsx", "Bottom tabs (Home / Analytics / Profile) + FAB central pour ActionMenu."),
    ("(tabs)/index.tsx", "Home : WeekCalendar, RemainingCaloriesCard, WaterIntakeCard, ActivityList."),
    ("(tabs)/analytics.tsx", "Graphiques line/bar : evolution hebdo/mensuelle des calories, macros, eau, exercice."),
    ("(tabs)/profile.tsx", "Profil, acces preferences/terms/privacy/notifications/feature-requests, langue, theme, sign-out."),
    ("scan-camera.tsx", "CameraView expo-camera INLINE (evite l'Intent Android qui tue l'activity RN en Expo Go). Capture photo -&gt; FileSystem URI -&gt; push scan-analysis."),
    ("scan-analysis.tsx", "Affiche la photo, lance Gemini Vision 2.5 Flash avec prompt multilingue retournant {name, quantity, unit, description, calories, protein, carbs, fat}. Barre d'animation pendant analyse. Header theme + i18n. Gestion URI '%25' pour Expo Go."),
    ("log-food-details.tsx", "Resume editable avant sauvegarde : nom, quantite, unite, macros, image. Bouton Log -&gt; addNutritionLog(type='meal') -&gt; triggerRefresh() -&gt; retour home."),
    ("log-exercise.tsx", "Hub d'exercice a 3 options : Run, Lifting, Manual. Header + theme + i18n + RTL."),
    ("workout-details.tsx", "Ecran commun pour cardio et lifting. Selection du sous-type (running/walking/cycling/swimming/hiking/rowing ou bench_press/squat/deadlift/shoulder_press/pullup/bicep_curl) via chips images Unsplash. Intensite low/med/high. Duree chips + custom. Calcul MET (MET*3.5*poids/200*duree) puis raffinement Gemini text -&gt; moyenne."),
    ("workout-result.tsx", "'Your workout burned X kcal'. Image hero, intensite badge, Firebase save (type='activity'), triggerRefresh()."),
    ("log-manual.tsx", "Saisie manuelle calories + macros. Photo optionnelle. Update cache (LoggingContext) + DB Firestore simultanes."),
    ("add-water.tsx", "Compteur eau ml (+-125 ml par verre). Visualisation empty/half/full glass. Firestore type='water'."),
    ("food-database.tsx", "Recherche FatSecret OAuth2. Query -&gt; searchFood() -&gt; liste resultats -&gt; selection -&gt; log-food-details."),
    ("update-weight.tsx", "Maj poids avec ruler-picker. Met a jour Firestore users doc."),
    ("personal-details.tsx", "Edition du profil (nom, age, etc.)."),
    ("preferences.tsx", "Langue, theme, unites, objectifs caloriques, notifications."),
    ("notifications.tsx", "Historique notifications + reglages (expo-notifications)."),
    ("feature-requests.tsx", "Formulaire de demande de features (Firestore collection featureRequests)."),
    ("terms.tsx", "Conditions d'utilisation (texte statique multilingue)."),
    ("privacy.tsx", "Politique de confidentialite."),
    ("+not-found.tsx", "Fallback 404."),
]
rows = [["Fichier", "Description"]] + [[f, d] for f,d in app_files]
story += [section_table(rows, col_widths=[4.5*cm, 12*cm])]
story += [PageBreak()]

story += [p("3.2 Dossier <b>components/</b>", H2)]
comps = [
    ("ScreenTopBar.tsx", "Barre superieure partagee : logo AppBrand + pill langue + toggle theme + cloche notifications (optionnelle)."),
    ("AppBrand.tsx", "Logo + nom de l'app."),
    ("HomeHeader.tsx", "Header specifique a Home (salutation + avatar + date)."),
    ("WeekCalendar.tsx", "Selecteur de jour (lun-dim) avec scroll, couple au selectedDate de LoggingContext."),
    ("RemainingCaloriesCard.tsx", "Jauge calories restantes (HalfProgress). Icone crayon ouvre modal DailyTargets (useTheme + useTranslation)."),
    ("HalfProgress.tsx", "Arc SVG semi-circulaire (react-native-svg) affichant % consomme/restant."),
    ("CaloriesCard.tsx", "Carte macros (proteines/glucides/lipides) avec barres de progression."),
    ("WaterIntakeCard.tsx", "Carte eau bue vs objectif + bouton quick-add."),
    ("ActivityList.tsx", "Liste des logs du jour (meals, activities, water) triee par timestamp."),
    ("ActionMenu.tsx", "Modal bottom-sheet FAB : 4 cartes (exercise, water, food-database, scan-food). i18n via t('menu.*')."),
    ("LogModal.tsx", "Modal legacy de saisie rapide log."),
    ("ScreenBackground.tsx", "Wrapper avec fond theme + gradient optionnel."),
]
rows = [["Composant", "Description"]] + [[f,d] for f,d in comps]
story += [section_table(rows, col_widths=[4.5*cm, 12*cm])]

story += [p("3.3 Dossier <b>lib/</b>", H2)]
libs = [
    ("firebase.ts", "Initialise Firebase. Helpers : saveUserToFirestore(), getUserFromFirestore(), updateUserField(), addNutritionLog(), getNutritionLogs(date), deleteNutritionLog(), updateWaterTarget()."),
    ("LoggingContext.tsx", "Contexte global : selectedDate, logs[], triggerRefresh(), showLogModal, isActionMenuVisible, scanImageBase64. Fetch auto Firestore a chaque changement de selectedDate."),
    ("ThemeContext.tsx", "Mode light/dark/system. Resout 'system' via Appearance. Persiste dans AsyncStorage. Expose {mode, resolved, colors, setMode}."),
    ("i18n.tsx", "3 langues EN/FR/AR. Dictionnaire statique + useTranslation() -&gt; {language, t, setLanguage, isRTL}. Persiste dans AsyncStorage."),
    ("AiModel.ts", "Wrapper GoogleGenerativeAI. Fonctions : analyzeFoodImage(base64), refineCaloriesEstimate(prompt)."),
    ("fatsecret.ts", "OAuth2 FatSecret. getAccessToken() avec cache TTL, searchFood(query) -&gt; foods.search. Retry 401 avec refresh."),
    ("translator.ts", "Helper pour traduire les noms d'aliments renvoyes par FatSecret."),
    ("InsightsService.ts", "Analytics : moyennes 7j/30j, tendances, ecarts vs objectif."),
    ("NotificationService.ts", "Expo-notifications : registerForPushNotifications, scheduleDailyReminder (repas/eau)."),
    ("PurchasesService.ts", "RevenueCat : configure, getOfferings, purchasePackage, checkPremium."),
    ("LocalDataStore.ts", "Cache AsyncStorage structure par date + utilitaires colorLog(COLOR,label,obj) et explain(text) pour debug."),
]
rows = [["Fichier", "Description"]] + [[f,d] for f,d in libs]
story += [section_table(rows, col_widths=[4.5*cm, 12*cm])]

story += [p("3.4 Autres dossiers", H2)]
story += bullets([
    "<b>constants/Colors.ts</b> : palette globale (primary #22C55E, primaryLight, gray[50..900], white).",
    "<b>hooks/</b> : hooks partages (ex: useColorScheme wrapper).",
    "<b>assets/images/</b> : logos, splash, empty_glass, half_glass, full_glass, icones.",
    "<b>android/</b> : projet natif Android (gradle, AndroidManifest) pour dev-build.",
    "<b>app.json</b> : configuration Expo (permissions CAMERA/NOTIFICATIONS, plugins, extra: firebase/clerk/gemini/fatsecret).",
    "<b>eas.json</b> : profils de build EAS (development/preview/production).",
    "<b>tsconfig.json</b> : strict TS + path aliases.",
])
story += [PageBreak()]

# 4. ROUTES
story += [p("4. Routes et navigation", H1)]
story += [p(
    "Expo-router utilise une convention file-based : chaque fichier .tsx dans <b>app/</b> "
    "devient une route ; les dossiers <b>(nom)</b> sont des groupes (pas de segment d'URL) ; "
    "<b>_layout.tsx</b> wrap les enfants.", BODY)]

routes = [
    ["Route", "Fichier", "Guard", "Description"],
    ["/", "app/index.tsx", "Public", "Redirection conditionnelle."],
    ["/welcome", "app/welcome.tsx", "Public", "Landing marketing."],
    ["/(auth)/sign-in", "(auth)/sign-in.tsx", "Public", "Clerk sign-in."],
    ["/(auth)/sign-up", "(auth)/sign-up.tsx", "Public", "Clerk sign-up + OTP."],
    ["/oauth-callback", "oauth-callback.tsx", "Public", "Retour OAuth Google."],
    ["/(onboarding)", "(onboarding)/index.tsx", "Auth", "Questionnaire."],
    ["/(onboarding)/results", "(onboarding)/results.tsx", "Auth", "Calcul objectif + save."],
    ["/(tabs)", "(tabs)/index.tsx", "Auth+Onboarded", "Home."],
    ["/(tabs)/analytics", "(tabs)/analytics.tsx", "Auth", "Graphiques."],
    ["/(tabs)/profile", "(tabs)/profile.tsx", "Auth", "Profil."],
    ["/scan-camera", "scan-camera.tsx", "Auth", "Camera inline."],
    ["/scan-analysis", "scan-analysis.tsx", "Auth", "Gemini Vision."],
    ["/log-food-details", "log-food-details.tsx", "Auth", "Validation log repas."],
    ["/log-exercise", "log-exercise.tsx", "Auth", "Hub exercice."],
    ["/workout-details", "workout-details.tsx", "Auth", "Selection type+intensite+duree."],
    ["/workout-result", "workout-result.tsx", "Auth", "Resume calories brulees."],
    ["/log-manual", "log-manual.tsx", "Auth", "Saisie manuelle."],
    ["/add-water", "add-water.tsx", "Auth", "Ajout eau."],
    ["/food-database", "food-database.tsx", "Auth", "FatSecret search."],
    ["/update-weight", "update-weight.tsx", "Auth", "Maj poids."],
    ["/personal-details", "personal-details.tsx", "Auth", "Edition profil."],
    ["/preferences", "preferences.tsx", "Auth", "Preferences."],
    ["/notifications", "notifications.tsx", "Auth", "Notifications."],
    ["/feature-requests", "feature-requests.tsx", "Auth", "Demandes features."],
    ["/terms", "terms.tsx", "Public", "CGU."],
    ["/privacy", "privacy.tsx", "Public", "Privacy."],
    ["/+not-found", "+not-found.tsx", "Public", "404."],
]
story += [section_table(routes, col_widths=[3.7*cm, 4.2*cm, 2.3*cm, 6.3*cm])]

story += [p("Params typiques", H2)]
story += bullets([
    "<b>/scan-analysis</b> : {imageUri: string}",
    "<b>/log-food-details</b> : {name, quantity, unit, description, calories, protein, carbs, fat, imageUri}",
    "<b>/workout-details</b> : {type: 'run' | 'lifting'}",
    "<b>/workout-result</b> : {calories, name, duration, type, activityId, image, intensity}",
])
story += [PageBreak()]

# 5. FIRESTORE
story += [p("5. Modeles de base de donnees Firestore", H1)]
story += [p("Chaque collection est detaillee ci-dessous avec la structure de document, les index requis et les regles de securite.", BODY)]

story += [p("5.1 Collection <b>users</b>", H2)]
story += [p("Document ID : email de l'utilisateur (identifiant Clerk primaire).", BODY)]
story += [code(
    "{\n"
    '  id: string,                 // clerkUserId\n'
    '  email: string,\n'
    '  firstName: string,\n'
    '  lastName: string,\n'
    '  gender: "male" | "female",\n'
    '  age: number,\n'
    '  heightCm: number,\n'
    '  weightKg: number,\n'
    '  goal: "lose" | "maintain" | "gain",\n'
    '  activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active",\n'
    '  calorieGoal: number,        // kcal/jour, Mifflin-St Jeor x facteur\n'
    '  proteinGoalG: number,\n'
    '  carbsGoalG: number,\n'
    '  fatGoalG: number,\n'
    '  waterGoalMl: number,        // defaut 2500\n'
    '  language: "en" | "fr" | "ar",\n'
    '  themeMode: "light" | "dark" | "system",\n'
    '  premium: boolean,\n'
    '  createdAt: Timestamp,\n'
    '  updatedAt: Timestamp\n'
    "}"
)]

story += [p("5.2 Collection <b>nutritionLogs</b>", H2)]
story += [p("Document ID : auto-genere. Une entree par repas, activite ou verre d'eau.", BODY)]
story += [code(
    "{\n"
    '  id: string,                 // auto\n'
    '  userId: string,             // email\n'
    '  type: "meal" | "activity" | "water",\n'
    '  name: string,               // ex "Pizza Margherita", "Running", "Water Intake"\n'
    '  date: string,               // YYYY-MM-DD (local timezone)\n'
    '  timestamp: Timestamp,\n'
    '\n'
    '  // MEAL uniquement\n'
    '  quantity?: number,\n'
    '  unit?: "g" | "ml",\n'
    '  description?: string,\n'
    '  imageUrl?: string,\n'
    '  calories: number,           // kcal (ml pour water)\n'
    '  protein: number,\n'
    '  carbs: number,\n'
    '  fat: number,\n'
    '\n'
    '  // ACTIVITY uniquement\n'
    '  activityId?: string,        // "running" | "bench_press" | ...\n'
    '  intensity?: "low" | "medium" | "high",\n'
    '  durationMin?: number,\n'
    '  met?: number\n'
    "}"
)]

story += [p("Index composites requis", H3)]
story += bullets([
    "<b>(userId ASC, date ASC, timestamp DESC)</b> - liste logs du jour.",
    "<b>(userId ASC, type ASC, timestamp DESC)</b> - filtrage analytics par type.",
])

story += [p("5.3 Collection <b>featureRequests</b>", H2)]
story += [code(
    "{\n"
    '  id: string,\n'
    '  userId: string,\n'
    '  title: string,\n'
    '  description: string,\n'
    '  category: "ui" | "ai" | "integration" | "other",\n'
    '  status: "open" | "planned" | "done" | "rejected",\n'
    '  votes: number,\n'
    '  createdAt: Timestamp\n'
    "}"
)]

story += [p("5.4 Sub-collection <b>users/{email}/notifications</b>", H2)]
story += [code(
    "{\n"
    '  id: string,\n'
    '  title: string,\n'
    '  body: string,\n'
    '  type: "meal_reminder" | "water_reminder" | "streak" | "system",\n'
    '  read: boolean,\n'
    '  createdAt: Timestamp\n'
    "}"
)]

story += [p("5.5 Regles de securite Firestore", H2)]
story += [code(
    "rules_version = '2';\n"
    "service cloud.firestore {\n"
    "  match /databases/{db}/documents {\n"
    "    match /users/{email} {\n"
    "      allow read, write: if request.auth != null\n"
    "        &amp;&amp; request.auth.token.email == email;\n"
    "      match /notifications/{nid} {\n"
    "        allow read, write: if request.auth.token.email == email;\n"
    "      }\n"
    "    }\n"
    "    match /nutritionLogs/{id} {\n"
    "      allow read, write: if request.auth != null\n"
    "        &amp;&amp; request.auth.token.email == resource.data.userId;\n"
    "      allow create: if request.auth.token.email\n"
    "        == request.resource.data.userId;\n"
    "    }\n"
    "    match /featureRequests/{id} {\n"
    "      allow read, create: if request.auth != null;\n"
    "    }\n"
    "  }\n"
    "}"
)]
story += [PageBreak()]

# 6. FEATURES
story += [p("6. Fonctionnalites", H1)]
features = [
    ("Authentification",
     "Clerk (email+password, Google OAuth, verification OTP). Session persistee via expo-secure-store. Deconnexion depuis l'ecran profil."),
    ("Onboarding personnalise",
     "Questionnaire multi-ecrans (genre, age, taille, poids, objectif, niveau d'activite). Calcul automatique du BMR (Mifflin-St Jeor) x facteur activite = calorieGoal. Macros : 30% proteines, 40% glucides, 30% lipides par defaut."),
    ("Home dashboard",
     "WeekCalendar pour naviguer jour par jour. Jauge calories restantes (HalfProgress SVG). Carte macros. Carte eau. Liste d'activite chronologique du jour."),
    ("Scan alimentaire IA",
     "Photo via expo-camera CameraView INLINE (evite l'Intent Android qui tue l'activity RN en Expo Go). Gemini 2.5 Flash multimodal recoit l'image + prompt multilingue. Retourne JSON {name, quantity, unit g/ml, description, calories, protein, carbs, fat}. Ecran log-food-details pre-rempli permet edition avant sauvegarde."),
    ("Recherche base alimentaire",
     "FatSecret OAuth2 (client credentials). Cache du token (TTL 24h). Retry 401 avec refresh automatique. Resultats paginals (max 5)."),
    ("Saisie manuelle",
     "log-manual.tsx : champs calories + macros + nom + photo optionnelle. Met a jour cache LoggingContext et Firestore simultanement."),
    ("Eau quotidienne",
     "add-water.tsx : increments 125 ml (demi-verre) jusqu'a 1000 ml. Animation glasses empty/half/full. Log type='water' avec calories=ml (convention)."),
    ("Log exercice cardio",
     "workout-details avec type='run'. 6 activites : running, walking, cycling, swimming, hiking, rowing. Formule MET : (MET x 3.5 x poids / 200) x duree_min. Raffinement Gemini text puis moyenne. Intensite low/med/high change le MET."),
    ("Log exercice musculation",
     "workout-details avec type='lifting'. 6 exercices : bench_press, squat, deadlift, shoulder_press, pullup, bicep_curl. MET ajuste par intensite + duree. Images Unsplash."),
    ("Workout result",
     "Affiche 'Your workout burned X kcal'. Image hero, intensite badge. Bouton Log Workout -&gt; addNutritionLog(type='activity') -&gt; triggerRefresh()."),
    ("Analytics",
     "(tabs)/analytics.tsx : graphiques line/bar react-native-chart-kit. Tendances 7j/30j calories, macros, eau, exercice. InsightsService calcule moyennes et ecarts vs objectif."),
    ("Profil et preferences",
     "Edition poids/taille, preferences langue (EN/FR/AR), theme (light/dark/system), unites, objectifs caloriques personnalises, notifications on/off."),
    ("Internationalisation",
     "3 langues avec RTL pour arabe. useTranslation() dans chaque ecran. Detection automatique de la langue systeme au premier lancement."),
    ("Theme clair/sombre",
     "ThemeContext resout 'system' via Appearance.getColorScheme(). Toggle rapide dans ScreenTopBar. Palette coherente bg/textPrimary/textMuted/cardBg/cardBorder."),
    ("Notifications push",
     "expo-notifications. Rappels quotidiens configurables : petit-dej, dejeuner, diner, eau. Page historique."),
    ("Abonnement Premium",
     "RevenueCat. Paywall natif (react-native-purchases-ui). Features premium : scans illimites, export donnees, themes exclusifs."),
    ("Feature requests",
     "Formulaire in-app, ecrit dans Firestore featureRequests avec vote."),
    ("Hors-ligne",
     "AsyncStorage cache les logs recents. La jauge calories reste fonctionnelle sans connexion ; sync automatique au retour en ligne."),
]
rows = [["Feature", "Description"]] + list(features)
story += [section_table(rows, col_widths=[4*cm, 12.5*cm])]
story += [PageBreak()]

# 7. TESTS
story += [p("7. Scenarios de test", H1)]
story += [p("Couverture ciblee : unitaires (Jest), integration (React Native Testing Library), E2E (Detox), et tests manuels (sanity).", BODY)]

story += [p("7.1 Tests unitaires (lib/)", H2)]
story += bullets([
    "firebase.ts - addNutritionLog() ecrit un doc avec userId, date, type corrects.",
    "firebase.ts - getUserFromFirestore() retourne null si doc inexistant.",
    "fatsecret.ts - getAccessToken() cache le token pendant TTL.",
    "fatsecret.ts - searchFood() declenche un refresh sur 401 puis retry.",
    "AiModel.ts - analyzeFoodImage() gere un JSON malforme et retourne une erreur typee.",
    "i18n.tsx - t(key) retourne la cle elle-meme si la langue n'a pas la traduction.",
    "i18n.tsx - isRTL === true pour arabe, false pour en/fr.",
    "ThemeContext - resolved === 'dark' quand mode='system' et Appearance='dark'.",
    "LoggingContext - triggerRefresh() incremente le compteur qui re-execute useEffect.",
    "LocalDataStore - colorLog n'emet pas en production (NODE_ENV).",
    "InsightsService - moyenne 7j correcte malgre jours manquants.",
    "BMR Mifflin-St Jeor : homme 30 ans 80 kg 180 cm -&gt; ~1780 kcal.",
])

story += [p("7.2 Tests d'integration (ecrans)", H2)]
story += bullets([
    "sign-in : mauvais password -&gt; alert 'Invalid credentials' affichee.",
    "sign-up : email invalide -&gt; bouton desactive.",
    "onboarding : progression 0-100% en 6 etapes, bouton back fonctionnel.",
    "onboarding/results : calorieGoal affiche correspond au calcul attendu (homme, 25 ans, 75 kg, 175 cm, maintain, moderate).",
    "Home : changer selectedDate via WeekCalendar recharge les logs.",
    "scan-camera : permission camera refusee -&gt; Alert + retour.",
    "scan-analysis : Gemini timeout -&gt; message d'erreur + bouton retry.",
    "scan-analysis : fichier image s'affiche malgre le '%' litteral dans le chemin Expo Go (re-encodage '%25').",
    "log-food-details : bouton Log desactive si calories === 0.",
    "log-food-details : sauvegarde -&gt; retour home -&gt; jauge calories mise a jour.",
    "log-exercise : les 3 cartes sont traduites dans la langue active.",
    "workout-details (run) : chaque activite affiche la bonne image Unsplash.",
    "workout-details : MET x 3.5 x 80 / 200 x 30 ~= 126 kcal pour running 80kg 30min med (MET 8).",
    "workout-result : image hero = param.image recu.",
    "add-water : + 8 fois -&gt; 1000 ml max (bouton + disabled).",
    "add-water : Log -&gt; Firestore doc cree type='water' calories=ml.",
    "food-database : recherche 'pizza' renvoie au moins 3 resultats.",
    "food-database : recherche vide desactive le bouton search.",
    "ActionMenu : les 4 titres sont traduits (EN/FR/AR).",
    "RemainingCaloriesCard : pencil -&gt; modal Daily Targets avec labels traduits.",
    "RTL arabe : fleche back inversee (scaleX: -1), textAlign right.",
    "Dark mode : bg = #0B0F14 pour tous les ecrans refactores.",
])

story += [p("7.3 Tests E2E (Detox)", H2)]
story += bullets([
    "Nouveau user : sign-up -&gt; OTP -&gt; onboarding -&gt; home (premiere ouverture).",
    "User existant : sign-in -&gt; home directement.",
    "Scan flow complet : FAB -&gt; Scan Food -&gt; Take Photo -&gt; capture -&gt; Gemini -&gt; edit -&gt; Log -&gt; verif jauge +X kcal.",
    "Workout flow : FAB -&gt; Log Exercise -&gt; Run -&gt; running -&gt; med -&gt; 30 min -&gt; Continue -&gt; workout-result -&gt; Log -&gt; verif activite dans ActivityList.",
    "Water flow : FAB -&gt; Add Water -&gt; +125x4 -&gt; Log -&gt; jauge water +500 ml.",
    "Food DB : FAB -&gt; Food Database -&gt; 'pizza' -&gt; selection -&gt; log-food-details -&gt; Log.",
    "Manual : FAB -&gt; Log Exercise -&gt; Manual -&gt; saisie -&gt; Save -&gt; verif cache + DB.",
    "Changement langue EN-FR-AR : tous les textes changent, layout RTL en AR.",
    "Changement theme light-dark-system : couleurs de fond changent.",
    "Sign-out -&gt; redirection sign-in -&gt; impossible d'acceder (tabs) directement.",
    "Mode avion : logs locaux s'affichent ; nouveau log mis en file -&gt; sync au retour en ligne.",
])

story += [p("7.4 Edge cases et cas limites", H2)]
story += bullets([
    "Photo 0 byte -&gt; Gemini renvoie erreur -&gt; Alert.",
    "Nom d'aliment vide apres edition -&gt; bouton Log desactive.",
    "Quantite negative saisie -&gt; valeur clampee a 0.",
    "Date future selectionnee dans WeekCalendar -&gt; lecture seule, bouton Log desactive.",
    "User supprime cote Clerk mais encore en session -&gt; 401 Firestore -&gt; deconnexion forcee.",
    "Token FatSecret expire pendant une recherche -&gt; retry transparent.",
    "Expo Go tue l'app pendant la camera -&gt; pending_scan_v1 dans AsyncStorage -&gt; relance scan-analysis au reboot.",
    "Gemini renvoie JSON avec backticks markdown -&gt; parser tolerant.",
    "Utilisateur depasse sa limite calorique -&gt; jauge passe rouge, pas de blocage.",
    "4G lente : spinner &gt; 10s -&gt; timeout + bouton cancel.",
    "Mode RTL : TextInput curseur a droite, padding inverse.",
    "Multiple instances app ouvertes (tablette split-screen) -&gt; LoggingContext coherent via AsyncStorage.",
    "Theme systeme change en live (iOS Auto dark a 18h) -&gt; UI re-render.",
    "Migration schema users (ajout champ) : backfill defensif dans getUserFromFirestore.",
    "Image URI avec espaces ou caracteres non-ASCII -&gt; encodage correct.",
    "Timezone : log a 23:55 vs minuit -&gt; date YYYY-MM-DD locale, pas UTC.",
    "Deux devices meme compte : triggerRefresh recu via onSnapshot Firestore (si active).",
])

story += [p("7.5 Tests de performance", H2)]
story += bullets([
    "Liste ActivityList de 500 items -&gt; scroll fluide (FlashList).",
    "Gemini Vision &lt; 5s pour photo 200 KB.",
    "Recherche FatSecret &lt; 1.5s.",
    "Ouverture Home depuis cold start &lt; 2s.",
    "Bundle size &lt; 40 MB (EAS production).",
    "Consommation RAM camera &lt; 300 MB (sinon kill Android).",
])

story += [p("7.6 Tests de securite", H2)]
story += bullets([
    "Regles Firestore : utilisateur A ne peut pas lire les logs de B (test avec deux comptes).",
    "Cles API (Gemini, FatSecret) non exposees dans le bundle JS (Constants.expoConfig.extra).",
    "Tokens Clerk stockes en SecureStore (pas AsyncStorage).",
    "Pas de logs avec donnees sensibles (email complet, token) en production.",
    "Input sanitization : injection FatSecret via query speciale.",
    "Navigation guards : acces direct /(tabs) sans session -&gt; redirect sign-in.",
])
story += [PageBreak()]

# 8. SEC/PERF/DEPLOY
story += [p("8. Securite, performance et deploiement", H1)]

story += [p("Securite", H2)]
story += bullets([
    "Authentification Clerk avec JWT court (15 min) + refresh token en SecureStore.",
    "Regles Firestore strictes par userId (email Clerk).",
    "Aucune cle API en clair dans le repo : toutes dans app.json -&gt; extra (EAS Secrets recommande en prod).",
    "HTTPS uniquement pour toutes les API (Firestore, Gemini, FatSecret).",
    "Permissions Android declarees : CAMERA, READ_MEDIA_IMAGES, POST_NOTIFICATIONS, INTERNET.",
    "iOS : NSCameraUsageDescription, NSPhotoLibraryUsageDescription.",
])

story += [p("Performance", H2)]
story += bullets([
    "expo-camera CameraView INLINE evite l'Intent Android et donc le kill d'activity RN en Expo Go.",
    "Images Gemini compressees a quality 0.3 (~200 KB) pour reduire RAM et latence.",
    "FlashList pour listes longues (virtualized).",
    "Reanimated 3 en UI thread (new architecture bridgeless).",
    "AsyncStorage cache pour affichage instant offline.",
    "Token FatSecret mis en cache pour economiser un round-trip OAuth.",
])

story += [p("Deploiement", H2)]
story += bullets([
    "EAS Build profils : development (dev-client), preview (APK testeurs), production (AAB / IPA).",
    "OTA via EAS Update pour patches JS instantanes.",
    "CI recommande : GitHub Actions -&gt; eas build --non-interactive --profile production sur tag.",
    "Stores : Google Play (Android), App Store (iOS, TestFlight pour beta).",
    "Monitoring : Expo Dashboard + Sentry (a integrer).",
])

story += [p("Conclusion", H2)]
story += [p(
    "Salorie combine une UX mobile soignee (animations Reanimated, theme clair/sombre, 3 langues avec RTL) "
    "avec une pile IA moderne (Gemini 2.5 Flash pour la reconnaissance nutritionnelle et le raffinement "
    "des estimations sportives) et une infrastructure cloud eprouvee (Clerk + Firestore). Ce rapport couvre "
    "tous les aspects techniques necessaires pour onboarder un nouveau developpeur, auditer la securite, "
    "ou etendre l'application avec de nouvelles features.", BODY)]

# Build
doc = SimpleDocTemplate(OUT, pagesize=A4,
    leftMargin=1.8*cm, rightMargin=1.8*cm,
    topMargin=1.8*cm, bottomMargin=1.8*cm,
    title="Salorie - Rapport Technique",
    author="Equipe Salorie")

def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(colors.HexColor('#94A3B8'))
    canvas.drawString(1.8*cm, 1*cm, "Salorie - Rapport Technique")
    canvas.drawRightString(A4[0]-1.8*cm, 1*cm, f"Page {doc.page}")
    canvas.restoreState()

doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
print(f"OK -> {OUT}")
