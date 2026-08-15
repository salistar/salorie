# -*- coding: utf-8 -*-
"""Le TURN est-il joignable depuis Internet ? (requete STUN Binding, en UDP)

Usage :  python scripts/test-turn-joignable.py [hote]
         python scripts/test-turn-joignable.py            (defaut : srv3)
         python scripts/test-turn-joignable.py stun.l.google.com   (temoin)

A relancer apres CHAQUE action sur le pare-feu : c'est la seule preuve.

C'est le seul test qui prouve quelque chose : le port 3478 est en UDP, donc une
tentative TCP echoue meme quand tout va bien — c'est ce qui m'avait fait conclure
a tort que le port etait ferme.

Si le serveur repond avec notre adresse publique, le relais est joignable depuis
Internet : pare-feu ouvert, coturn lie a la bonne interface.
"""
import socket, struct, os, sys

HOTE = sys.argv[1] if len(sys.argv) > 1 else '46.225.77.64'
PORT = 19302 if 'google' in HOTE else 3478

# STUN Binding Request (RFC 5389) : type 0x0001, longueur 0, magic cookie, 12 octets
# de transaction aleatoires.
transaction = os.urandom(12)
requete = struct.pack('>HHI', 0x0001, 0, 0x2112A442) + transaction

s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.settimeout(6)
try:
    s.sendto(requete, (HOTE, PORT))
    data, _ = s.recvfrom(2048)
except socket.timeout:
    print('AUCUNE REPONSE en 6 s — UDP 3478 est filtre, ou coturn n ecoute pas sur cette adresse.')
    print('Avant de conclure, lance le TEMOIN : python scripts/test-turn-joignable.py stun.l.google.com')
    print('(port 19302). S il ne repond pas non plus, c est TON reseau qui bloque l UDP sortant,')
    print('et le test ne dit rien sur le serveur.')
    sys.exit(1)
except Exception as e:
    print('ECHEC :', e)
    sys.exit(1)

type_msg, longueur, cookie = struct.unpack('>HHI', data[:8])
if type_msg != 0x0101:
    print('Reponse inattendue, type 0x%04x' % type_msg)
    sys.exit(1)

print('REPONSE STUN RECUE — le serveur repond bien en UDP.')

# On lit XOR-MAPPED-ADDRESS (0x0020) pour afficher l'adresse publique vue par lui.
i = 20
fin = 20 + longueur
while i + 4 <= fin:
    attr, alen = struct.unpack('>HH', data[i:i + 4])
    val = data[i + 4:i + 4 + alen]
    if attr == 0x0020 and len(val) >= 8:
        port = struct.unpack('>H', val[2:4])[0] ^ (0x2112A442 >> 16)
        ip = bytes(a ^ b for a, b in zip(val[4:8], struct.pack('>I', 0x2112A442)))
        print('Il nous voit depuis %s:%d' % ('.'.join(str(b) for b in ip), port))
    i += 4 + alen + ((4 - alen % 4) % 4)

print('=> STUN operationnel. Le relais TURN est joignable depuis Internet.')
