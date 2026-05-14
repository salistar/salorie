# -*- coding: utf-8 -*-
"""
Business Plan Salorie + etude concurrentielle
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    ListFlowable, ListItem
)

PRIMARY = colors.HexColor('#298f50')
PRIMARY_DARK = colors.HexColor('#0f3a22')
PRIMARY_LIGHT = colors.HexColor('#e8f5ee')
GRAY = colors.HexColor('#6b7280')
GRAY_LIGHT = colors.HexColor('#f3f4f6')
AMBER = colors.HexColor('#f59e0b')
AMBER_LIGHT = colors.HexColor('#fef3c7')
RED_LIGHT = colors.HexColor('#fee2e2')

OUTPUT = r"C:\Users\21266\Desktop\sdk52\salorie\salorie\rapports\SALORIE_BUSINESS_PLAN.pdf"

styles = getSampleStyleSheet()

def mk(name, **kw):
    base = kw.pop('parent', styles['Normal'])
    return ParagraphStyle(name, parent=base, **kw)

S_TITLE = mk('T', fontSize=26, textColor=PRIMARY_DARK, alignment=TA_CENTER,
             spaceAfter=12, fontName='Helvetica-Bold', leading=30)
S_SUB = mk('Sb', fontSize=13, textColor=GRAY, alignment=TA_CENTER, spaceAfter=20)
S_H1 = mk('H1', fontSize=18, textColor=colors.white, fontName='Helvetica-Bold',
          backColor=PRIMARY, borderPadding=8, spaceBefore=16, spaceAfter=10, leading=22)
S_H2 = mk('H2', fontSize=14, textColor=PRIMARY_DARK, fontName='Helvetica-Bold',
          spaceBefore=12, spaceAfter=6, leading=18)
S_H3 = mk('H3', fontSize=11.5, textColor=PRIMARY, fontName='Helvetica-Bold',
          spaceBefore=8, spaceAfter=4)
S_BODY = mk('B', fontSize=10, textColor=colors.HexColor('#1f2937'),
            alignment=TA_JUSTIFY, leading=14, spaceAfter=6)
S_BULLET = mk('Bu', fontSize=10, textColor=colors.HexColor('#1f2937'),
              leading=13, leftIndent=14, spaceAfter=3)
S_NOTE = mk('N', fontSize=9, textColor=GRAY, alignment=TA_CENTER)

def page_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(GRAY)
    canvas.drawString(2*cm, 1*cm, "Salorie - Business Plan et etude concurrentielle")
    canvas.drawRightString(A4[0] - 2*cm, 1*cm, f"Page {doc.page}")
    canvas.setStrokeColor(PRIMARY_LIGHT)
    canvas.line(2*cm, 1.3*cm, A4[0] - 2*cm, 1.3*cm)
    canvas.restoreState()

def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(x, S_BULLET), leftIndent=10, value='circle') for x in items],
        bulletType='bullet', leftIndent=10
    )

def tbl(rows, col_widths=None, header_bg=PRIMARY):
    data = [[Paragraph(f"<b>{c}</b>", mk('th', fontSize=9.5, textColor=colors.white, fontName='Helvetica-Bold', leading=12))
             for c in rows[0]]]
    for r in rows[1:]:
        data.append([Paragraph(str(c), mk('td', fontSize=9, leading=12)) for c in r])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), header_bg),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, GRAY_LIGHT]),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#d1d5db')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return t

# ========== DOCUMENT ==========
doc = SimpleDocTemplate(OUTPUT, pagesize=A4,
                        leftMargin=2*cm, rightMargin=2*cm,
                        topMargin=2*cm, bottomMargin=2*cm)
story = []

# COVER
story.append(Spacer(1, 4*cm))
story.append(Paragraph("SALORIE", S_TITLE))
story.append(Paragraph("Business Plan et etude concurrentielle", S_SUB))
story.append(Spacer(1, 0.5*cm))
story.append(Paragraph(
    "Analyse strategique du marche de la nutrition mobile au Maroc et en region MENA. "
    "Positionnement, modele economique, concurrents, projections financieres et plan de "
    "go-to-market pour l'application mobile Salorie.", S_BODY))
story.append(Spacer(1, 2*cm))

info = Table([
    ['Projet', 'Salorie - AI Nutrition Tracker'],
    ['Marche cible', 'Maroc + MENA + diaspora maghrebine'],
    ['Modele', 'Freemium SaaS + marketplace B2B2C'],
    ['Stade actuel', 'MVP production-ready (v1.0)'],
    ['Date', 'Avril 2026'],
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

# ========== EXECUTIVE SUMMARY ==========
story.append(Paragraph("Resume executif", S_H1))
story.append(Paragraph(
    "<b>Salorie</b> est une application mobile de suivi nutritionnel propulsee par l'IA "
    "(Gemini 2.5 Flash) ciblant specifiquement le marche marocain et la region MENA. "
    "Contrairement aux acteurs internationaux (MyFitnessPal, Lifesum, Yazio, Cal AI) qui "
    "traitent le Maroc comme un marche secondaire, Salorie est concue nativement pour la "
    "culture alimentaire locale : plats marocains, mode Ramadan, filtre Halal, support "
    "darija (vocal et texte), prix en dirhams.", S_BODY))

story.append(Paragraph("Opportunite de marche", S_H2))
story.append(bullets([
    "<b>Taille du marche Maroc</b> : 25M smartphones actifs (2025), 65% penetration. Segment sante/fitness apps : ~3.5M telechargements/an en croissance 18%/an.",
    "<b>MENA</b> : 450M habitants, 250M smartphones, marche nutrition apps sous-exploite (95% d'apps US/EU).",
    "<b>Diaspora maghrebine</b> : 5M+ au sein de l'UE (France, Belgique, Espagne, Pays-Bas), forte demande pour contenu culturellement adapte.",
    "<b>Ramadan</b> : 1.8 milliard de musulmans dans le monde, periode de forte intentionnalite nutritionnelle. Aucune app internationale n'adresse serieusement ce moment cle.",
]))

story.append(Paragraph("Proposition de valeur", S_H2))
story.append(Paragraph(
    "<b>L'application nutrition conque par et pour le monde arabe.</b> Salorie est la seule "
    "app qui comprend que 'khobz' est different de 'bread', que le tajine familial se partage "
    "entre 6 personnes, que Ramadan requiert une redistribution complete des calories, et "
    "que parler darija a son coach nutritionnel est plus naturel que taper en anglais.", S_BODY))

story.append(Paragraph("Chiffres cibles a 24 mois", S_H2))
rows = [
    ["Metrique", "M6", "M12", "M18", "M24"],
    ["Utilisateurs inscrits", "15k", "75k", "200k", "500k"],
    ["DAU (Daily Active Users)", "3k", "18k", "55k", "150k"],
    ["Abonnes premium", "300", "3k", "12k", "40k"],
    ["MRR (Monthly Recurring Revenue)", "15k MAD", "150k MAD", "600k MAD", "2.0M MAD"],
    ["ARR (Annual Recurring Revenue)", "-", "1.8M MAD", "7.2M MAD", "24M MAD"],
]
story.append(tbl(rows, col_widths=[5.5*cm, 2.8*cm, 2.8*cm, 2.8*cm, 2.8*cm]))
story.append(PageBreak())

# ========== 1. MARCHE ==========
story.append(Paragraph("1. Analyse de marche", S_H1))

story.append(Paragraph("1.1 TAM / SAM / SOM", S_H2))
story.append(Paragraph(
    "<b>TAM (Total Addressable Market)</b> : marche mondial des apps de nutrition / fitness "
    "= 15 milliards USD en 2025, croissance attendue 14.5% CAGR jusqu'en 2030.", S_BODY))
story.append(Paragraph(
    "<b>SAM (Serviceable Addressable Market)</b> : users mobiles MENA interessse par tracking "
    "nutrition = 450M habitants x 55% smartphone x 8% segment interesse = <b>~20M users</b>. "
    "Revenu moyen par utilisateur premium ~5 USD/mois = <b>1.2 milliards USD/an</b>.", S_BODY))
story.append(Paragraph(
    "<b>SOM (Serviceable Obtainable Market)</b> a 3 ans : <b>500k users Maroc + 200k autres MENA + 100k diaspora</b>. "
    "Avec 8% de conversion premium = 64k payants x 40 MAD/mois = <b>~31M MAD/an (~3M USD)</b>.", S_BODY))

story.append(Paragraph("1.2 Segmentation utilisateur", S_H2))
rows = [
    ["Segment", "Taille Maroc", "Motivation", "Willingness to pay"],
    ["Jeunes actifs 22-35 ans, urbains, classe moyenne+", "1.8M", "Perte de poids, esthetique, fitness", "Tres elevee"],
    ["Femmes 25-45 ans post-grossesse", "600k", "Perte poids, sante bebe/famille", "Elevee"],
    ["Pratiquants musculation / gym", "400k", "Prise de masse, prep competition", "Tres elevee"],
    ["Diabetiques type 2 / pre-diabete", "1.5M", "Controle glycemie, sante", "Moyenne-elevee"],
    ["Pratiquants Ramadan strict", "8M actifs", "Gestion Suhoor/Iftar, sante", "Moyenne"],
    ["Diaspora marocaine en EU", "5M+", "Cuisine familiale + tracking occidental", "Elevee"],
    ["Entreprises (B2B wellness)", "100k salaries cibles", "Productivite, assurance sante", "Contrats 10-50k MAD"],
]
story.append(tbl(rows, col_widths=[4.5*cm, 2.3*cm, 4.5*cm, 3*cm]))

story.append(PageBreak())

# ========== 2. CONCURRENCE ==========
story.append(Paragraph("2. Etude concurrentielle", S_H1))

story.append(Paragraph("2.1 Concurrents internationaux", S_H2))
rows = [
    ["App", "Users", "Prix", "Forces", "Faiblesses pour Maroc/MENA"],
    ["MyFitnessPal (Under Armour)",
     "200M+",
     "9.99 USD/mois",
     "Base 14M aliments, communaute, integration wearables, brand leader",
     "Aucun plat marocain, pas de Ramadan mode, UI en anglais domine, prix USD prohibitif"],
    ["Lifesum (Suede)",
     "50M+",
     "39.99 EUR/an",
     "UI tres polie, meal planner, diets specialises (keto/5:2)",
     "Pas de contenu arabe, pas de recettes MENA, pas de bot/voice darija"],
    ["Yazio (Allemagne)",
     "60M+",
     "3 EUR/mois",
     "Jeune intermittent excellent, plans personnalises",
     "Catalogue aliments euro-centric, pas d'integration marche local"],
    ["Cal AI (YC 2024)",
     "10M+",
     "9.99 USD/mois",
     "Photo scan IA excellent, onboarding viral (TikTok)",
     "Focus US uniquement, scan IA faible sur plats MENA, pas d'arabe"],
    ["Cronometer",
     "6M+",
     "44.99 USD/an",
     "Micronutriments precis, utilise par medecins/nutritionnistes",
     "UI datee, complexe, 100% anglais, pas de communaute"],
    ["Noom",
     "50M+",
     "60 USD/mois",
     "Psychologie comportementale, coaching humain",
     "Tres cher, 100% anglais, pas d'orientation culturelle MENA"],
    ["FatSecret",
     "20M+",
     "Gratuit + API",
     "Base alimentaire massive, API publique",
     "UI basique, pas d'IA, pas de social, pas de contenu local"],
    ["Simple (YC)",
     "10M+",
     "40 USD/mois",
     "Fasting + IA coach, UX moderne",
     "Focus intermittent fasting uniquement, ignore Ramadan"],
]
story.append(tbl(rows, col_widths=[3*cm, 1.5*cm, 2*cm, 4.3*cm, 6*cm]))

story.append(PageBreak())

story.append(Paragraph("2.2 Concurrents regionaux / MENA", S_H2))
rows = [
    ["App", "Marche", "Users estimes", "Forces", "Limitations"],
    ["Nutrino (Israel)", "Israel + US", "~2M", "IA predictive glycemie", "Pas arabe, focus diabetique"],
    ["FitLine Arabic", "Egypte, KSA", "~500k", "Interface arabe, communaute", "UI datee, peu d'IA, pas darija"],
    ["Rujum (KSA)", "Arabie Saoudite", "~1M", "Halal focus, Ramadan basique", "Pas disponible Maroc, pas darija"],
    ["Weyyak / Healthi (UAE)", "Emirats", "~200k", "Dashboard corporate wellness", "Pay B2B only, pas grand public"],
    ["Dietmaster (Egypte)", "Egypte", "~800k", "Meal plans egyptiens", "Qualite IA faible, pas Maroc"],
    ["Hayat (local MA)", "Maroc", "<50k", "Tentative locale", "App inachevee, pas d'IA"],
]
story.append(tbl(rows, col_widths=[3*cm, 3*cm, 2.5*cm, 4*cm, 4.3*cm]))

story.append(Paragraph("2.3 Analyse SWOT Salorie vs concurrents", S_H2))

swot_data = [
    ["STRENGTHS", "WEAKNESSES"],
    [
        "Premier sur marche Maroc avec contenu natif<br/>"
        "IA Gemini 2.5 Flash + Claude (coach) + Whisper (voice)<br/>"
        "Support darija unique au monde<br/>"
        "Mode Ramadan natif<br/>"
        "Stack technique moderne (Expo SDK 52, Firebase)<br/>"
        "Coherence ecosysteme SALISTAR (SSO, B2B)<br/>"
        "Equipe locale comprenant la culture",
        "Marque inconnue face a MyFitnessPal<br/>"
        "Base alimentaire a construire (3000+ plats MA)<br/>"
        "Pas encore de marketing budget<br/>"
        "Pas de communaute etablie<br/>"
        "Dependance API externes (Gemini, Clerk, FatSecret)<br/>"
        "Marche Maroc petit (25M smartphones)<br/>"
        "ARPU limite par pouvoir d'achat local"
    ],
    ["OPPORTUNITIES", "THREATS"],
    [
        "Marche MENA sous-exploite (95% apps US/EU)<br/>"
        "Ramadan = event marketing annuel naturel<br/>"
        "Diaspora EU (5M) avec pouvoir achat EU<br/>"
        "Partenariats mutuelles sante marocaines<br/>"
        "B2B wellness corporate (nouvelle loi sante)<br/>"
        "Nutritionnistes marketplace (20% commission)<br/>"
        "TikTok comme canal d'acquisition viral<br/>"
        "IA generative baisse couts 10x tous les 2 ans",
        "Entree possible de MyFitnessPal/Cal AI en arabe<br/>"
        "Consolidation apps sante (rachats)<br/>"
        "Dependance cle Google (Gemini peut devenir payant)<br/>"
        "Regulation donnees sante (RGPD, CNDP MA)<br/>"
        "Piratage des abonnements<br/>"
        "Conjoncture eco MA impacte willingness to pay<br/>"
        "Apple/Google augmentation commissions 30%"
    ],
]
swot_table = Table(swot_data, colWidths=[8*cm, 8*cm])
swot_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (0, 0), PRIMARY),
    ('BACKGROUND', (1, 0), (1, 0), AMBER),
    ('BACKGROUND', (0, 2), (0, 2), colors.HexColor('#3b82f6')),
    ('BACKGROUND', (1, 2), (1, 2), colors.HexColor('#ef4444')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('TEXTCOLOR', (0, 2), (-1, 2), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTNAME', (0, 2), (-1, 2), 'Helvetica-Bold'),
    ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
    ('ALIGN', (0, 2), (-1, 2), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('GRID', (0, 0), (-1, -1), 0.5, GRAY),
    ('FONTSIZE', (0, 1), (-1, 1), 9),
    ('FONTSIZE', (0, 3), (-1, 3), 9),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ('BACKGROUND', (0, 1), (0, 1), PRIMARY_LIGHT),
    ('BACKGROUND', (1, 1), (1, 1), AMBER_LIGHT),
    ('BACKGROUND', (0, 3), (0, 3), colors.HexColor('#dbeafe')),
    ('BACKGROUND', (1, 3), (1, 3), RED_LIGHT),
]))
# Fix: use Paragraph cells for HTML-like formatting
swot_rows = [
    [Paragraph("<b>STRENGTHS</b>", mk('h', textColor=colors.white, alignment=TA_CENTER, fontSize=12, fontName='Helvetica-Bold')),
     Paragraph("<b>WEAKNESSES</b>", mk('h', textColor=colors.white, alignment=TA_CENTER, fontSize=12, fontName='Helvetica-Bold'))],
    [Paragraph("Premier sur marche Maroc avec contenu natif.<br/>"
               "IA Gemini 2.5 Flash + Claude (coach) + Whisper (voice).<br/>"
               "Support darija unique au monde.<br/>"
               "Mode Ramadan natif.<br/>"
               "Stack technique moderne (Expo SDK 52, Firebase).<br/>"
               "Coherence ecosysteme SALISTAR (SSO, B2B).<br/>"
               "Equipe locale comprenant la culture.", mk('s', fontSize=9, leading=12)),
     Paragraph("Marque inconnue face a MyFitnessPal.<br/>"
               "Base alimentaire a construire (3000+ plats MA).<br/>"
               "Pas de marketing budget initial.<br/>"
               "Pas de communaute etablie.<br/>"
               "Dependance API externes (Gemini, Clerk).<br/>"
               "Marche Maroc petit (25M smartphones).<br/>"
               "ARPU limite par pouvoir d'achat local.", mk('s', fontSize=9, leading=12))],
    [Paragraph("<b>OPPORTUNITIES</b>", mk('h', textColor=colors.white, alignment=TA_CENTER, fontSize=12, fontName='Helvetica-Bold')),
     Paragraph("<b>THREATS</b>", mk('h', textColor=colors.white, alignment=TA_CENTER, fontSize=12, fontName='Helvetica-Bold'))],
    [Paragraph("Marche MENA sous-exploite (95% apps US/EU).<br/>"
               "Ramadan = event marketing annuel naturel.<br/>"
               "Diaspora EU (5M+) avec pouvoir achat EU.<br/>"
               "Partenariats mutuelles sante marocaines.<br/>"
               "B2B wellness corporate (nouvelle loi sante).<br/>"
               "Marketplace nutritionnistes (20% commission).<br/>"
               "TikTok comme canal acquisition viral.<br/>"
               "IA generative baisse couts 10x tous les 2 ans.", mk('s', fontSize=9, leading=12)),
     Paragraph("Entree possible de MyFitnessPal/Cal AI en arabe.<br/>"
               "Consolidation apps sante (rachats).<br/>"
               "Dependance cle Google (Gemini peut devenir payant).<br/>"
               "Regulation donnees sante (RGPD, CNDP MA).<br/>"
               "Piratage des abonnements.<br/>"
               "Conjoncture eco MA impacte willingness to pay.<br/>"
               "Apple/Google commissions 30%.", mk('s', fontSize=9, leading=12))],
]
swot_table2 = Table(swot_rows, colWidths=[8*cm, 8*cm])
swot_table2.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (0, 0), PRIMARY),
    ('BACKGROUND', (1, 0), (1, 0), AMBER),
    ('BACKGROUND', (0, 2), (0, 2), colors.HexColor('#3b82f6')),
    ('BACKGROUND', (1, 2), (1, 2), colors.HexColor('#ef4444')),
    ('BACKGROUND', (0, 1), (0, 1), PRIMARY_LIGHT),
    ('BACKGROUND', (1, 1), (1, 1), AMBER_LIGHT),
    ('BACKGROUND', (0, 3), (0, 3), colors.HexColor('#dbeafe')),
    ('BACKGROUND', (1, 3), (1, 3), RED_LIGHT),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('GRID', (0, 0), (-1, -1), 0.5, GRAY),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
]))
story.append(swot_table2)

story.append(PageBreak())

# ========== 3. POSITIONNEMENT ==========
story.append(Paragraph("3. Positionnement et differenciation", S_H1))

story.append(Paragraph("3.1 Message de positionnement", S_H2))
story.append(Paragraph(
    "<i>\"Salorie est l'application nutrition qui parle ta langue, connait ta cuisine et "
    "s'adapte a ton Ramadan.\"</i>", mk('quote', fontSize=12, textColor=PRIMARY_DARK,
    fontName='Helvetica-Oblique', alignment=TA_CENTER, backColor=PRIMARY_LIGHT,
    borderPadding=12, leading=18, spaceAfter=10)))

story.append(Paragraph("3.2 Differenciateurs cles (les 7 moats)", S_H2))
story.append(bullets([
    "<b>1. Base alimentaire marocaine verifiee</b> : 3000+ plats valides par une dieteticienne diplomee DtN Maroc. Aucun concurrent n'a ca. Barrier to entry forte (effort d'annotation).",
    "<b>2. Darija voice input</b> : brevetable ou non, mais premier au monde a ecouter et comprendre 'klit kesksu bel djaj lyoum'.",
    "<b>3. Mode Ramadan profond</b> : plus qu'une redistribution de calories, un vrai accompagnement spirituel et nutritionnel (priere times, recettes traditionnelles, Suhoor/Iftar optimization).",
    "<b>4. Bot WhatsApp Twilio</b> : la majorite des Marocains utilisent WhatsApp plus que n'importe quelle app. Log de nourriture via WhatsApp = hack d'adoption unique.",
    "<b>5. Filtre Halal auto</b> : confiance instantanee pour 99% des utilisateurs cibles.",
    "<b>6. Prix en dirhams</b> : 40 MAD/mois vs 100 MAD (MyFitnessPal a 9.99 USD). Accessibilite superieure.",
    "<b>7. Ecosysteme SALISTAR</b> : SSO avec autres produits (SallyRecruit pour wellness corporate, SallyLLM pour coach avance). Cross-sell B2B.",
]))

story.append(Paragraph("3.3 Matrice de positionnement", S_H2))
story.append(Paragraph(
    "Axes : <b>Localisation culturelle</b> (horizontal) x <b>Sophistication IA</b> (vertical).", S_BODY))
story.append(Spacer(1, 0.3*cm))

matrix = [
    ["", "IA basique", "IA moyenne", "IA avancee"],
    ["Global / US-centric", "FatSecret", "MyFitnessPal, Lifesum", "Cal AI, Noom"],
    ["Multi-culturel partiel", "Yazio", "FitLine Arabic", "-"],
    ["Natif MENA / arabe", "Hayat", "Rujum (KSA)", "<b>SALORIE</b>"],
]
story.append(tbl(matrix, col_widths=[4*cm, 4*cm, 4*cm, 4*cm]))

story.append(Spacer(1, 0.3*cm))
story.append(Paragraph(
    "Salorie occupe seul le quadrant <b>'Natif MENA + IA avancee'</b>. "
    "Aucun concurrent ne combine IA de dernier cri (Gemini 2.5 Flash, Claude, Whisper) "
    "avec une comprehension profonde de la culture alimentaire marocaine et musulmane.", S_BODY))

story.append(PageBreak())

# ========== 4. MODELE ECONOMIQUE ==========
story.append(Paragraph("4. Modele economique", S_H1))

story.append(Paragraph("4.1 Sources de revenus", S_H2))
rows = [
    ["Source", "Description", "Prix", "% revenus M24"],
    ["Freemium B2C", "Abonnement premium individuel", "40 MAD/mois ou 350 MAD/an", "65%"],
    ["Free trial", "7 jours gratuits puis 40 MAD/mois", "Conversion cible 8%", "(inclus B2C)"],
    ["Lifetime deal (launch)", "Promo lancement pour early adopters", "999 MAD a vie (1000 premieres)", "(ponctuel)"],
    ["Marketplace nutritionnistes", "Commission sur consultations bookees", "20% de 200-500 MAD/session", "15%"],
    ["B2B Wellness corporate", "Licence entreprise pour salaries", "30-60 MAD/salarie/mois", "15%"],
    ["Partenariats marques", "Sponsored content / Data insights (GDPR)", "Variable", "3%"],
    ["API FatSecret-like", "Revente de la base plats marocains a tiers", "500-2000 USD/mois", "2%"],
]
story.append(tbl(rows, col_widths=[4*cm, 5.5*cm, 3.5*cm, 2.5*cm]))

story.append(Paragraph("4.2 Unit economics (scenario cible M12)", S_H2))
rows = [
    ["Metrique", "Valeur", "Benchmark industrie"],
    ["CAC (Customer Acquisition Cost)", "25 MAD", "~2-5 USD SaaS B2C"],
    ["ARPU free user", "0.5 MAD/mois (ads futur)", "0.1-1 USD"],
    ["ARPU premium user", "40 MAD/mois", "5-10 USD"],
    ["LTV premium (churn 6%/mois)", "~665 MAD (17 mois avg)", "3x CAC min OK"],
    ["LTV / CAC ratio", "26x", "Excellent (>3 = sain)"],
    ["Gross margin (cout API + cloud)", "~72%", "SaaS typique 70-85%"],
    ["Payback period", "< 1 mois", "Excellent"],
    ["Churn mensuel premium", "6% cible (vs 10% industrie)", "Bien"],
]
story.append(tbl(rows, col_widths=[6*cm, 4.5*cm, 5*cm]))

story.append(Paragraph("4.3 Structure de couts", S_H2))
rows = [
    ["Categorie", "Cout mensuel M6", "Cout mensuel M24"],
    ["Cloud Firebase (Firestore + Functions)", "500 MAD", "15k MAD"],
    ["Gemini API (Google)", "1k MAD", "25k MAD"],
    ["Claude API (coach)", "300 MAD", "10k MAD"],
    ["OpenAI Whisper (voice)", "200 MAD", "5k MAD"],
    ["FatSecret API tier", "Gratuit", "1k MAD"],
    ["Clerk Auth", "0 MAD (<10k MAU free)", "3k MAD"],
    ["RevenueCat", "0 MAD (<2.5k MTR free)", "5k MAD"],
    ["Twilio WhatsApp", "500 MAD", "15k MAD"],
    ["Equipe tech (2-5 devs)", "60k MAD", "180k MAD"],
    ["Marketing / acquisition", "10k MAD", "150k MAD"],
    ["Operations + support", "5k MAD", "30k MAD"],
    ["Legal / compta", "3k MAD", "8k MAD"],
    ["<b>Total mensuel</b>", "<b>~80k MAD</b>", "<b>~450k MAD</b>"],
]
story.append(tbl(rows, col_widths=[7.5*cm, 4*cm, 4*cm]))

story.append(PageBreak())

# ========== 5. GO-TO-MARKET ==========
story.append(Paragraph("5. Go-to-market", S_H1))

story.append(Paragraph("5.1 Phase 1 : Lancement soft (M0-M3)", S_H2))
story.append(bullets([
    "Beta fermee 500 testeurs via groupes Facebook fitness Maroc (Casablanca, Rabat gym communities).",
    "Partenariat avec 3-5 coachs fitness Instagram marocains (5k-50k followers) : code promo premium gratuit 3 mois contre content creation.",
    "Release sur Play Store + App Store en FR/AR/EN/darija simultanement.",
    "Post Product Hunt en anglais (mettre en avant 'darija voice' comme hook).",
    "Article Medium/Dev.to sur la stack technique (Expo + Gemini) pour l'acquisition devs.",
]))

story.append(Paragraph("5.2 Phase 2 : Ramadan activation (M3-M5)", S_H2))
story.append(bullets([
    "<b>Grande campagne pre-Ramadan</b> (2 semaines avant) : TikTok ads en darija/arabe ciblant Maroc + diaspora.",
    "Lifetime deal 'Pack Ramadan' 499 MAD (au lieu de 999) limite aux 1000 premiers.",
    "Partenariats influenceurs religieux/lifestyle (Dounia Batma, fitness coachs locaux) : contenu quotidien pendant Ramadan.",
    "PR Maroc : articles Le Matin, Hespress, Yabiladi, Welovebuzz sur 'la premiere app nutrition marocaine'.",
    "Reminders Suhoor/Iftar envoyes meme aux non-users via WhatsApp (freemium hook).",
    "Objectif : <b>50k downloads + 3k premium</b> pendant Ramadan.",
]))

story.append(Paragraph("5.3 Phase 3 : Retention et viralite (M5-M12)", S_H2))
story.append(bullets([
    "Referral program : 1 mois premium gratuit par ami qui s'abonne, partage via WhatsApp natif.",
    "Content SEO FR/AR : blog 'Salorie Recettes' avec 200+ articles recettes marocaines + infos nutrition.",
    "TikTok content viral : scan IA de plats marocains (effet wow + pedagogique).",
    "Partenariat YouTube : 10 chaines fitness/cuisine MA avec placement produit.",
    "Integration avec 2-3 clubs fitness premium (Fitness Park, Basic Fit Maroc).",
]))

story.append(Paragraph("5.4 Phase 4 : Expansion regionale et B2B (M12+)", S_H2))
story.append(bullets([
    "Lancement Algerie, Tunisie (memes patterns culturels, cout d'expansion faible).",
    "Lancement UAE, KSA en arabe classique (marche high-ARPU).",
    "B2B : sales direct a 20 grandes entreprises marocaines (OCP, Maroc Telecom, BMCE, Attijariwafa, Lafarge...) pour wellness programs.",
    "Marketplace nutritionnistes : recrutement 50 pro pour cover Maroc urbain.",
    "Partenariats mutuelles sante (Saham, Axa, AtlantaSanad) : app offerte aux assures.",
]))

story.append(PageBreak())

# ========== 6. PROJECTIONS ==========
story.append(Paragraph("6. Projections financieres", S_H1))

story.append(Paragraph("6.1 Scenario conservateur (base case)", S_H2))
rows = [
    ["", "M6", "M12", "M18", "M24", "M36"],
    ["Users cumules", "15k", "75k", "200k", "500k", "1.2M"],
    ["DAU", "2.2k", "15k", "45k", "125k", "350k"],
    ["Free -> Premium %", "2%", "4%", "6%", "8%", "10%"],
    ["Premium abonnes", "300", "3k", "12k", "40k", "120k"],
    ["MRR (kMAD)", "12", "120", "480", "1 600", "4 800"],
    ["ARR (MMAD)", "0.15", "1.4", "5.8", "19.2", "57.6"],
    ["Revenus annexes (B2B+marketplace, MMAD/an)", "0", "0.3", "1.5", "6", "20"],
    ["Revenus totaux annee (MMAD)", "-", "1.7", "7.3", "25.2", "77.6"],
    ["Couts totaux annee (MMAD)", "1.0", "3.5", "10", "28", "55"],
    ["<b>EBITDA (MMAD)</b>", "<b>-1.0</b>", "<b>-1.8</b>", "<b>-2.7</b>", "<b>-2.8</b>", "<b>+22.6</b>"],
    ["Break-even", "", "", "", "~M28-30", "Atteint"],
]
story.append(tbl(rows, col_widths=[5.5*cm, 2*cm, 2*cm, 2*cm, 2*cm, 2*cm]))

story.append(Paragraph("6.2 Scenario agressif (upside)", S_H2))
story.append(Paragraph(
    "Si l'acquisition Ramadan performe mieux que prevu (viralite TikTok, partenariats "
    "influenceurs majeurs) et l'expansion UAE/KSA decolle, les chiffres peuvent doubler.", S_BODY))
story.append(bullets([
    "M12 : 150k users, 6k premium, MRR 240k MAD, ARR 2.9 MMAD",
    "M24 : 1M users, 80k premium, MRR 3.2 MMAD, ARR 38 MMAD",
    "Break-even atteint des M18",
    "Valorisation seed potentielle : 10-15 MUSD apres ARR 5MUSD",
]))

story.append(Paragraph("6.3 Besoin de financement", S_H2))
rows = [
    ["Round", "Montant", "Valorisation", "Utilisation"],
    ["Pre-seed (M0-M6)", "500k-1M MAD", "10-15M MAD post", "Tech team + Ramadan campaign"],
    ["Seed (M12)", "5-10M MAD / 500k-1M USD", "50-80M MAD post", "Marketing scale + expansion MENA"],
    ["Series A (M24)", "2-5M USD", "15-30M USD post", "Expansion internationale, R&D IA"],
]
story.append(tbl(rows, col_widths=[3*cm, 3.5*cm, 3.5*cm, 5.5*cm]))

story.append(PageBreak())

# ========== 7. EQUIPE ET RISQUES ==========
story.append(Paragraph("7. Equipe et organisation cible", S_H1))

story.append(Paragraph("7.1 Equipe actuelle + besoins", S_H2))
rows = [
    ["Role", "Statut", "Priorite recrutement"],
    ["CEO / Founder (Idriss Kriouile)", "En place", "-"],
    ["CTO / Lead Dev Mobile", "A confirmer", "Immediat"],
    ["Designer UX/UI senior", "Freelance recommande", "M1"],
    ["Data Scientist / ML Engineer", "A recruter M3", "M3"],
    ["Growth / Marketing Manager MENA", "A recruter M2", "M2"],
    ["Community Manager (AR+FR+darija)", "A recruter M3", "M3"],
    ["Dieteticienne consultante", "Freelance DtN", "M1"],
    ["Sales B2B (M12+)", "Plus tard", "M12"],
    ["Customer support", "Freelance initialement", "M6"],
]
story.append(tbl(rows, col_widths=[6*cm, 4.5*cm, 4.5*cm]))

story.append(Paragraph("7.2 Risques et mitigations", S_H2))
rows = [
    ["Risque", "Probabilite", "Impact", "Mitigation"],
    ["MyFitnessPal lance version arabe", "Moyenne", "Eleve", "Vitesse d'execution, moat darija + Ramadan"],
    ["Gemini API devient payant / limite", "Elevee", "Moyen", "Couche abstraction IA, fallback Claude/GPT"],
    ["Clerk facture > 10k MAU", "Certain", "Faible", "Migration Supabase Auth envisagee"],
    ["Piratage abonnements Play Store", "Moyenne", "Moyen", "Server-side validation + App Check"],
    ["CNDP Maroc restrictions donnees sante", "Moyenne", "Moyen", "Privacy by design, stockage local + consent explicit"],
    ["Churn premium > 10%", "Moyenne", "Eleve", "Gamification, bot WhatsApp, rapports mensuels"],
    ["Retard build Android EAS / store reject", "Faible", "Moyen", "Tests en preview, compliance review avant submit"],
    ["Dependance Firebase (Google)", "Faible", "Eleve", "Abstraction repositories, possibilite migration Supabase"],
    ["Conjoncture economique MA", "Faible", "Moyen", "Prix bas (40 MAD), expansion diaspora UE"],
]
story.append(tbl(rows, col_widths=[4.5*cm, 2.5*cm, 2*cm, 6*cm]))

story.append(PageBreak())

# ========== 8. PLAN D'ACTION ==========
story.append(Paragraph("8. Plan d'action 90 jours", S_H1))

story.append(Paragraph("Mois 1 - Consolidation", S_H2))
story.append(bullets([
    "Finaliser base de donnees 500 plats marocains prioritaires (tajines, couscous, harira, khobz, msemen).",
    "Implementer mode Ramadan MVP (Aladhan API + Suhoor/Iftar tracking).",
    "Mettre en place Sentry + Crashlytics + PostHog analytics.",
    "Lancer beta fermee 100 testeurs (groupes fitness Casa/Rabat).",
    "Recruter designer UX et dieteticienne consultante.",
]))

story.append(Paragraph("Mois 2 - Voice + WhatsApp", S_H2))
story.append(bullets([
    "Darija voice logging (Whisper + Gemini parsing).",
    "Bot WhatsApp MVP (photo -> analyse -> log).",
    "Marketing pre-Ramadan : production de 30 videos TikTok / Reels darija.",
    "Recruter Growth Marketing Manager MENA.",
    "Beta ouverte 1000 users + premiere iteration sur feedback.",
]))

story.append(Paragraph("Mois 3 - Ramadan launch", S_H2))
story.append(bullets([
    "Campagne Ramadan : TikTok ads budget 15k MAD, partenariats 5 influenceurs.",
    "Lifetime deal limited 'Pack Ramadan' 499 MAD.",
    "PR : 5 articles Hespress/Yabiladi/Welovebuzz/Le360/Bladi.",
    "Monitoring intensif : crash rate, retention J1/J7, conversion premium.",
    "Objectif : 15k downloads, 300 premium, MRR 12k MAD.",
]))

story.append(Paragraph("Jalons critiques 12 mois", S_H2))
story.append(bullets([
    "<b>Fin M3</b> : 15k users, post-Ramadan, leçons apprises, pivot si besoin",
    "<b>Fin M6</b> : 50k users, 1200 premium, break-even operationnel (hors marketing)",
    "<b>Fin M9</b> : Lancement UAE/KSA en arabe classique",
    "<b>Fin M12</b> : 75k users, 3k premium, MRR 120k MAD, debut B2B",
]))

story.append(PageBreak())

# ========== CONCLUSION ==========
story.append(Paragraph("Conclusion", S_H1))
story.append(Paragraph(
    "Salorie a l'opportunite de devenir le <b>MyFitnessPal du monde arabe</b> en se positionnant "
    "comme la premiere application nutrition nativement concue pour la culture marocaine et "
    "musulmane, combinant IA de pointe (Gemini 2.5 Flash, Claude, Whisper) et contenu local "
    "verifie.", S_BODY))
story.append(Paragraph(
    "Les trois leviers strategiques principaux sont :", S_BODY))
story.append(bullets([
    "<b>La localisation profonde</b> (plats marocains, darija, Ramadan, Halal) comme moat durable face aux acteurs internationaux.",
    "<b>L'engagement via IA conversationnelle</b> (bot WhatsApp, coach darija, rapports IA) pour ne plus etre une simple app de tracking mais un accompagnement quotidien.",
    "<b>L'ecosysteme SALISTAR et le B2B</b> (wellness corporate, marketplace nutritionnistes) pour diversifier les revenus au-dela du freemium B2C.",
]))
story.append(Paragraph(
    "Avec un investissement pre-seed de 500k-1M MAD, Salorie peut atteindre 75k users et un "
    "MRR de 120k MAD en 12 mois, puis lever un seed de 5-10M MAD pour financer l'expansion "
    "MENA et atteindre un ARR de 25 MMAD a 24 mois, avec une valorisation potentielle de "
    "10-15M USD en Series A.", S_BODY))
story.append(Paragraph(
    "La fenetre de marche est ouverte <b>maintenant</b> : avant que MyFitnessPal, Cal AI ou "
    "Lifesum ne lancent leur version arabe, Salorie peut etablir une position de leader "
    "culturel que les acteurs internationaux auront du mal a rattraper.", S_BODY))

story.append(Spacer(1, 1*cm))
story.append(Paragraph("Fin du business plan.", S_NOTE))

doc.build(story, onFirstPage=page_footer, onLaterPages=page_footer)
print(f"PDF genere: {OUTPUT}")
