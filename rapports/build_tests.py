"""
Generates SALORIE_RAPPORT_TESTS.pdf — exhaustive functional test suite covering
every feature / component of the Salorie mobile app. Each test case has:
  ID, Catégorie, Titre, Préconditions, Étapes, Résultat attendu, Priorité.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER

OUT = r"C:\Users\21266\Desktop\sdk52\salorie\salorie\rapports\SALORIE_RAPPORT_TESTS.pdf"

# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontSize=22, spaceAfter=14,
                   textColor=colors.HexColor("#065F46"))
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontSize=15, spaceAfter=10,
                    spaceBefore=16, textColor=colors.HexColor("#047857"))
H3 = ParagraphStyle("H3", parent=ss["Heading3"], fontSize=12, spaceAfter=6,
                    textColor=colors.HexColor("#065F46"))
P  = ParagraphStyle("P", parent=ss["BodyText"], fontSize=9.5, leading=13)
SMALL = ParagraphStyle("Small", parent=ss["BodyText"], fontSize=8.5, leading=11)
TITLE = ParagraphStyle("Title", parent=ss["Title"], fontSize=26, textColor=colors.HexColor("#065F46"))
SUBTITLE = ParagraphStyle("Sub", parent=ss["Normal"], fontSize=12, textColor=colors.HexColor("#047857"), alignment=TA_CENTER)

# ---------------------------------------------------------------------------
# Test data — each tuple: (id, title, preconditions, steps, expected, priority)
# Categories are added per section.
# ---------------------------------------------------------------------------

SECTIONS = [
    # =====================================================================
    ("1. Authentification (Clerk)", [
        ("AUTH-01", "Inscription email/password valide",
         "App installée, aucun compte existant pour l'email.",
         "1. Ouvrir l'app → écran Sign Up. 2. Saisir email valide + mot de passe ≥ 8c. 3. Valider. 4. Entrer code OTP reçu.",
         "Compte créé, redirection vers l'onboarding.", "Haute"),
        ("AUTH-02", "Inscription avec email déjà utilisé",
         "Un compte existe avec cet email.",
         "1. Sign Up → saisir un email existant. 2. Valider.",
         "Message d'erreur clair 'email déjà utilisé', pas de création.", "Haute"),
        ("AUTH-03", "Mot de passe trop court (<8 caractères)",
         "—",
         "1. Sign Up → saisir un mot de passe 6 caractères. 2. Valider.",
         "Erreur 'mot de passe trop court', champ en rouge.", "Moyenne"),
        ("AUTH-04", "Code OTP incorrect",
         "Inscription en cours, OTP demandé.",
         "1. Entrer un code OTP invalide. 2. Valider.",
         "Erreur affichée, possibilité de renvoyer le code.", "Haute"),
        ("AUTH-05", "Connexion email/password réussie",
         "Compte existant vérifié.",
         "1. Sign In → saisir email + password corrects. 2. Valider.",
         "Accès à l'app, redirection vers home si déjà onboarded.", "Haute"),
        ("AUTH-06", "Connexion avec mauvais mot de passe",
         "Compte existant.",
         "1. Sign In → mauvais password. 2. Valider.",
         "Erreur 'mot de passe incorrect', aucune session créée.", "Haute"),
        ("AUTH-07", "Google OAuth — premier login",
         "Google Play Services actif.",
         "1. Sign In → bouton Google. 2. Choisir compte Google.",
         "Compte créé côté Clerk, entrée users/{email} en Firestore, redirection onboarding.", "Haute"),
        ("AUTH-08", "Google OAuth — login récurrent",
         "Déjà connecté une fois via Google.",
         "1. Sign In → bouton Google. 2. Choisir le même compte.",
         "Session rétablie sans re-consentir, redirection vers home.", "Haute"),
        ("AUTH-09", "Sign out depuis Profile",
         "Utilisateur connecté.",
         "1. Onglet Profile. 2. Bouton Sign Out. 3. Confirmer.",
         "Session Clerk détruite, retour écran Sign In.", "Haute"),
        ("AUTH-10", "Reprise de session après kill app",
         "Utilisateur connecté, app fermée de force.",
         "1. Tuer l'app. 2. Relancer.",
         "Session restaurée depuis SecureStore, pas besoin de reconnexion.", "Haute"),
        ("AUTH-11", "Reset password via email",
         "Compte existant.",
         "1. Sign In → 'Mot de passe oublié'. 2. Saisir email. 3. Suivre lien reçu.",
         "Nouveau mot de passe accepté, connexion possible.", "Moyenne"),
        ("AUTH-12", "Token JWT expiré",
         "Session vieille de >24h.",
         "1. Ouvrir l'app.",
         "Refresh silencieux du token Clerk, aucune déconnexion visible.", "Moyenne"),
    ]),
    # =====================================================================
    ("2. Onboarding", [
        ("ONB-01", "Parcours onboarding complet (nouveau user)",
         "Compte tout juste créé.",
         "1. Entrer prénom. 2. Choisir sexe. 3. Âge. 4. Poids + taille. 5. Niveau d'activité. 6. Objectif (lose/maintain/gain).",
         "Profil sauvegardé en Firestore, calcul du `dailyCalories` (Mifflin-St Jeor), redirection home.", "Haute"),
        ("ONB-02", "Saut d'un champ obligatoire",
         "Onboarding en cours.",
         "1. Laisser le poids vide. 2. Tenter 'Next'.",
         "Bouton Next désactivé ou message d'erreur; pas d'avancement.", "Haute"),
        ("ONB-03", "Valeurs extrêmes (âge 150, poids 5)",
         "—",
         "1. Saisir âge=150 ou poids=5. 2. Valider.",
         "Validation rejette les valeurs hors bornes (ex. 10-120 âge, 20-300 poids).", "Moyenne"),
        ("ONB-04", "Reprise onboarding si quitté à mi-chemin",
         "User a fait étapes 1-3 puis killed app.",
         "1. Relancer l'app.",
         "Redirection vers l'étape 4 (pas depuis le début).", "Moyenne"),
        ("ONB-05", "Flag onboarded=true après finalisation",
         "Fin de l'onboarding.",
         "1. Vérifier Firestore users/{email}.",
         "Champ `onboarded: true` + `dailyCalories` calculé présent.", "Haute"),
        ("ONB-06", "Redirection post-onboarding",
         "Onboarding validé.",
         "1. Relancer l'app à froid.",
         "Home directement, plus jamais d'onboarding.", "Haute"),
    ]),
    # =====================================================================
    ("3. Home / WeekCalendar", [
        ("HOME-01", "Affichage de la semaine courante",
         "User onboarded.",
         "1. Ouvrir onglet Home.",
         "Les 7 jours (Sun→Sat) affichés, dimanche à gauche, aujourd'hui surligné en couleur primaire.", "Haute"),
        ("HOME-02", "Alignement horizontal des cercles",
         "—",
         "1. Observer les 7 cercles de dates.",
         "Tous les cercles alignés au même niveau vertical (flex-start).", "Haute"),
        ("HOME-03", "Scroll horizontal vers semaine précédente",
         "—",
         "1. Swipe droite→gauche.",
         "Semaine précédente apparaît, pagination snappy (SCREEN_WIDTH).", "Haute"),
        ("HOME-04", "Scroll 52 semaines en arrière",
         "—",
         "1. Swipe jusqu'à atteindre semaine -52.",
         "Pas de crash, l'affichage reste cohérent.", "Moyenne"),
        ("HOME-05", "Jour futur désactivé",
         "—",
         "1. Tenter de tapper un jour après aujourd'hui.",
         "Aucune réaction, jour affiché en pointillé/gris.", "Haute"),
        ("HOME-06", "Sélection d'un jour passé",
         "—",
         "1. Tap sur un jour précédent.",
         "Jour surligné avec bord épais, les logs de ce jour s'affichent en dessous.", "Haute"),
        ("HOME-07", "Label 'restant' sous jour passé (sous objectif)",
         "Goal 2000, consommé 1500 ce jour.",
         "1. Regarder le label sous le cercle.",
         "'+500 kcal' en vert.", "Haute"),
        ("HOME-08", "Label '0 kcal' (objectif atteint exactement)",
         "Goal 2000, consommé 2000.",
         "1. Vérifier label.",
         "'0 kcal' en vert.", "Moyenne"),
        ("HOME-09", "Label '-X kcal' (dépassement)",
         "Goal 2000, consommé 2300.",
         "1. Vérifier label.",
         "'-300 kcal' en rouge.", "Haute"),
        ("HOME-10", "Jour sans aucun log",
         "Aucun meal ce jour.",
         "1. Observer le jour.",
         "Label affiche '+goal kcal' (par défaut 2000 si profil pas chargé).", "Moyenne"),
        ("HOME-11", "Retour au jour courant",
         "Jour passé sélectionné.",
         "1. Tap sur le cercle d'aujourd'hui.",
         "Home repasse sur les logs d'aujourd'hui.", "Haute"),
        ("HOME-12", "Indicateur 'today' (dot primary)",
         "—",
         "1. Observer sous le cercle d'aujourd'hui.",
         "Petit point bleu/primaire visible quand aujourd'hui n'est pas sélectionné.", "Basse"),
        ("HOME-13", "Ring de progression des calories",
         "Logs du jour.",
         "1. Observer le ring circulaire.",
         "Pourcentage = consumed/goal, couleur verte si ≤goal, rouge au-delà.", "Haute"),
        ("HOME-14", "Récapitulatif protéines/glucides/lipides",
         "Plusieurs meals loggés.",
         "1. Vérifier cartes macros.",
         "Chiffres corrects (sum des champs des meals du jour).", "Haute"),
        ("HOME-15", "Liste des meals du jour",
         "Au moins 1 meal aujourd'hui.",
         "1. Scroller la section 'Today'.",
         "Chaque meal listé avec nom, kcal, heure, serving.", "Haute"),
    ]),
    # =====================================================================
    ("4. Logging — Meals", [
        ("MEAL-01", "Log manuel (saisie texte libre)",
         "Home ouvert.",
         "1. FAB + → Meal. 2. Saisir nom + serving. 3. Laisser Gemini estimer les macros.",
         "Meal créé en Firestore avec macros plausibles, apparaît immédiatement dans la liste.", "Haute"),
        ("MEAL-02", "Log via photo (Gemini Vision)",
         "Caméra autorisée.",
         "1. FAB + → Photo. 2. Prendre une photo d'un plat. 3. Attendre l'analyse.",
         "Nom + calories + macros extraits; bouton Save enregistre en Firestore.", "Haute"),
        ("MEAL-03", "Photo illisible/sombre",
         "—",
         "1. Uploader une photo noire.",
         "Message d'erreur ou estimation basse; pas de crash.", "Moyenne"),
        ("MEAL-04", "Recherche FatSecret par mot-clé",
         "—",
         "1. FAB + → Search. 2. Taper 'chicken'. 3. Attendre résultats.",
         "Liste d'items FatSecret avec marque, kcal, serving.", "Haute"),
        ("MEAL-05", "Sélection d'un résultat FatSecret",
         "Résultats affichés.",
         "1. Tap sur un item. 2. Confirmer serving. 3. Save.",
         "Meal ajouté avec les données officielles FatSecret.", "Haute"),
        ("MEAL-06", "Offline FatSecret",
         "Mode avion.",
         "1. Rechercher.",
         "Message 'pas de connexion', pas de crash.", "Moyenne"),
        ("MEAL-07", "Édition d'un meal existant",
         "Au moins 1 meal loggé.",
         "1. Long-press sur un meal. 2. Éditer serving/kcal. 3. Save.",
         "Firestore mis à jour, home reflète la modif immédiatement.", "Haute"),
        ("MEAL-08", "Suppression d'un meal",
         "Meal existant.",
         "1. Swipe-to-delete ou menu. 2. Confirmer.",
         "Log retiré de Firestore + cache local + UI.", "Haute"),
        ("MEAL-09", "Logger pour un jour passé",
         "Jour passé sélectionné dans WeekCalendar.",
         "1. FAB + → Meal → Save.",
         "Log créé avec `date` = jour passé, pas aujourd'hui.", "Haute"),
        ("MEAL-10", "Macros cohérentes",
         "—",
         "1. Ajouter un meal 500 kcal. 2. Vérifier que protein*4 + carbs*4 + fat*9 ≈ calories.",
         "Écart < 15 %.", "Moyenne"),
        ("MEAL-11", "Stale insights après ajout meal",
         "Insights week déjà générées.",
         "1. Ajouter un meal. 2. Ouvrir Analytics.",
         "Flag `stale=true` flippé, régénération AI déclenchée.", "Haute"),
        ("MEAL-12", "Meal favori (si impl.)",
         "Meals historiques dispo.",
         "1. Section Favorites. 2. Tap un favori. 3. Save.",
         "Ajout rapide sans ressaisie.", "Basse"),
    ]),
    # =====================================================================
    ("5. Logging — Activities", [
        ("ACT-01", "Log activité standard (running)",
         "—",
         "1. FAB + → Activity → 'Morning Run'. 2. Durée 30 min. 3. Intensité medium. 4. Save.",
         "Activity créée, kcal burned calculés et affichés dans ring 'Burned'.", "Haute"),
        ("ACT-02", "Durée 0 minute",
         "—",
         "1. Log activité 0 min.",
         "Validation rejette ou kcal=0.", "Moyenne"),
        ("ACT-03", "Durée extrême (24h)",
         "—",
         "1. Saisir 1440 min.",
         "Accepté mais clampé ou warning.", "Basse"),
        ("ACT-04", "Suppression d'une activité",
         "Act existante.",
         "1. Swipe delete.",
         "Supprimée du store, ring 'Burned' mis à jour.", "Haute"),
        ("ACT-05", "Kcal burned recalculés dynamiquement",
         "Intensité change.",
         "1. Éditer intensité low→high.",
         "Valeur mise à jour en conséquence.", "Moyenne"),
        ("ACT-06", "Act loggée jour passé",
         "Jour passé sélectionné.",
         "1. Log activity.",
         "Date assignée = jour sélectionné.", "Moyenne"),
    ]),
    # =====================================================================
    ("6. Logging — Water", [
        ("WATER-01", "Ajout verre d'eau",
         "—",
         "1. Home → bouton water +250ml.",
         "Compteur water incrémenté, log type=water en Firestore.", "Haute"),
        ("WATER-02", "Retirer un verre",
         "Compteur > 0.",
         "1. Tap bouton '-'.",
         "Compteur décrémenté, log supprimé ou ajusté.", "Moyenne"),
        ("WATER-03", "Objectif quotidien atteint",
         "2L atteints.",
         "1. Compter jusqu'à 2000ml.",
         "Animation/feedback positif, couleur du compteur changée.", "Moyenne"),
        ("WATER-04", "Persistance water entre jours",
         "Lundi 8 verres.",
         "1. Changer à mardi.",
         "Mardi compteur = 0, lundi garde ses 8 verres.", "Haute"),
    ]),
    # =====================================================================
    ("7. Analytics", [
        ("ANA-01", "Ouverture onglet Analytics",
         "User connecté, logs dispo.",
         "1. Tap onglet Analytics.",
         "Bento grid + charts + coming-soon section rendus.", "Haute"),
        ("ANA-02", "Cache-hit instant render",
         "Analytics déjà ouvert une fois.",
         "1. Ré-ouvrir Analytics.",
         "Contenu affiché <200ms depuis AsyncStorage.", "Haute"),
        ("ANA-03", "Chart bar 'Consumed vs Burned'",
         "7 jours de logs.",
         "1. Regarder chart.",
         "2 datasets côte-à-côte, légende en bas.", "Haute"),
        ("ANA-04", "Bento 'Weekly Outlook' (AI summary)",
         "Insights chargées.",
         "1. Observer cell 1.",
         "Résumé AI dans la langue courante.", "Haute"),
        ("ANA-05", "Health Score (0-100)",
         "—",
         "1. Observer score card.",
         "Nombre + barre de progression proportionnelle.", "Haute"),
        ("ANA-06", "Top Food",
         "≥10 logs.",
         "1. Observer Bento 'Top Logged'.",
         "Aliment le plus fréquent listé.", "Moyenne"),
        ("ANA-07", "Hydration Status",
         "—",
         "1. Observer cell Hydration.",
         "Statut ('Good'/'Low'/'Excellent') cohérent.", "Moyenne"),
        ("ANA-08", "Recommendation personnalisée",
         "—",
         "1. Lire la carte Recommendation.",
         "Conseil actionnable (mentionne hydratation, macros ou activité).", "Haute"),
        ("ANA-09", "Exercise Insight (carte verte)",
         "Activités loggées.",
         "1. Lire la carte verte Exercise Insight.",
         "Texte détaillé (nb sessions, kcal, intensité) — PAS le placeholder 'coming in the next update'.", "Haute"),
        ("ANA-10", "Monthly Outlook",
         "Insights month générées.",
         "1. Observer cell Monthly.",
         "Résumé mois en cours, distinct de celui de la semaine.", "Moyenne"),
        ("ANA-11", "All-time Outlook",
         "—",
         "1. Observer cell All-time.",
         "Vue globale depuis l'inscription.", "Basse"),
        ("ANA-12", "Switch langue → insights re-rendent",
         "3 langues dispo dans doc.",
         "1. Changer la langue EN→FR dans Settings. 2. Revenir sur Analytics.",
         "Cartes Bento affichent la version FR sans refaire un appel Gemini.", "Haute"),
        ("ANA-13", "Fallback EN si FR manque un champ",
         "Subtree FR incomplet (ex. exerciseAnalysis vide).",
         "1. Passer en FR.",
         "Champ manquant rempli depuis EN au lieu du placeholder.", "Haute"),
        ("ANA-14", "Régénération après stale=true",
         "Flag stale flipped.",
         "1. Ouvrir Analytics.",
         "Gemini re-appelé, nouveau contenu visible, stale remis à false.", "Haute"),
        ("ANA-15", "TTL 7 jours expire",
         "Sync token > 7 jours.",
         "1. Modifier timestamp en local storage. 2. Ouvrir Analytics.",
         "Force refresh depuis serveur, nouveau token posé.", "Moyenne"),
        ("ANA-16", "Offline — cache seul",
         "Mode avion.",
         "1. Ouvrir Analytics.",
         "Cache rendu, pas d'erreur, pas d'appel réseau.", "Haute"),
        ("ANA-17", "Streak days (7 jours actifs)",
         "Logs chaque jour.",
         "1. Observer widget streak.",
         "7/7 affichés.", "Moyenne"),
        ("ANA-18", "Streak cassé",
         "1 jour manqué.",
         "1. Observer.",
         "Compteur reset à 0 ou à la série active actuelle.", "Moyenne"),
        ("ANA-19", "Tab bar ne masque pas dernière carte",
         "Scroll jusqu'en bas.",
         "1. Défiler jusqu'à la dernière Bento card.",
         "Carte entièrement visible (paddingBottom suffisant).", "Haute"),
    ]),
    # =====================================================================
    ("8. Profile", [
        ("PROF-01", "Affichage infos profil",
         "—",
         "1. Onglet Profile.",
         "Prénom, email, goal, weight, dailyCalories visibles.", "Haute"),
        ("PROF-02", "Édition du poids",
         "—",
         "1. Edit Weight → 75 kg.",
         "Firestore mis à jour, dailyCalories recalculé.", "Haute"),
        ("PROF-03", "Changement d'objectif",
         "—",
         "1. Goal: lose→maintain.",
         "`dailyCalories` recalculé en conséquence.", "Haute"),
        ("PROF-04", "Bouton 'Seed demo data'",
         "—",
         "1. Tap Seed.",
         "Logs 11 jours + insights seed apparaissent, count dans log console = 64.", "Moyenne"),
        ("PROF-05", "Bouton 'Reset all data'",
         "—",
         "1. Reset → confirmer.",
         "Tous les logs supprimés, compteurs à 0.", "Haute"),
        ("PROF-06", "Avatar par défaut",
         "User sans avatar.",
         "1. Observer avatar.",
         "Initiales affichées avec couleur pastel.", "Basse"),
    ]),
    # =====================================================================
    ("9. Premium / RevenueCat", [
        ("PREM-01", "Ouverture paywall",
         "Free user.",
         "1. Tap feature premium (ex. rapport PDF).",
         "Paywall RevenueCat affiché avec 2 plans.", "Haute"),
        ("PREM-02", "Achat monthly réussi (sandbox)",
         "Compte test Google Play.",
         "1. Sélectionner monthly → Subscribe.",
         "entitlement `pro` activé, UI débloquée.", "Haute"),
        ("PREM-03", "Restore purchases",
         "User a déjà acheté.",
         "1. Settings → Restore.",
         "Entitlement réactivé sans paiement.", "Haute"),
        ("PREM-04", "Expo Go detection",
         "App lancée dans Expo Go.",
         "1. Observer logs.",
         "'Using RevenueCat in Browser Mode' — pas de crash.", "Moyenne"),
        ("PREM-05", "Paywall not available in Expo Go",
         "—",
         "1. Tenter d'ouvrir paywall en Expo Go.",
         "Message 'Paywall not available' loggé, fallback UI.", "Basse"),
    ]),
    # =====================================================================
    ("10. Internationalisation (i18n)", [
        ("I18N-01", "Changement de langue EN→FR",
         "—",
         "1. Settings → Language → FR.",
         "Toutes les strings basculent sans reload.", "Haute"),
        ("I18N-02", "Changement FR→AR (RTL)",
         "—",
         "1. Settings → Language → AR.",
         "UI bascule en RTL (flèches, padding miroir), texte en arabe.", "Haute"),
        ("I18N-03", "Persistance langue",
         "Langue = FR.",
         "1. Killed app → relancer.",
         "FR toujours active.", "Haute"),
        ("I18N-04", "Clé manquante",
         "Clé supprimée pour test.",
         "1. Afficher écran impacté.",
         "Fallback à la clé brute ou EN, pas de crash.", "Moyenne"),
        ("I18N-05", "Insight Gemini dans 3 langues",
         "Insight doc contient en/fr/ar.",
         "1. Switch langue 3 fois.",
         "Chaque langue affiche son subtree sans refetch Gemini.", "Haute"),
        ("I18N-06", "Format nombre/date localisé",
         "—",
         "1. Observer dates et chiffres en FR vs EN.",
         "FR: '21 avril', EN: 'April 21'.", "Basse"),
    ]),
    # =====================================================================
    ("11. Thème (light/dark)", [
        ("THM-01", "Bascule light→dark",
         "—",
         "1. Settings → Theme → Dark.",
         "Arrière-plans sombres, textes clairs, pas de zones illisibles.", "Haute"),
        ("THM-02", "Suivi du système",
         "Thème=auto.",
         "1. Mettre le téléphone en dark mode.",
         "App bascule automatiquement.", "Moyenne"),
        ("THM-03", "Persistance thème",
         "Dark actif.",
         "1. Relancer l'app.",
         "Dark toujours actif.", "Haute"),
        ("THM-04", "Contraste texte en dark mode",
         "—",
         "1. Vérifier chaque écran en dark.",
         "Aucun texte noir sur fond noir.", "Haute"),
    ]),
    # =====================================================================
    ("12. Firebase / Firestore sync", [
        ("FS-01", "Création doc user au signup",
         "Nouveau compte.",
         "1. Signup → vérifier Firestore console.",
         "users/{email} créé avec email + createdAt.", "Haute"),
        ("FS-02", "emailToDocId normalise",
         "Email avec point/+.",
         "1. test+foo@bar.com.",
         "docId échappe les caractères spéciaux de façon idempotente.", "Haute"),
        ("FS-03", "Query logs par date",
         "100 logs sur 60 jours.",
         "1. WeekCalendar fetch.",
         "Query where('date','>=', sinceStr) retourne la bonne plage.", "Haute"),
        ("FS-04", "Écriture concurrente 2 devices",
         "Logged-in sur 2 téléphones.",
         "1. Logger un meal depuis les 2.",
         "Les 2 logs apparaissent, pas de doublon ni de perte.", "Moyenne"),
        ("FS-05", "Règles de sécurité",
         "—",
         "1. Tenter d'accéder aux logs d'un autre user via devtools.",
         "Permission denied côté règles Firestore.", "Haute"),
        ("FS-06", "Déconnexion puis reconnexion",
         "Logs cachés locaux.",
         "1. Sign out → sign in même compte.",
         "Cache resynchronisé depuis serveur sans perte.", "Haute"),
    ]),
    # =====================================================================
    ("13. Cache & Offline", [
        ("CACHE-01", "Cache fresh (<7 jours) skip sync",
         "Dernière sync ≤ 6 jours.",
         "1. Ouvrir l'app.",
         "Log '[Sync] local cache is fresh, skipping'.", "Moyenne"),
        ("CACHE-02", "Cache expiré force resync",
         "Sync token 8 jours.",
         "1. Ouvrir l'app.",
         "Refetch complet Firestore.", "Moyenne"),
        ("CACHE-03", "Offline — lecture possible",
         "Mode avion.",
         "1. Home / Analytics.",
         "Données cachées lues, bannière offline affichée.", "Haute"),
        ("CACHE-04", "Offline — écriture queued",
         "Mode avion.",
         "1. Logger un meal.",
         "Optimistic update, upload au retour du réseau.", "Moyenne"),
        ("CACHE-05", "Invalidation cache insights après seed",
         "Seed lancé.",
         "1. Vérifier AsyncStorage.",
         "Clés `insights_{docId}_{periodKey}` et `insights_synced_{docId}` supprimées.", "Haute"),
    ]),
    # =====================================================================
    ("14. Notifications", [
        ("NOTIF-01", "Permission demandée au 1er launch",
         "Fresh install.",
         "1. Lancer app.",
         "Dialog système 'Autoriser notifications'.", "Moyenne"),
        ("NOTIF-02", "Rappel repas à 12h",
         "Notif meal lunch activée.",
         "1. Attendre 12:00.",
         "Notification push reçue.", "Moyenne"),
        ("NOTIF-03", "Désactiver dans Settings",
         "—",
         "1. Settings → Notifications → off.",
         "Plus aucune notif jusqu'à réactivation.", "Moyenne"),
        ("NOTIF-04", "Tap notif → deep link",
         "Notif reçue.",
         "1. Tap.",
         "App s'ouvre sur Home (pas sur Splash).", "Basse"),
    ]),
    # =====================================================================
    ("15. Performance & robustesse", [
        ("PERF-01", "Démarrage à froid <3s",
         "—",
         "1. Tuer app → relancer → chronométrer.",
         "Splash → Home en ≤3s (mobile milieu de gamme).", "Haute"),
        ("PERF-02", "Scroll WeekCalendar 60fps",
         "—",
         "1. Swipe plusieurs semaines.",
         "Aucun freeze, 60fps sur Pixel 6.", "Moyenne"),
        ("PERF-03", "Long list logs (500 items)",
         "—",
         "1. Scroller la liste d'historique.",
         "FlatList virtualisée, mémoire stable.", "Moyenne"),
        ("PERF-04", "Retry Gemini après échec réseau",
         "Coupure brève.",
         "1. Logger meal photo.",
         "1 retry automatique puis message d'erreur si persiste.", "Moyenne"),
        ("PERF-05", "Reanimated FadeInDown visible",
         "—",
         "1. Ouvrir Analytics.",
         "Toutes les cartes Bento apparaissent progressivement, aucune ne reste à opacity 0.", "Haute"),
        ("PERF-06", "Pas de memory leak après 30min",
         "—",
         "1. Naviguer 30 min entre onglets.",
         "Mémoire ne dépasse pas 250 MB.", "Basse"),
    ]),
    # =====================================================================
    ("16. Accessibilité", [
        ("A11Y-01", "Labels accessibilité FAB +",
         "—",
         "1. Activer TalkBack.",
         "FAB annoncé 'Add new log'.", "Moyenne"),
        ("A11Y-02", "Taille de police system override",
         "Font-size Android = largest.",
         "1. Ouvrir app.",
         "Layout ne casse pas, texte lisible.", "Moyenne"),
        ("A11Y-03", "Contraste AA minimum",
         "—",
         "1. Scanner les écrans avec Accessibility Scanner.",
         "Contrastes ≥ 4.5:1 sur texte principal.", "Moyenne"),
    ]),
    # =====================================================================
    ("17. Sécurité", [
        ("SEC-01", "Clés API non hardcodées",
         "—",
         "1. Grep dans les bundles.",
         "Aucune clé Gemini/Firebase en clair dans JS transpilé.", "Haute"),
        ("SEC-02", "Stockage password sécurisé",
         "—",
         "1. Inspecter SecureStore.",
         "Tokens Clerk chiffrés par Keystore/Keychain.", "Haute"),
        ("SEC-03", "Injection Firestore via email",
         "Email contient caractères spéciaux.",
         "1. Tenter emailToDocId('x/../admin').",
         "Échappement correct, pas d'accès à un autre doc.", "Haute"),
        ("SEC-04", "Logout efface le cache sensible",
         "—",
         "1. Sign out.",
         "AsyncStorage de l'user vidé.", "Haute"),
    ]),
    # =====================================================================
    ("18. Edge cases", [
        ("EDGE-01", "App installée sur tablette",
         "—",
         "1. Ouvrir sur tablette 10''.",
         "Layout s'adapte (pas d'étirement laid).", "Basse"),
        ("EDGE-02", "Rotation paysage",
         "—",
         "1. Tourner.",
         "App verrouillée portrait OU layout paysage cohérent.", "Basse"),
        ("EDGE-03", "Changement de fuseau horaire en cours d'usage",
         "—",
         "1. Changer le timezone du téléphone.",
         "Date courante recalculée en local, pas de jump de jour.", "Haute"),
        ("EDGE-04", "Passage minuit au milieu d'un log",
         "23:59 au début.",
         "1. Ouvrir form, attendre minuit, sauvegarder.",
         "Log attaché au jour courant du save, pas celui du form open.", "Moyenne"),
        ("EDGE-05", "Batterie faible mode économie",
         "—",
         "1. Activer économie.",
         "App reste fonctionnelle, animations réduites.", "Basse"),
        ("EDGE-06", "Espace disque plein",
         "—",
         "1. Remplir le stockage. 2. Prendre photo meal.",
         "Message d'erreur clair, pas de crash.", "Basse"),
        ("EDGE-07", "Caractères unicode dans nom meal",
         "—",
         "1. Nom = '🍎 pomme'.",
         "Sauvegardé et affiché correctement.", "Basse"),
        ("EDGE-08", "Email avec + (alias Gmail)",
         "test+demo@gmail.com.",
         "1. Signup.",
         "docId stable et retrouvable au login.", "Haute"),
    ]),
]

# ---------------------------------------------------------------------------
# Build doc
# ---------------------------------------------------------------------------
doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=1.6*cm, rightMargin=1.6*cm,
                        topMargin=1.8*cm, bottomMargin=1.8*cm)
story = []

# Cover
story.append(Spacer(1, 4*cm))
story.append(Paragraph("SALORIE", TITLE))
story.append(Spacer(1, 0.4*cm))
story.append(Paragraph("Rapport — Plan de tests fonctionnels", SUBTITLE))
story.append(Spacer(1, 0.3*cm))
story.append(Paragraph("Couverture exhaustive de tous les composants & features", SUBTITLE))
story.append(Spacer(1, 3*cm))
total_tests = sum(len(cases) for _, cases in SECTIONS)
story.append(Paragraph(
    f"<b>{total_tests} cas de tests</b> répartis en <b>{len(SECTIONS)} sections fonctionnelles</b>. "
    f"Chaque test comprend : ID, préconditions, étapes, résultat attendu, priorité. "
    f"Priorités : <b>Haute</b> (bloquant), <b>Moyenne</b> (dégrade l'UX), <b>Basse</b> (nice-to-have).", P))
story.append(PageBreak())

# Table of contents
story.append(Paragraph("Sommaire", H1))
for idx, (title, cases) in enumerate(SECTIONS, 1):
    story.append(Paragraph(f"{title} — <i>{len(cases)} tests</i>", P))
story.append(PageBreak())

# Sections
for section_title, cases in SECTIONS:
    story.append(Paragraph(section_title, H2))
    for (tid, title, pre, steps, expected, prio) in cases:
        prio_color = {
            "Haute": "#DC2626", "Moyenne": "#D97706", "Basse": "#059669"
        }.get(prio, "#6B7280")
        header = (f'<b>{tid}</b> &nbsp; <font color="{prio_color}">[{prio}]</font> '
                  f'&nbsp; <b>{title}</b>')
        rows = [
            [Paragraph(header, P)],
            [Paragraph(f"<b>Préconditions :</b> {pre}", SMALL)],
            [Paragraph(f"<b>Étapes :</b> {steps}", SMALL)],
            [Paragraph(f"<b>Résultat attendu :</b> {expected}", SMALL)],
        ]
        t = Table(rows, colWidths=[17*cm])
        t.setStyle(TableStyle([
            ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#D1D5DB")),
            ("BACKGROUND", (0,0), (0,0), colors.HexColor("#ECFDF5")),
            ("INNERGRID", (0,0), (-1,-1), 0.3, colors.HexColor("#E5E7EB")),
            ("LEFTPADDING", (0,0), (-1,-1), 8),
            ("RIGHTPADDING", (0,0), (-1,-1), 8),
            ("TOPPADDING", (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ]))
        story.append(KeepTogether([t, Spacer(1, 0.25*cm)]))
    story.append(Spacer(1, 0.4*cm))

# Annex
story.append(PageBreak())
story.append(Paragraph("Annexes — Méthodologie d'exécution", H1))
story.append(Paragraph(
    "<b>Environnements :</b><br/>"
    "• <b>Dev build</b> (EAS) : tous les tests sauf ceux marqués 'Expo Go only'.<br/>"
    "• <b>Expo Go</b> : limité (pas de RevenueCat natif, pas de notifications push).<br/>"
    "• <b>Production build</b> : passer l'ensemble avant chaque release.<br/><br/>"
    "<b>Jeux de données :</b><br/>"
    "• <b>Fresh account</b> : un compte neuf vérifie le parcours onboarding.<br/>"
    "• <b>Seed account</b> : un compte avec 11 jours de données préchargées via <i>Profile → Seed demo data</i>. "
    "Utile pour Analytics, streak, insights.<br/>"
    "• <b>Heavy account</b> : 6 mois de logs pour valider les performances.<br/><br/>"
    "<b>Critères de passage release :</b><br/>"
    "• 100% des tests <font color='#DC2626'><b>Haute</b></font> passent.<br/>"
    "• ≥ 90% des tests <font color='#D97706'><b>Moyenne</b></font> passent.<br/>"
    "• Les tests <font color='#059669'><b>Basse</b></font> ne bloquent pas la release mais sont loggués en backlog.<br/><br/>"
    "<b>Devices de référence :</b><br/>"
    "• Pixel 6 (Android 14, mid-range)<br/>"
    "• Samsung A14 (Android 13, entry-level)<br/>"
    "• iPhone 13 (iOS 17, mid-range Apple)<br/>"
    "• iPhone SE 2020 (iOS 16, small screen)",
    P))

doc.build(story)
print(f"Généré : {OUT}")
print(f"Total : {total_tests} tests fonctionnels répartis en {len(SECTIONS)} sections.")
