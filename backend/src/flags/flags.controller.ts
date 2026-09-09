import { Controller, Get, Post, UseGuards, Header } from '@nestjs/common';
import { FlagsService } from './flags.service';
import { AdminKeyGuard } from '../auth/admin-key.guard';

/**
 * `GET /flags` — la route que le mobile appelle depuis toujours.
 * ---------------------------------------------------------------------------
 * ⚠ CETTE ROUTE EST PUBLIQUE, ET ELLE DOIT LE RESTER.
 * Les flags sont lus AU DÉMARRAGE, avant tout écran de connexion : c'est eux
 * qui décident quelles tuiles s'affichent. Les protéger par un jeton Firebase
 * masquerait l'application entière tant que l'utilisateur n'est pas connecté.
 *
 * Ce qui transite n'est pas secret : ce sont des noms de fonctionnalités et des
 * booléens, tous déjà présents en clair dans l'APK. Le risque n'est donc pas la
 * lecture, c'est le COÛT — et il est borné par le cache Redis de 60 s : quel que
 * soit le nombre d'appelants, Firestore est lu au plus une fois par minute.
 *
 * L'invalidation, elle, est réservée à l'administration : elle force une lecture
 * Firestore, et l'exposer publiquement rendrait le cache contournable à volonté.
 */
@Controller('flags')
export class FlagsController {
  constructor(private readonly flags: FlagsService) {}

  // `no-store` : la réponse porte déjà sa propre fraîcheur côté serveur (60 s
  // dans Redis). Laisser un CDN ou un proxy la garder plus longtemps ajouterait
  // un second cache non invalidable, et un basculement admin deviendrait
  // impossible à propager.
  @Get()
  @Header('Cache-Control', 'no-store')
  lire() {
    return this.flags.lire();
  }

  @Post('invalidate')
  @UseGuards(AdminKeyGuard)
  async invalider() {
    await this.flags.invalider();
    return { ok: true };
  }
}
