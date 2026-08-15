import { Controller, Get, UseGuards, Req } from '@nestjs/common';
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
      // L'IP passe en TETE : elle marche aujourd'hui, le nom marchera quand le DNS
      // sera pose. L'ordre compte — un client presse s'arrete au premier qui repond.
      if (ip) urls.unshift(`turn:${ip}:3478?transport=udp`, `turn:${ip}:3478?transport=tcp`);
      iceServers.push({ urls, username, credential });
    }

    return {
      iceServers,
      // Le client saura qu'il n'a que du STUN et pourra prévenir honnêtement que
      // l'appel peut échouer, au lieu de tourner dans le vide.
      relaisDisponible: Boolean(secret),
      expireDansSec: 3600,
    };
  }
}
