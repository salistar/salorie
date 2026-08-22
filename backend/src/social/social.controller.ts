import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { MurService } from './mur.service';
import { createHmac } from 'crypto';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

// Serveurs ICE pour la voix de la marche à deux.
// ---------------------------------------------------------------------------
// Deux étages, et il faut les deux :
//   · STUN découvre l'adresse publique de chaque téléphone. Gratuit, suffisant dans
//     la majorité des cas, mais impuissant derrière certains NAT.
//   · TURN RELAIE le flux quand la connexion directe est impossible. C'est le cas
//     de beaucoup d'abonnés mobiles marocains, qui sont derrière un NAT de
//     l'opérateur (CGNAT) : sans TURN, l'appel échoue purement et simplement.
//
// Les identifiants sont ÉPHÉMÈRES (mécanisme REST de coturn, `use-auth-secret`) :
// le serveur ne stocke aucun compte, il signe un couple valable une heure. Le
// secret ne quitte jamais le backend — un identifiant fuité expire tout seul.
@Controller('social')
export class SocialController {
  @Get('turn-credentials')
  @UseGuards(FirebaseAuthGuard)
  turnCredentials(@Req() req: any) {
    const secret = String(process.env.TURN_SECRET || '').trim();
    const hote = String(process.env.TURN_HOST || 'turn.salorie.com').trim();

    // STUN public de Google en repli : il ne relaie rien et ne voit aucune donnée,
    // il répond seulement « voici l'adresse d'où tu m'écris ». Toujours utile, même
    // sans TURN configuré.
    const stun = ['stun:stun.l.google.com:19302', `stun:${hote}:3478`];
    if (process.env.TURN_PUBLIC_IP) stun.push(`stun:${String(process.env.TURN_PUBLIC_IP).trim()}:3478`);
    const iceServers: any[] = [{ urls: stun }];

    // Adresse IP publique du relais. On l'annonce EN PLUS du nom de domaine : tant
    // que `turn.salorie.com` n'existe pas au DNS, un client qui ne connaitrait que
    // le nom n'aurait aucun relais du tout. Avec les deux, le client essaie l'un
    // puis l'autre et se debrouille — c'est precisement le role de la liste ICE.
    const ip = String(process.env.TURN_PUBLIC_IP || '').trim();

    if (secret) {
      // Nom d'utilisateur = <expiration UNIX>:<identifiant>, mot de passe = HMAC-SHA1
      // signé avec le secret partagé avec coturn. C'est le format que coturn attend ;
      // il recalcule le HMAC et n'a donc aucune base d'utilisateurs à tenir.
      const expiration = Math.floor(Date.now() / 1000) + 3600;
      const uid = String(req?.user?.uid || 'anon');
      const username = `${expiration}:${uid}`;
      const credential = createHmac('sha1', secret).update(username).digest('base64');
      const urls = [`turn:${hote}:3478?transport=udp`, `turn:${hote}:3478?transport=tcp`];

      // TURN sur TLS. Ce n'est pas de la confidentialité en plus — le média est
      // déjà chiffré de bout en bout par DTLS-SRTP, et le relais ne sait pas ce
      // qu'il transporte. C'est une question d'ACCESSIBILITÉ : beaucoup de
      // réseaux d'entreprise et d'hôtels laissent passer le TLS et bloquent le
      // reste. Sans lui, l'appel n'échoue pas à moitié : il n'a lieu du tout.
      //
      // En TÊTE de liste et en TCP : quand un client en a besoin, c'est qu'il n'a
      // rien d'autre, et un client pressé s'arrête au premier serveur qui répond.
      //
      // Piloté par une variable : tant que `TURN_TLS_PORT` n'est pas posée, rien
      // n'est annoncé. Annoncer une adresse `turns:` que personne n'écoute ferait
      // patienter chaque client sur un serveur mort avant qu'il essaie les autres.
      // L'IP en plus du nom : elle marchait deja quand `turn.salorie.com` n'existait
      // pas encore au DNS. Depuis le 20/08 il resout, mais la garder ne coute rien.
      if (ip) urls.unshift(`turn:${ip}:3478?transport=udp`, `turn:${ip}:3478?transport=tcp`);
      // `turns:` en DERNIER `unshift`, donc en PREMIER dans la liste. Les deux etaient
      // inverses : l'IP passait devant et la ligne TLS se retrouvait troisieme, alors
      // que son commentaire affirmait le contraire. Trouve en relisant ce commit.
      //
      // Le NOM et non l'IP : le certificat est emis pour turn.salorie.com, une
      // adresse en IP echouerait a la verification TLS.
      // PLUSIEURS ports, du plus universel au plus specifique. Depuis le
      // 22/08/2026 coturn est aussi joignable sur le **443**, par routage TCP
      // selon le SNI : Caddy garde le port et n'y envoie que ce qui annonce
      // turn.salorie.com. C'est le seul port qui traverse les reseaux
      // d'entreprise les plus fermes — ceux qui ne laissent sortir que lui.
      // Le 5349 reste annonce : il est le port standard du TURN sur TLS, et
      // rien ne dit qu'un pare-feu qui bloque l'un bloque l'autre.
      const portsTls = String(process.env.TURN_TLS_PORT || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .reverse(); // `unshift` inverse l'ordre : on renverse pour le retablir
      for (const p of portsTls) urls.unshift(`turns:${hote}:${p}?transport=tcp`);
      iceServers.push({ urls, username, credential });
    }

    return {
      iceServers,
      // Le client saura qu'il n'a que du STUN et pourra prévenir honnêtement que
      // l'appel peut échouer, au lieu de tourner dans le vide.
      relaisDisponible: Boolean(secret),
      // Le client sait ainsi s'il dispose d'un chemin qui traverse les reseaux
      // filtrants, et peut le dire au lieu de laisser l'appel echouer sans mot.
      relaisTls: Boolean(secret && process.env.TURN_TLS_PORT),
      expireDansSec: 3600,
    };
  }
}

// ── Le mur ─────────────────────────────────────────────────────────────────
// Toutes ces routes sont GARDEES : `req.user.uid` vient du jeton Firebase verifie,
// jamais du corps de la requete. Un client qui se declarerait quelqu'un d'autre
// n'irait nulle part.
@Controller('social/mur')
@UseGuards(FirebaseAuthGuard)
export class MurController {
  constructor(private mur: MurService) {}

  @Get()
  lire(@Req() req: any) {
    return this.mur.lire(String(req.user?.uid || '').toLowerCase());
  }

  @Post()
  publier(@Req() req: any, @Body() b: any) {
    return this.mur.publier(
      String(req.user?.uid || '').toLowerCase(),
      String(req.user?.name || ''),
      String(b?.texte || ''),
      String(b?.image || ''),
      String(b?.imageType || ''),
      String(b?.groupe || ''),
    );
  }

  @Delete(':id')
  async supprimer(@Req() req: any, @Param('id') id: string) {
    return { ok: await this.mur.supprimer(String(req.user?.uid || '').toLowerCase(), id) };
  }

  @Post(':id/signaler')
  async signaler(@Req() req: any, @Param('id') id: string) {
    return { ok: await this.mur.signaler(String(req.user?.uid || '').toLowerCase(), id) };
  }

  @Get('groupes')
  groupes(@Req() req: any) {
    return this.mur.listerGroupes(String(req.user?.uid || '').toLowerCase());
  }

  @Post('groupes')
  creerGroupe(@Req() req: any, @Body() b: any) {
    return this.mur.creerGroupe(
      String(req.user?.uid || '').toLowerCase(),
      String(b?.nom || ''),
      Array.isArray(b?.membres) ? b.membres : [],
    );
  }

  @Delete('groupes/:id')
  async supprimerGroupe(@Req() req: any, @Param('id') id: string) {
    return { ok: await this.mur.supprimerGroupe(String(req.user?.uid || '').toLowerCase(), id) };
  }
}
