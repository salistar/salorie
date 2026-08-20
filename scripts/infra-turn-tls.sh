#!/bin/sh
# Active le TURN sur TLS (5349) et fait tourner le secret partage.
# ---------------------------------------------------------------------------
# A lancer SUR srv3, depuis le repertoire de la pile :
#     cd ~/apps/salorie-stack && sh infra-turn-tls.sh
#
# Pourquoi ce script existe plutot qu'une commande a distance : la modification
# d'une infrastructure de production et la rotation d'un secret sont des gestes
# qui se decident, pas qui se delegent a un canal d'execution automatique.
#
# Ce qu'il fait, dans l'ordre :
#   1. Fait tourner TURN_SECRET — il a ete expose publiquement le 20/08/2026
#      dans un journal GitHub Actions (depot PUBLIC) pendant quelques minutes.
#      Le journal a ete supprime, mais un secret vu une fois est un secret mort.
#   2. Active le TLS sur 5349, en lisant le certificat que Caddy renouvelle deja
#      pour turn.salorie.com (bloc ajoute au Caddyfile le 20/08).
#   3. Pose TURN_TLS_PORT pour que le backend annonce l'adresse `turns:`.
#
# Tout est sauvegarde avant modification, et le script REVIENT EN ARRIERE si
# coturn ne redemarre pas.
set -eu

F=docker-compose.override.yml
E=.env
C=/certs/caddy/certificates/acme-v02.api.letsencrypt.org-directory/turn.salorie.com/turn.salorie.com

[ -f "$F" ] || { echo "Lance-moi depuis ~/apps/salorie-stack"; exit 1; }

echo "== sauvegardes =="
cp "$F" "$F.avant-tls-$(date +%s)"
[ -f "$E" ] && cp "$E" "$E.avant-tls-$(date +%s)"

echo "== 1. rotation du secret TURN =="
NOUVEAU=$(openssl rand -hex 32)
if grep -q '^TURN_SECRET=' "$E" 2>/dev/null; then
  sed -i "s|^TURN_SECRET=.*|TURN_SECRET=$NOUVEAU|" "$E"
else
  printf 'TURN_SECRET=%s\n' "$NOUVEAU" >> "$E"
fi
NOUVEAU=""
echo "   fait (valeur jamais affichee)"

echo "== 2. TLS sur 5349 =="
if grep -q 'tls-listening-port' "$F"; then
  echo "   deja configure"
else
  sed -i "s|^      --no-tls$|      --tls-listening-port=5349|" "$F"
  sed -i "s|^      --no-dtls$|      --cert=$C.crt|" "$F"
  sed -i "\|--cert=|a\      --pkey=$C.key" "$F"
  sed -i "\|- \"3478:3478/tcp\"|a\      - \"5349:5349/udp\"" "$F"
  sed -i "\|- \"3478:3478/tcp\"|a\      - \"5349:5349/tcp\"" "$F"
  # Le certificat vit dans le volume de Caddy. Montage en LECTURE SEULE : coturn
  # n'a aucune raison d'ecrire dans le magasin de certificats du proxy.
  sed -i "\|- \"49160-49180:49160-49180/udp\"|a\      - /var/lib/docker/volumes/caddy_caddy_data/_data:/certs:ro" "$F"
  sed -i "\|- \"49160-49180:49160-49180/udp\"|a\    volumes:" "$F"
  echo "   configure"
fi

echo "== 3. le backend annonce turns: =="
grep -q '^TURN_TLS_PORT=' "$E" 2>/dev/null || printf 'TURN_TLS_PORT=5349\n' >> "$E"

echo "== validation =="
docker compose config --quiet || { echo "COMPOSE INVALIDE — rien n'a demarre, restaure la sauvegarde"; exit 1; }

echo "== redemarrage =="
docker compose up -d coturn backend

sleep 8
if [ "$(docker inspect -f '{{.State.Running}}' salorie-coturn 2>/dev/null)" != "true" ]; then
  echo "!! coturn NE TOURNE PAS — retour arriere"
  docker logs --tail=25 salorie-coturn 2>&1 | tail -25
  cp "$(ls -t $F.avant-tls-* | head -1)" "$F"
  docker compose up -d coturn
  exit 1
fi

echo "== verification =="
echo "-- ports en ecoute --"
docker exec salorie-coturn sh -lc 'netstat -lntu 2>/dev/null | grep -E "3478|5349"' || true
echo "-- coturn a-t-il lu le certificat ? --"
docker logs --tail=60 salorie-coturn 2>&1 | grep -iE "tls|cert|error" | tail -8 || echo "   (rien sur TLS dans le journal)"
echo
echo "Termine. Depuis l'exterieur, verifie :  openssl s_client -connect turn.salorie.com:5349"
