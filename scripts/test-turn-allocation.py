# -*- coding: utf-8 -*-
"""Le relais TURN alloue-t-il vraiment, et refuse-t-il les inconnus ?

`test-turn-joignable.py` envoie un STUN Binding : le serveur repond « voici
l'adresse d'ou tu m'ecris ». C'est utile, mais ca ne prouve RIEN sur TURN — un
serveur STUN nu repondrait pareil, et un appel ne passerait pas pour autant.

Ici on envoie une demande d'ALLOCATION, celle qui reserve un port de relais.
Sans identifiants, un serveur correctement configure doit repondre :

    · classe ERREUR sur la methode Allocate  -> il parle bien TURN
    · code 401 avec un REALM et un NONCE     -> l'authentification est exigee

Les deux comptent. Une allocation ACCORDEE sans identifiants serait un relais
ouvert : n'importe qui sur Internet ferait transiter son trafic par srv3, a nos
frais et sous notre adresse IP.

Aucun secret n'est necessaire : c'est tout l'interet du test.

Usage :  python scripts/test-turn-allocation.py [hote]
"""
import os, socket, struct, sys

HOTE = sys.argv[1] if len(sys.argv) > 1 else 'turn.salorie.com'
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 3478
COOKIE = 0x2112A442

METHODE_ALLOCATE = 0x003
CLASSE_ERREUR = 0x0110  # bits de classe « error response »
ATTR_REQUESTED_TRANSPORT = 0x0019
ATTR_ERROR_CODE = 0x0009
ATTR_REALM = 0x0014
ATTR_NONCE = 0x0015


def demande_allocation():
    """Allocate request, transport UDP, sans le moindre identifiant."""
    tid = os.urandom(12)
    # REQUESTED-TRANSPORT : 17 = UDP, puis 3 octets reserves.
    corps = struct.pack('>HH', ATTR_REQUESTED_TRANSPORT, 4) + struct.pack('>BBBB', 17, 0, 0, 0)
    entete = struct.pack('>HHI', METHODE_ALLOCATE, len(corps), COOKIE) + tid
    return entete + corps, tid


def attributs(data):
    """Parcourt les attributs d'une reponse STUN/TURN."""
    _, longueur = struct.unpack('>HH', data[:4])
    i, fin = 20, 20 + longueur
    while i + 4 <= min(fin, len(data)):
        a, l = struct.unpack('>HH', data[i:i + 4])
        yield a, data[i + 4:i + 4 + l]
        i += 4 + l + ((4 - l % 4) % 4)


def main():
    paquet, tid = demande_allocation()
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(6)
    print('Demande d ALLOCATION vers %s:%d (sans identifiants)\n' % (HOTE, PORT))
    try:
        s.sendto(paquet, (HOTE, PORT))
        data, _ = s.recvfrom(2048)
    except socket.timeout:
        print('AUCUNE REPONSE en 6 s.')
        print('Lance d abord le temoin : python scripts/test-turn-joignable.py stun.l.google.com')
        print('S il ne repond pas non plus, c est ton reseau qui bloque l UDP sortant.')
        return 1
    except Exception as e:
        print('ECHEC :', e)
        return 1

    if data[8:20] != tid:
        print('Reponse a une AUTRE transaction — on l ignore.')
        return 1

    type_msg = struct.unpack('>H', data[:2])[0]
    methode = type_msg & 0x3EEF
    est_erreur = (type_msg & 0x0110) == 0x0110

    trouve = {a: v for a, v in attributs(data)}
    code = None
    if ATTR_ERROR_CODE in trouve:
        v = trouve[ATTR_ERROR_CODE]
        code = v[2] * 100 + v[3]

    realm = trouve.get(ATTR_REALM, b'').decode('utf-8', 'replace')
    nonce_present = ATTR_NONCE in trouve

    if not est_erreur and methode == METHODE_ALLOCATE:
        print('/!\\  ALLOCATION ACCORDEE SANS IDENTIFIANTS.')
        print('     C est un RELAIS OUVERT : n importe qui peut faire transiter son')
        print('     trafic par ce serveur, a nos frais et sous notre adresse IP.')
        print('     A fermer immediatement (--use-auth-secret / --static-auth-secret).')
        return 2

    if est_erreur and code == 401:
        print('OK  Le serveur parle TURN et exige une authentification.')
        print('    code d erreur ... 401 (Unauthorized)')
        print('    realm ........... %s' % (realm or '(absent)'))
        print('    nonce ........... %s' % ('present' if nonce_present else 'ABSENT'))
        if not realm or not nonce_present:
            print('\n/!\\ Un realm ou un nonce manquant empeche le client de rejouer')
            print('    la demande signee : l appel echouerait malgre des identifiants valides.')
            return 1
        print('\n=> Relais operationnel et ferme aux inconnus.')
        return 0

    print('Reponse INATTENDUE : type 0x%04x, code d erreur %s' % (type_msg, code))
    if code == 400:
        print('400 = demande malformee. Le serveur repond, mais pas ce qu on attend.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
