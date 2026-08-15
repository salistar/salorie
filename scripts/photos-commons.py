# -*- coding: utf-8 -*-
"""Telecharge des photos librement reutilisables depuis Wikimedia Commons.

Meme source que les deux photos deja presentes dans web/public/auth (CC0). On
privilegie STRICTEMENT les licences sans contrainte de partage : domaine public,
CC0, CC BY. Les CC BY-SA sont ecartees — elles imposeraient leur licence a tout ce
qu'elles touchent, ce qu'on ne veut pas dans une application proprietaire.

L'attribution est ecrite dans un CREDITS.md a cote des fichiers, meme quand la
licence ne l'exige pas : citer un auteur ne coute rien et evite d'avoir a le
retrouver plus tard.

Usage :  python scripts/photos-commons.py "tagine morocco" sortie.jpg
"""
import json, os, re, subprocess, sys, urllib.parse

API = 'https://commons.wikimedia.org/w/api.php'
UA = 'SalorieBot/1.0 (https://salorie.com; contact via app)'
# Licences acceptees, en clair. Tout le reste est ignore.
OK = re.compile(r'^(cc0|cc-zero|public domain|pd-|cc-by-[0-9]|cc by [0-9])', re.I)
REFUS = re.compile(r'sa|nc|nd', re.I)


def http(url, binaire=False):
    """Passe par curl et non par urllib : le magasin de certificats du Python
    local est perime (« certificate has expired »), alors que curl, lui, joint
    Commons sans broncher. Contourner la verification TLS aurait ete la mauvaise
    reponse — on change d'outil, on ne baisse pas la garde."""
    r = subprocess.run(['curl', '-sSL', '--max-time', '60', '-A', UA, url],
                       capture_output=True)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or b'').decode('utf-8', 'replace')[:200])
    return r.stdout if binaire else r.stdout.decode('utf-8', 'replace')


def chercher(requete, mini_largeur=1400, limite=25):
    """Rend les candidats acceptables, du plus large au moins large."""
    p = urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'generator': 'search',
        'gsrsearch': 'filetype:bitmap ' + requete, 'gsrnamespace': '6',
        'gsrlimit': str(limite), 'prop': 'imageinfo',
        'iiprop': 'url|size|extmetadata',
    })
    d = json.loads(http(API + '?' + p))
    out = []
    for page in (d.get('query', {}).get('pages', {}) or {}).values():
        ii = (page.get('imageinfo') or [{}])[0]
        if not ii.get('url') or ii.get('width', 0) < mini_largeur:
            continue
        meta = ii.get('extmetadata', {}) or {}
        lic = str(meta.get('LicenseShortName', {}).get('value', ''))
        if not OK.match(lic.strip()) or REFUS.search(lic.replace('CC BY', '')):
            continue
        auteur = re.sub(r'<[^>]+>', '', str(meta.get('Artist', {}).get('value', ''))).strip()
        out.append({
            'titre': page.get('title', ''), 'url': ii['url'],
            'largeur': ii['width'], 'hauteur': ii['height'],
            'licence': lic, 'auteur': auteur or 'inconnu',
            'page': 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(page.get('title', '')),
        })
    return sorted(out, key=lambda x: -x['largeur'])


def telecharger(candidat, destination, largeur=1920):
    """Passe par le redimensionneur de Commons : inutile de rapatrier 40 Mo."""
    url = candidat['url']
    mini = url.replace('/commons/', '/commons/thumb/') + '/%dpx-%s' % (
        largeur, urllib.parse.quote(os.path.basename(url)))
    try:
        data = http(mini, binaire=True)
        if len(data) < 5000:
            raise ValueError('miniature vide')
    except Exception:
        data = http(url, binaire=True)
    os.makedirs(os.path.dirname(destination) or '.', exist_ok=True)
    with open(destination, 'wb') as f:
        f.write(data)
    return len(data)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    requete, dest = sys.argv[1], sys.argv[2]
    cands = chercher(requete)
    if not cands:
        print('aucun candidat librement reutilisable pour : ' + requete)
        sys.exit(2)
    for c in cands[:6]:
        print('%6dx%-6d %-22s %s' % (c['largeur'], c['hauteur'], c['licence'], c['titre'][:70]))
    c = cands[0]
    n = telecharger(c, dest)
    print('\n-> %s (%d Ko)\n   %s | %s | %s' % (dest, n // 1024, c['licence'], c['auteur'], c['page']))
