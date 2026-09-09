# -*- coding: utf-8 -*-
"""Complete les noms français et arabes manquants dans names_172.json.

⚠ « fr = en » N'EST PAS UN DEFAUT EN SOI, ET LE CONFONDRE EN CREE UN.
Un premier comptage annoncait « 108 classes ou le francais est identique a
l'anglais » comme s'il s'agissait de 108 traductions oubliees. C'est faux :
`couscous`, `harira`, `msemen`, `tagine`, `pizza`, `sushi`, `omelette`,
`beignets`, `foie gras`, `macarons`, `escargots` s'ecrivent pareil dans les deux
langues — plusieurs sont meme des mots FRANCAIS a l'origine. Traduire de force
ces entrees-la aurait fabrique des noms que personne n'emploie.

Ne sont corriges ici que les cas ou le francais EXISTE et DIFFERE :
`apple` -> Pomme, `tagine with quince` -> Tajine aux coings.

⚠ CE QUE JE SAIS ET CE QUE JE NE SAIS PAS.
Les noms marques `sur` ci-dessous sont d'usage courant et verifiables. Ceux
marques `a_verifier` sont regionaux ou de graphie flottante : `karan` (nomme
kalinte a Tanger, garantita en Algerie), `khringo` (que les sources donnent pour
un synonyme de baghrir), `bahla`, `tkalya`. Ils sont ecrits pour ne pas laisser
un champ vide, mais un locuteur marocain doit les trancher — et le rapport les
liste separement pour qu'on sache lesquels relire.

Usage :  python food4k/completer_noms.py [--appliquer]
"""
import io
import json
import os
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# (classe, francais ou None si identique a l'anglais, arabe, confiance)
NOMS = [
    # ── fruits et produits simples ────────────────────────────────────────────
    ('apple', 'Pomme', 'تفاح', 'sur'),
    ('banana', 'Banane', 'موز', 'sur'),
    ('orange', None, 'برتقال', 'sur'),
    ('pear', 'Poire', 'إجاص', 'sur'),
    ('dates', 'Dattes', 'تمر', 'sur'),
    ('jam', 'Confiture', 'مربى', 'sur'),
    ('lentils', 'Lentilles', 'عدس', 'sur'),
    ('salmon', 'Saumon', 'سلمون', 'sur'),
    ('zitoun', 'Olives', 'زيتون', 'sur'),
    ('nougat', None, 'نوغة', 'sur'),
    ('spagetti', 'Spaghettis', 'سباغيتي', 'sur'),
    ('croissant', None, 'كرواسون', 'sur'),

    # ── plats marocains ───────────────────────────────────────────────────────
    ('tagine', 'Tajine', 'طاجين', 'sur'),
    ('tagine with beef', 'Tajine au bœuf', 'طاجين باللحم', 'sur'),
    ('tagine with quince', 'Tajine aux coings', 'طاجين بالسفرجل', 'sur'),
    ('tagine with vegetables', 'Tajine aux légumes', 'طاجين بالخضار', 'sur'),
    ('tagine with artichokes and peas', 'Tajine aux artichauts et petits pois',
     'طاجين بالخرشوف والبازلاء', 'sur'),
    ('couscous', None, 'كسكس', 'sur'),
    ('bastila', 'Pastilla', 'بسطيلة', 'sur'),
    ('chicken basstila', 'Pastilla au poulet', 'بسطيلة بالدجاج', 'sur'),
    ('fish basstila', 'Pastilla au poisson', 'بسطيلة بالسمك', 'sur'),
    ('rfissa', None, 'رفيسة', 'sur'),
    ('harira', None, 'حريرة', 'sur'),
    ('bissara', None, 'بيصارة', 'sur'),
    ('loubia', 'Haricots blancs', 'لوبيا', 'sur'),
    ('mechoui', 'Méchoui', 'مشوي', 'sur'),
    ('tanjia', 'Tangia', 'طنجية', 'sur'),
    ('seffa', 'Seffa', 'سفة', 'sur'),
    ('seffa with rice', 'Seffa au riz', 'سفة بالأرز', 'sur'),
    ('zaalouk', 'Zaalouk', 'زعلوك', 'sur'),
    ('taktouka', 'Taktouka', 'تكتوكة', 'sur'),
    ('matbucha', 'Matbucha', 'مطبوخة', 'sur'),
    ('shakchouka', 'Chakchouka', 'شكشوكة', 'sur'),
    ('maakouda', 'Maakouda', 'معقودة', 'sur'),
    ('briouat', 'Briouates', 'بريوات', 'sur'),
    ('briouate with almonds', 'Briouates aux amandes', 'بريوات باللوز', 'sur'),
    ('chicken with potatoes and olives', 'Poulet aux pommes de terre et olives',
     'دجاج بالبطاطس والزيتون', 'sur'),
    ('meatball with tomato sauce', 'Kefta à la sauce tomate', 'كفتة بالصلصة', 'sur'),
    ('meat brochettes', 'Brochettes de viande', 'أسياخ اللحم', 'sur'),
    ('roasted chicken', 'Poulet rôti', 'دجاج مشوي', 'sur'),
    ('fish and vegetables', 'Poisson aux légumes', 'سمك بالخضار', 'sur'),
    ('white beans with tomatoes', 'Haricots blancs à la tomate',
     'لوبيا بيضاء بالطماطم', 'sur'),
    ('feves with sauce', 'Fèves en sauce', 'فول بالصلصة', 'sur'),
    ('tomatoes and onion salad', 'Salade de tomates et oignons',
     'سلطة الطماطم والبصل', 'sur'),
    ('chicken nuggets', 'Nuggets de poulet', 'قطع الدجاج المقرمشة', 'sur'),

    # ── pains et galettes ─────────────────────────────────────────────────────
    ('msemen', None, 'مسمن', 'sur'),
    ('rghayf', 'Rghaïf', 'رغايف', 'sur'),
    ('baghrir', None, 'بغرير', 'sur'),
    ('harcha', None, 'حرشة', 'sur'),
    ('batbout', None, 'بطبوط', 'sur'),
    ('traditional bread', 'Pain traditionnel', 'خبز تقليدي', 'sur'),
    ('sweet bread', 'Pain brioché', 'خبز حلو', 'sur'),

    # ── patisserie ────────────────────────────────────────────────────────────
    ('chebakia', None, 'شباكية', 'sur'),
    ('kaab el ghazal', 'Cornes de gazelle', 'كعب الغزال', 'sur'),
    ('mhancha', "M'hancha", 'محنشة', 'sur'),
    ('sellou', None, 'سلو', 'sur'),
    ('sfenj', None, 'سفنج', 'sur'),
    ('fekkas', None, 'فقاص', 'sur'),
    ('basbousa', None, 'بسبوسة', 'sur'),
    ('kaak', 'Kaak', 'كعك', 'sur'),
    ('amlou', None, 'أملو', 'sur'),
    ('traditional macaroon', 'Ghriba', 'غريبة', 'sur'),
    ('crackers with almonds', 'Craquelins aux amandes', 'مقرمشات باللوز', 'sur'),
    ('snowballs', 'Boules de neige', 'كرات الثلج', 'sur'),

    # ── abats et preparations moins courantes ─────────────────────────────────
    ('liver with sauce', 'Foie en chermoula', 'كبدة مشرملة', 'sur'),
    ('feet of beef', 'Pieds de veau', 'كوارع', 'sur'),

    # ── a faire trancher par un locuteur marocain ─────────────────────────────
    # Noms regionaux ou de graphie flottante. Ecrits pour ne pas laisser un champ
    # vide, mais chacun a une raison d'etre relu :
    ('karan', 'Karan', 'كاران', 'a_verifier'),          # kalinte a Tanger, garantita en Algerie
    ('khringo', 'Khringo', 'خرينݣو', 'a_verifier'),     # les sources en font un synonyme de baghrir
    ('bahla', 'Ghriba bahla', 'غريبة بهلة', 'a_verifier'),
    ('tkalya', 'Tkalya', 'تقلية', 'a_verifier'),
    ('better beldi', 'Smen', 'سمن بلدي', 'a_verifier'),  # « better » transcrit « beurre »

    # ── Food-101 : les seules ou le francais differe vraiment ─────────────────
    ('samosa', 'Samoussa', None, 'sur'),
    ('steak', 'Steak', None, 'sur'),
    ('donuts', 'Donuts', None, 'sur'),
]


def main():
    appliquer = '--appliquer' in sys.argv
    chemin = os.path.join(ICI, 'names_172.json')
    n = json.load(io.open(chemin, encoding='utf-8'))

    change_fr, change_ar, inconnues, a_verifier = [], [], [], []
    for classe, fr, ar, confiance in NOMS:
        e = n.get(classe)
        if not isinstance(e, dict):
            inconnues.append(classe)
            continue
        if fr and e.get('fr', '').strip() != fr:
            change_fr.append((classe, e.get('fr', ''), fr))
            e['fr'] = fr
        if ar and not str(e.get('ar', '')).strip():
            change_ar.append((classe, ar))
            e['ar'] = ar
        if confiance == 'a_verifier':
            a_verifier.append(classe)

    print('  %d noms francais corriges' % len(change_fr))
    for c, avant, apres in change_fr[:12]:
        print('     %-34s %s -> %s' % (c[:34], avant or '(vide)', apres))
    if len(change_fr) > 12:
        print('     ... et %d autres' % (len(change_fr) - 12))

    print('\n  %d noms arabes ajoutes' % len(change_ar))
    for c, ar in change_ar[:12]:
        print('     %-34s %s' % (c[:34], ar))
    if len(change_ar) > 12:
        print('     ... et %d autres' % (len(change_ar) - 12))

    if inconnues:
        print('\n  /!\\ %d classes de ma table absentes du fichier : %s'
              % (len(inconnues), ', '.join(inconnues)))

    print('\n  %d noms A FAIRE RELIRE par un locuteur marocain :' % len(a_verifier))
    for c in a_verifier:
        print('     %-20s %s' % (c, json.dumps(n.get(c, {}), ensure_ascii=False)))

    reste_ar = [c for c, v in n.items()
                if isinstance(v, dict) and not str(v.get('ar', '')).strip()]
    print('\n  %d classes restent sans nom arabe%s'
          % (len(reste_ar), (' : ' + ', '.join(reste_ar[:12])) if reste_ar else ''))

    if not appliquer:
        print('\n  (constat seul — relancer avec --appliquer)')
        return 0
    io.open(chemin, 'w', encoding='utf-8').write(json.dumps(n, ensure_ascii=False, indent=1))
    print('\n  names_172.json reecrit')
    return 0


if __name__ == '__main__':
    sys.exit(main())
