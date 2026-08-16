# -*- coding: utf-8 -*-
"""Le socket temps reel /social repond-il, et refuse-t-il les inconnus ?

Trois choses a prouver, dans cet ordre :

  1. le serveur socket.io repond au tout premier echange (handshake) ;
  2. le namespace /social existe ;
  3. une connexion SANS jeton est REFUSEE.

Le point 3 est le plus important. `handleConnection` verifie un jeton Firebase et
deconnecte en cas d'echec. Si cette verification sautait, n'importe qui pourrait
ecouter la presence et le chat des courses — or l'uid EST l'email des
utilisateurs.

On parle le protocole Engine.IO a la main plutot que d'ajouter une dependance :
le transport « polling » est du HTTP simple, et c'est suffisant pour ces trois
questions.

Usage :  python scripts/test-socket-social.py [https://api.salorie.com]
"""
import json, re, subprocess, sys

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'https://api.salorie.com').rstrip('/')


def http(url, corps=None):
    cmd = ['curl', '-sS', '--max-time', '25', url]
    if corps is not None:
        cmd += ['-X', 'POST', '--data-binary', corps, '-H', 'Content-Type: text/plain;charset=UTF-8']
    r = subprocess.run(cmd, capture_output=True)
    return r.stdout.decode('utf-8', 'replace')


def main():
    print('Serveur : %s\n' % BASE)

    # 1. Handshake Engine.IO. La reponse commence par « 0 » suivi d'un JSON.
    rep = http('%s/socket.io/?EIO=4&transport=polling' % BASE)
    m = re.search(r'\{.*\}', rep)
    if not m:
        print('1. handshake ......... ECHEC — reponse inattendue : %s' % rep[:120])
        return 1
    info = json.loads(m.group(0))
    sid = info.get('sid')
    print('1. handshake ......... OK   sid=%s… ping=%s ms' % (str(sid)[:10], info.get('pingInterval')))

    # 2. Ouverture du namespace /social, SANS jeton.
    #    « 40/social, » = paquet socket.io CONNECT sur ce namespace.
    http('%s/socket.io/?EIO=4&transport=polling&sid=%s' % (BASE, sid), '40/social,')

    # 3. Verdict — et il faut LIRE PLUSIEURS FOIS.
    #    `handleConnection` est asynchrone : socket.io acquitte le CONNECT avant
    #    que la verification du jeton Firebase n'ait abouti. Une lecture unique
    #    voit donc l'acquittement et conclut « accepte » — un faux positif de
    #    securite qui m'a eu la premiere fois. Le refus arrive au tour suivant,
    #    sous la forme de l'evenement `social:erreur` puis d'une deconnexion.
    vu = ''
    for _ in range(4):
        vu += http('%s/socket.io/?EIO=4&transport=polling&sid=%s' % (BASE, sid))
        if 'social:erreur' in vu or '44/social' in vu or '41' in vu:
            break

    ouvert = '40/social' in vu
    refuse = ('social:erreur' in vu) or ('44/social' in vu) or ('41' in vu) or (not vu.strip())

    if ouvert:
        print('2. namespace /social . OK   (le serveur acquitte le CONNECT)')
    else:
        print('2. namespace /social . pas d acquittement — reponse : %s' % vu[:100])

    if refuse:
        motif = 'social:erreur' if 'social:erreur' in vu else ('44/social' if '44/social' in vu else 'deconnexion')
        print('3. sans jeton ........ REFUSE  (%s)' % motif)
        print('\n=> Socket operationnel et ferme aux inconnus.')
        return 0

    print('3. sans jeton ........ /!\\ TOUJOURS CONNECTE apres 4 lectures')
    print('\n/!\\ Le socket laisse entrer sans authentification. La presence et le')
    print('    chat des courses seraient lisibles par n importe qui — et l uid EST')
    print('    l email des utilisateurs.')
    return 2


if __name__ == '__main__':
    sys.exit(main())
