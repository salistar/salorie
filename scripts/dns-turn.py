# -*- coding: utf-8 -*-
"""Cree (ou met a jour) l'enregistrement DNS turn.salorie.com.

    python scripts/dns-turn.py C:\\chemin\\vers\\jeton.txt

Le jeton est lu dans un FICHIER, jamais saisi dans une invite : les invites
masquees de cette machine avalent les collages sans rien dire — constate trois fois
(gh secret set, puis Read-Host -AsSecureString pour Cloudflare et Clerk, tous
arrives vides). Le fichier est efface a la fin.

Le jeton doit porter la permission Zone:DNS:Edit sur salorie.com.

`proxied` est FAUX et doit le rester : Cloudflare ne relaie pas l'UDP. Un
enregistrement proxifie enverrait le client vers un edge qui ne parle pas TURN,
et l'appel echouerait sans que rien ne l'explique.
"""
import io, json, os, subprocess, sys

API = 'https://api.cloudflare.com/client/v4'
ZONE = 'salorie.com'
NOM = 'turn'
IP = '46.225.77.64'


def http(methode, chemin, jeton, corps=None):
    cmd = ['curl', '-sS', '--max-time', '45', '-X', methode,
           '-H', 'Authorization: Bearer ' + jeton,
           '-H', 'Content-Type: application/json', API + chemin]
    if corps is not None:
        cmd += ['-d', json.dumps(corps)]
    r = subprocess.run(cmd, capture_output=True)
    try:
        return json.loads(r.stdout.decode('utf-8', 'replace'))
    except Exception:
        return {'success': False, 'errors': [{'message': r.stdout[:200].decode('utf-8', 'replace')}]}


def erreurs(d):
    return '; '.join(str(e.get('message', e)) for e in (d.get('errors') or []))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    chemin = sys.argv[1]
    if not os.path.exists(chemin):
        print('Fichier introuvable : ' + chemin)
        return 1
    jeton = io.open(chemin, encoding='utf-8-sig').read().strip()
    if len(jeton) < 20:
        print('Le fichier ne contient pas de jeton exploitable (%d caracteres).' % len(jeton))
        print('Un collage avale laisse un fichier vide — rouvre-le et verifie.')
        return 1
    print('jeton lu : %d caracteres' % len(jeton))

    v = http('GET', '/user/tokens/verify', jeton)
    if not v.get('success'):
        print('Jeton REFUSE par Cloudflare : ' + erreurs(v))
        return 1
    print('jeton valide')

    z = http('GET', '/zones?name=' + ZONE, jeton)
    res = z.get('result') or []
    if not z.get('success') or not res:
        print('Zone %s introuvable : %s' % (ZONE, erreurs(z) or 'le jeton n a pas la permission Zone:DNS sur ce domaine'))
        return 1
    zone_id = res[0]['id']
    print('zone %s trouvee' % ZONE)

    plein = '%s.%s' % (NOM, ZONE)
    ex = http('GET', '/zones/%s/dns_records?name=%s' % (zone_id, plein), jeton)
    corps = {'type': 'A', 'name': NOM, 'content': IP, 'ttl': 300, 'proxied': False}
    deja = (ex.get('result') or [])

    if deja:
        print('enregistrement existant — mise a jour')
        d = http('PUT', '/zones/%s/dns_records/%s' % (zone_id, deja[0]['id']), jeton, corps)
    else:
        d = http('POST', '/zones/%s/dns_records' % zone_id, jeton, corps)

    if not d.get('success'):
        print('ECHEC : ' + erreurs(d))
        return 1

    r = d['result']
    print('\nOK  %s  A  %s  (proxie: %s, ttl %s)' % (r['name'], r['content'], r['proxied'], r['ttl']))
    print('\nVerifie dans une minute :')
    print('  nslookup %s 8.8.8.8' % plein)
    print('  python scripts/test-turn-joignable.py %s' % plein)
    return 0


if __name__ == '__main__':
    code = main()
    # Le jeton ne doit pas trainer sur le disque une fois utilise.
    try:
        if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
            os.remove(sys.argv[1])
            print('\n(fichier du jeton efface)')
    except Exception:
        print('\n/!\\ Pense a effacer %s toi-meme.' % sys.argv[1])
    sys.exit(code)
