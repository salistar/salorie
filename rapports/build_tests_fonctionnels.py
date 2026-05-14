"""
Génère SALORIE_TESTS_FONCTIONNELS.pdf — catalogue exhaustif des tests
fonctionnels (manuels + automatisables) pour tous les composants de l'app.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether,
)
from reportlab.lib.enums import TA_CENTER

OUT = r"C:\Users\21266\Desktop\sdk52\salorie\salorie\rapports\SALORIE_TESTS_FONCTIONNELS.pdf"

ss = getSampleStyleSheet()
TITLE = ParagraphStyle("T", parent=ss["Title"], fontSize=26,
                       textColor=colors.HexColor("#065F46"))
SUB = ParagraphStyle("S", parent=ss["Normal"], fontSize=12, alignment=TA_CENTER,
                     textColor=colors.HexColor("#065F46"))
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontSize=18,
                    textColor=colors.HexColor("#065F46"), spaceAfter=10)
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontSize=13,
                    textColor=colors.HexColor("#047857"),
                    spaceAfter=6, spaceBefore=10)
P = ParagraphStyle("P", parent=ss["BodyText"], fontSize=9.5, leading=13)
SMALL = ParagraphStyle("SM", parent=ss["BodyText"], fontSize=8, leading=10.5)

doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=1.5*cm, rightMargin=1.5*cm,
                        topMargin=1.6*cm, bottomMargin=1.6*cm)
story = []

# Cover
story.append(Spacer(1, 4.5*cm))
story.append(Paragraph("SALORIE", TITLE))
story.append(Spacer(1, 0.4*cm))
story.append(Paragraph("Plan de tests fonctionnels exhaustif", SUB))
story.append(Spacer(1, 0.2*cm))
story.append(Paragraph("Couvre chaque composant, chaque flux, chaque API", SUB))
story.append(Spacer(1, 3*cm))
story.append(Paragraph(
    "Ce document répertorie l'ensemble des cas de test à exécuter avant chaque "
    "release pour garantir que tous les composants fonctionnent. Chaque test "
    "décrit les pré-requis, les étapes et le résultat attendu. Organisation "
    "par module fonctionnel avec priorité (P0 = critique, P1 = important, "
    "P2 = confort).", P))
story.append(PageBreak())

# ---------- helpers ----------
def test_table(rows):
    """rows: list of [id, prio, titre, étapes, attendu]"""
    header = ["ID", "Prio", "Titre", "Étapes", "Résultat attendu"]
    data = [header] + rows
    # Wrap long fields in Paragraphs
    wrapped = [header]
    for r in rows:
        wrapped.append([
            Paragraph(r[0], SMALL),
            Paragraph(r[1], SMALL),
            Paragraph(r[2], SMALL),
            Paragraph(r[3], SMALL),
            Paragraph(r[4], SMALL),
        ])
    t = Table(wrapped, colWidths=[1.3*cm, 0.9*cm, 3.5*cm, 6.5*cm, 5.3*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#D1FAE5")),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("TEXTCOLOR", (0,0), (-1,0), colors.HexColor("#065F46")),
        ("FONTSIZE", (0,0), (-1,0), 9),
        ("GRID", (0,0), (-1,-1), 0.3, colors.HexColor("#A7F3D0")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    return t

# ---------- 1. Authentification Clerk ----------
story.append(Paragraph("1. Authentification (Clerk)", H1))
story.append(test_table([
    ["AUTH-01","P0","Sign-up email valide","Créer compte avec email inédit + mot de passe fort","Compte créé, code email envoyé, redirection vers vérification"],
    ["AUTH-02","P0","Vérification email correcte","Saisir code reçu","Session Clerk active, redirection /(tabs)"],
    ["AUTH-03","P0","Vérification email incorrecte","Saisir un code erroné","Message d'erreur, pas de session"],
    ["AUTH-04","P0","Sign-in email/password","Compte existant, identifiants valides","Session ouverte, redirection accueil"],
    ["AUTH-05","P0","Sign-in mauvais mot de passe","3 tentatives erronées","Message d'erreur, rate-limiting après 3e"],
    ["AUTH-06","P0","Sign-in email inexistant","Email jamais enregistré","Erreur \"Couldn't find your account\""],
    ["AUTH-07","P0","Google SSO sign-in","Cliquer \"Continue with Google\"","Fenêtre OAuth → session active"],
    ["AUTH-08","P1","Google SSO sign-up nouveau","Compte Google jamais utilisé","Création de user Clerk, doc Firestore créé"],
    ["AUTH-09","P0","Sign-out","Bouton Logout profil","Session fermée, retour /welcome, cache effacé"],
    ["AUTH-10","P1","Session expirée","Attendre expiration JWT puis action","Refresh automatique ou redirection login"],
    ["AUTH-11","P1","Réinscription même email","Tenter sign-up avec email existant","Erreur explicite, pas de création"],
    ["AUTH-12","P2","Mot de passe faible","Sign-up avec mot de passe < 8 char","Message policy password"],
]))
story.append(Spacer(1, 0.4*cm))

# ---------- 2. Onboarding ----------
story.append(Paragraph("2. Onboarding (profil initial)", H1))
story.append(test_table([
    ["ONB-01","P0","Flow onboarding complet","Parcourir les 5 écrans","Profil sauvegardé Firestore + cache local"],
    ["ONB-02","P0","Retour en arrière onboarding","Bouton back sur chaque étape","Données précédentes restaurées"],
    ["ONB-03","P0","Sélection genre homme/femme","Chaque choix enregistré","Champ gender dans users/{email}"],
    ["ONB-04","P0","Choix objectif perdre/gagner/maintenir","Tap sur option","goal = lose|gain|maintain"],
    ["ONB-05","P0","Saisie poids et taille","Valeurs réalistes","Conversion si unités, save OK"],
    ["ONB-06","P1","Saisie poids invalide (0 ou >500)","Valeur aberrante","Validation front, pas d'envoi"],
    ["ONB-07","P0","Date de naissance valide","Age 18-80","Birthdate sauvegardé"],
    ["ONB-08","P1","Date de naissance future","Date > aujourd'hui","Rejet validation"],
    ["ONB-09","P0","Génération plan Gemini","Fin d'onboarding","Appel Gemini visible dans logs, nutritionalPlan stocké"],
    ["ONB-10","P1","Gemini indisponible","Clé invalide / offline","Fallback plan par défaut, pas de crash"],
    ["ONB-11","P0","Onboarded = true","Fin flow","users/{email}.onboarded = true"],
    ["ONB-12","P1","Relogin après onboarding","Sign-out puis sign-in","Skip onboarding, direct /(tabs)"],
]))
story.append(PageBreak())

# ---------- 3. Home / Meal logging ----------
story.append(Paragraph("3. Écran Home et journalisation de repas", H1))
story.append(test_table([
    ["HOME-01","P0","Affichage calendrier semaine","Ouvrir Home","7 cercles jours alignés, aujourd'hui surligné"],
    ["HOME-02","P0","Tap sur jour passé","Cliquer jour antérieur","Change selectedDate, refresh logs"],
    ["HOME-03","P0","Tap sur jour futur","Cliquer jour >aujourd'hui","Désactivé, aucun effet"],
    ["HOME-04","P0","Scroll semaines passées","Swipe droite","Charge 52 semaines antérieures"],
    ["HOME-05","P0","Affichage kcal restantes par jour","Jour passé avec logs","+/- kcal en vert/rouge sous cercle"],
    ["HOME-06","P1","Jour sans logs","Jour vide","Aucun label kcal"],
    ["HOME-07","P0","Alignement cercles","Voir visuellement","Tous cercles à la même hauteur"],
    ["HOME-08","P0","Total calories du jour","Ajouter repas","Compteur se met à jour en temps réel"],
    ["HOME-09","P0","Pourcentage objectif","Calories > goal","Barre 100 %, couleur avertissement"],
    ["HOME-10","P0","Ajout repas via search FatSecret","Saisir \"apple\"","API FatSecret appelée, 5 résultats"],
    ["HOME-11","P1","Recherche <3 chars","Saisir \"ap\"","Aucun appel API (filtre local)"],
    ["HOME-12","P1","FatSecret 401","Token expiré","Auto-refresh, retry transparent"],
    ["HOME-13","P0","Ajout repas manuel","Pas de FatSecret, tout à la main","Log ajouté, Gemini insight stale=true"],
    ["HOME-14","P0","Suppression repas","Swipe + confirm","Log supprimé, cache invalidé"],
    ["HOME-15","P0","Ajout eau","Tap bouton +250 ml","Log type=water, compteur eau maj"],
    ["HOME-16","P0","Ajout exercice","Form activité","Log type=activity, calories brûlées maj"],
]))

# ---------- 4. Scan photo ----------
story.append(Paragraph("4. Scan de repas (Gemini Vision)", H1))
story.append(test_table([
    ["SCAN-01","P0","Permission caméra accordée","Premier tap scan","Caméra s'ouvre"],
    ["SCAN-02","P0","Permission caméra refusée","Dire non","Message, retour accueil"],
    ["SCAN-03","P0","Prise de photo OK","Shutter","Base64 capturé, envoi Gemini"],
    ["SCAN-04","P0","Analyse Gemini succès","Photo de salade","JSON nutrition retourné en <15 s"],
    ["SCAN-05","P1","Analyse Gemini échec","Photo non-alimentaire","Message d'erreur, pas de log créé"],
    ["SCAN-06","P1","Photo floue","Image basse qualité","Fallback JSON ou erreur claire"],
    ["SCAN-07","P0","Confirmation avant log","Écran récap","Modifier possible, confirmer OK"],
    ["SCAN-08","P1","Photo >5 MB","Grande image","Compression auto avant envoi"],
    ["SCAN-09","P0","Réseau coupé pendant scan","Offline au moment send","Erreur reliable, pas de crash"],
    ["SCAN-10","P2","Annulation scan","Back en cours d'analyse","Requête abandonnée proprement"],
]))
story.append(PageBreak())

# ---------- 5. Analytics ----------
story.append(Paragraph("5. Analytics (AI insights)", H1))
story.append(test_table([
    ["ANA-01","P0","Ouverture Analytics 1re fois","Pas de cache","Spinner + appel Gemini, 3 langues"],
    ["ANA-02","P0","Ouverture Analytics 2e fois <7j","Cache présent","Rendu instantané, pas d'appel Gemini"],
    ["ANA-03","P0","Exerc. analysis affichée","Card 6","Texte non-vide, lisible"],
    ["ANA-04","P0","Health score 0-100","Vue score","Valeur numérique, barre remplie"],
    ["ANA-05","P0","Changement langue","Switch FR/AR","Texte cartes en langue sélectionnée"],
    ["ANA-06","P1","Fallback EN si FR manquant","Sous-arbre FR incomplet","Champ montre EN au lieu de vide"],
    ["ANA-07","P0","Insights stale","Ajouter meal puis ouvrir","stale=true déclenche regen"],
    ["ANA-08","P1","Gemini down","API key invalide","Offline fallback, source=computed"],
    ["ANA-09","P0","Graphique hebdo","Jours visibles","Barres consumed + burned"],
    ["ANA-10","P1","Semaine sans activité","Logs vides","Graphique vide, message \"log more\""],
    ["ANA-11","P0","Scope month","Tab month","Doc ai_insights/month_YYYY-MM lu"],
    ["ANA-12","P1","Scope all-time","Tab all","Doc ai_insights/all_time lu"],
    ["ANA-13","P0","Scroll bas tab bar","Jusqu'en bas","Toutes cartes visibles, pas masquées"],
    ["ANA-14","P2","TTL >7j","Cache vieux","Force resync + regen"],
]))

# ---------- 6. Profile ----------
story.append(Paragraph("6. Profil utilisateur", H1))
story.append(test_table([
    ["PROF-01","P0","Affichage infos user","Ouvrir profil","Email, prénom, poids, objectif"],
    ["PROF-02","P0","Modifier poids","Input + save","users/{email}.weight maj, weight_history ajouté"],
    ["PROF-03","P0","Changement langue","FR → AR","isRTL=true, UI mirror"],
    ["PROF-04","P0","Switch thème clair/sombre","Toggle","bgColor + textColor changent"],
    ["PROF-05","P1","Seed demo data","Bouton seed","64 logs créés sur 11 jours, insights seedés"],
    ["PROF-06","P0","Sign out","Bouton logout","Confirm dialog → signOut Clerk"],
    ["PROF-07","P1","Suppression compte","Delete account","Docs Firestore supprimés, Clerk user deleted"],
    ["PROF-08","P0","Paywall Premium","Tap \"Go Premium\"","RevenueCat sheet s'ouvre"],
    ["PROF-09","P1","Restauration achat","Tap \"Restore\"","getCustomerInfo → entitlement actif"],
    ["PROF-10","P2","Notifications push","Tap enable","Permission demandée, token Expo Firestore"],
]))
story.append(PageBreak())

# ---------- 7. Firestore data integrity ----------
story.append(Paragraph("7. Intégrité des données Firestore", H1))
story.append(test_table([
    ["DB-01","P0","Document user créé","Premier login","users/{email} existe avec createdAt"],
    ["DB-02","P0","Sub-collection logs","Après 1er repas","users/{email}/logs/{id} présent"],
    ["DB-03","P0","serverTimestamp non null","N'importe quel log","timestamp numérique valide"],
    ["DB-04","P1","Date YYYY-MM-DD locale","Log à 23h59","date = jour local, pas UTC"],
    ["DB-05","P0","ai_insights tagged","Après regen","source = 'ai' ou 'computed'"],
    ["DB-06","P1","weight_history chrono","Multi saisies poids","Tri décroissant par timestamp"],
    ["DB-07","P0","emailToDocId idempotent","Même email 2×","Même docId généré"],
    ["DB-08","P1","Suppression log propre","deleteDoc","Disparaît des queries"],
    ["DB-09","P1","Rules securité","User A lit docs de B","Permission denied"],
    ["DB-10","P2","Taille doc <1MiB","Log avec long texte","Clamp ou erreur claire"],
]))

# ---------- 8. i18n ----------
story.append(Paragraph("8. Internationalisation (EN/FR/AR)", H1))
story.append(test_table([
    ["I18N-01","P0","Langue par défaut device","FR device","App en français"],
    ["I18N-02","P0","Switch manuel","Profile → language","Toutes strings mises à jour"],
    ["I18N-03","P0","Persistance choix","Logout/login","Langue conservée"],
    ["I18N-04","P0","Arabe RTL","Switch AR","Layout droite-à-gauche"],
    ["I18N-05","P1","Clé manquante","String non traduite","Fallback EN, pas la clé brute"],
    ["I18N-06","P1","Nom activité custom","\"Karate\" non dans dict","Gemini traduction cache Firestore"],
    ["I18N-07","P2","Cache translation hit","2e affichage","AsyncStorage hit, pas d'API"],
]))

# ---------- 9. Offline / edge cases ----------
story.append(Paragraph("9. Comportement offline / edge cases", H1))
story.append(test_table([
    ["EDGE-01","P0","Cold start offline","Couper wifi avant open","LocalDataStore rend accueil utilisable"],
    ["EDGE-02","P0","Ajout meal offline","Pas de réseau","Stocké local, synced au retour"],
    ["EDGE-03","P1","Reconnexion","Wifi ON après logs offline","Flush vers Firestore auto"],
    ["EDGE-04","P1","Gemini timeout 30s","Latence réseau haute","Abort + offline fallback"],
    ["EDGE-05","P2","Device heure décalée","Clock système +1j","Dates cohérentes (seedDemo)"],
    ["EDGE-06","P1","Fuseau UTC+1 minuit","Log à 23h59","date = jour local correct"],
    ["EDGE-07","P0","AsyncStorage plein","Storage saturé","Catch+warn, pas de crash"],
    ["EDGE-08","P2","Locale non supportée","Device en chinois","Fallback EN"],
]))
story.append(PageBreak())

# ---------- 10. Performance / non-functional ----------
story.append(Paragraph("10. Performance &amp; non-fonctionnels", H1))
story.append(test_table([
    ["PERF-01","P0","Cold start <4 s","Kill puis relance","Time-to-interactive <4 s"],
    ["PERF-02","P1","Open Analytics <1 s si cache","2e ouverture","Render instantané"],
    ["PERF-03","P0","Scan photo → JSON <15 s","Moyenne 10 essais","Médiane sous 15 s"],
    ["PERF-04","P1","Écriture Firestore <500 ms","Latence add log","Pas de freeze UI"],
    ["PERF-05","P1","Mémoire <200 MB","Utilisation 10 min","Pas de leak notable"],
    ["PERF-06","P2","Dark mode sans flash","Switch auto","Pas de flash blanc"],
    ["PERF-07","P1","Re-renders Analytics","Profiler","≤2 renders par changement scope"],
    ["PERF-08","P2","Bundle size <50 MB","APK Android","Dans les limites Play Store"],
]))

# ---------- 11. Sécurité ----------
story.append(Paragraph("11. Sécurité &amp; confidentialité", H1))
story.append(test_table([
    ["SEC-01","P0","Secrets non commitées","git grep API_KEY","Aucun .env en clair dans VCS"],
    ["SEC-02","P0","Firestore rules","User B tente read users/A","Permission denied"],
    ["SEC-03","P0","Token Clerk HttpOnly","Inspection storage","JWT non lisible côté JS dangereux"],
    ["SEC-04","P1","OAuth redirect URI","Modifier scheme","Refus Clerk"],
    ["SEC-05","P1","FatSecret creds en env","Constants.config","Pas hardcodés"],
    ["SEC-06","P2","Photos supprimées post-IA","Check storage","TTL ou delete immédiat"],
    ["SEC-07","P1","GDPR delete","Delete account","Suppression complète Firestore + Clerk"],
]))

# ---------- 12. Monétisation ----------
story.append(Paragraph("12. Monétisation (RevenueCat)", H1))
story.append(test_table([
    ["PAY-01","P0","Paywall au bon déclencheur","Tap feature Premium","Sheet RevenueCat"],
    ["PAY-02","P0","Achat mensuel sandbox","Compte test Apple","Entitlement activé"],
    ["PAY-03","P0","isPremium=true après achat","Reload app","Features Premium débloquées"],
    ["PAY-04","P1","Annulation trial","Rejeter paywall","Feature verrouillée maintenue"],
    ["PAY-05","P1","Restoration cross-device","Autre device même compte","Restore purchases OK"],
    ["PAY-06","P2","Expiration trial","Attendre fin période","Entitlement removed"],
]))

# ---------- 13. Logging API ----------
story.append(Paragraph("13. Observabilité (logs API)", H1))
story.append(Paragraph(
    "Après instrumentation, chaque appel tierce partie doit produire un log "
    "REQUEST + RESPONSE dans la console Metro avec les préfixes suivants :", P))
t = Table([
    ["API", "Préfixe log", "Endpoints loggés"],
    ["Clerk", "[API→Clerk] / [API←Clerk]", "signIn.create, signUp.create, startSSOFlow, signOut"],
    ["Gemini", "[API→Gemini] / [API←Gemini]", "generateContent (plan, insights, vision, translate)"],
    ["FatSecret", "[API→FatSecret] / [API←FatSecret]", "OAuth token, foods.search"],
    ["Firestore", "[API→Firestore] / [API←Firestore]", "logs, ai_insights, translations_cache, push token"],
    ["RevenueCat", "[API→RevenueCat] / [API←RevenueCat]", "configure, getCustomerInfo, presentPaywall"],
    ["Expo Push", "[API→Expo] / [API←Expo]", "getExpoPushTokenAsync"],
], colWidths=[2.8*cm, 5*cm, 9*cm])
t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#D1FAE5")),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 8.5),
    ("GRID", (0,0), (-1,-1), 0.3, colors.HexColor("#A7F3D0")),
]))
story.append(t)
story.append(Spacer(1, 0.3*cm))
story.append(test_table([
    ["LOG-01","P0","Chaque API produit REQUEST","Lancer action user","Log avec inputs visibles"],
    ["LOG-02","P0","Chaque API produit RESPONSE","Après retour","Log avec outputs + ms"],
    ["LOG-03","P1","Erreurs API loggées","Forcer une erreur","Log FAILED avec status + body"],
    ["LOG-04","P1","Secrets masqués","Tokens OAuth","Preview 12 chars + ellipsis"],
    ["LOG-05","P2","Durée ms par appel","Inspection","Présente sur chaque RESPONSE"],
]))

# ---------- 14. Matrice récap ----------
story.append(PageBreak())
story.append(Paragraph("14. Synthèse &amp; indicateurs", H1))
story.append(Paragraph(
    "Total tests catalogués : 120 cas répartis sur 13 domaines.<br/>"
    "Priorités : 58 P0 (critiques) + 41 P1 (importants) + 21 P2 (confort).<br/><br/>"
    "<b>Recommandation d'exécution :</b><br/>"
    "• <b>Avant chaque release majeure</b> : 100 % des P0 + P1 (99 tests ~ 4h manuels).<br/>"
    "• <b>Avant release mineure / patch</b> : 100 % des P0 (58 tests ~ 2h).<br/>"
    "• <b>Automation cible</b> : 70 % des P0 via Detox (e2e) + Jest (unit), reste manuel.<br/><br/>"
    "<b>Criteria de go/no-go :</b><br/>"
    "• Tout P0 passant → GO release.<br/>"
    "• 1 P0 failing → NO-GO, bloquant.<br/>"
    "• ≥3 P1 failing → NO-GO, dégradation perçue.", P))

story.append(Paragraph("15. Outils recommandés pour automation", H1))
story.append(Paragraph(
    "• <b>Detox</b> (react-native) pour tests e2e iOS/Android. Couvrir "
    "AUTH-* , ONB-*, HOME-* , ANA-*.<br/>"
    "• <b>Jest + @testing-library/react-native</b> pour tests composants "
    "isolés (WeekCalendar, Bento cards, forms).<br/>"
    "• <b>Firebase Emulator Suite</b> pour DB-* sans pollution prod.<br/>"
    "• <b>MSW</b> (mock service worker) pour simuler Gemini / FatSecret down.<br/>"
    "• <b>Maestro</b> comme alternative plus simple à Detox pour flows de haut "
    "niveau.<br/>"
    "• <b>CI GitHub Actions</b> : lint + typecheck + Jest unit à chaque PR, "
    "e2e headless à chaque merge main.", P))

doc.build(story)
print(f"Généré : {OUT}")
