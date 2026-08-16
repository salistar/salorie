# -*- coding: utf-8 -*-
"""Chaque identifiant YouTube de lib/demoYouTube.ts pointe-t-il sur une vraie video ?

POURQUOI CE SCRIPT EXISTE

Un identifiant errone ne casse rien au build ni aux tests : il produit un lecteur
qui affiche « video indisponible ». Pour l'utilisateur c'est pire qu'une absence,
parce que ca ressemble a une panne de l'app. Rien d'automatique ne l'attraperait.

CE QU'ON VERIFIE, ET AVEC QUOI

L'endpoint oEmbed public de YouTube. Il ne demande aucune cle et repond :
  · 200 + un JSON avec le titre  -> la video existe ET peut etre integree
  · 401 / 404                    -> supprimee, privee, ou integration interdite

Le second cas compte autant que le premier : une video publique dont le
proprietaire a desactive l'integration s'ouvre parfaitement dans un navigateur
et reste NOIRE dans notre lecteur.

Usage :  python scripts/verifier-youtube.py
Sortie : 0 si tout va bien, 1 s'il faut corriger quelque chose.
"""
import io, json, re, subprocess, sys

SOURCE = 'lib/demoYouTube.ts'
OEMBED = 'https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v='


def identifiants():
    """Lit la table `YOUTUBE_PAR_EXERCICE` sans evaluer de TypeScript."""
    src = io.open(SOURCE, encoding='utf-8').read()
    m = re.search(r'YOUTUBE_PAR_EXERCICE:\s*Record<string, string>\s*=\s*\{(.*?)\};', src, re.S)
    if not m:
        print('Table introuvable dans %s — le nom a-t-il change ?' % SOURCE)
        sys.exit(1)
    return re.findall(r"['\"]?([\w-]+)['\"]?\s*:\s*['\"]([\w-]{6,})['\"]", m.group(1))


def verifier(vid):
    r = subprocess.run(
        ['curl', '-sS', '-o', '-', '-w', '\n%{http_code}', '--max-time', '20', OEMBED + vid],
        capture_output=True)
    sortie = r.stdout.decode('utf-8', 'replace').rsplit('\n', 1)
    code = sortie[-1].strip()
    if code != '200':
        return False, 'HTTP ' + (code or '?')
    try:
        return True, json.loads(sortie[0]).get('title', '')[:52]
    except Exception:
        return False, 'reponse illisible'


def main():
    paires = identifiants()
    if not paires:
        print('Aucun identifiant releve pour l instant.')
        print('Ce n est pas une erreur : sans identifiant, l app propose une')
        print('RECHERCHE YouTube, ce qui marche pour tous les exercices.')
        return 0

    print('Verification de %d identifiants aupres de YouTube...\n' % len(paires))
    morts = []
    for exercice, vid in paires:
        ok, detail = verifier(vid)
        print('  %-24s %-13s %s  %s' % (exercice, vid, 'OK  ' if ok else 'MORT', detail))
        if not ok:
            morts.append((exercice, vid, detail))

    print()
    if morts:
        print('%d identifiant(s) a corriger — ils afficheraient « video indisponible » :' % len(morts))
        for e, v, d in morts:
            print('   %-24s %-13s %s' % (e, v, d))
        return 1
    print('Les %d identifiants repondent et sont integrables.' % len(paires))
    return 0


if __name__ == '__main__':
    sys.exit(main())
