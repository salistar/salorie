import { Controller, Delete, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { AccountService } from './account.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

/**
 * Suppression de compte. L'identité vient du JETON, jamais d'un paramètre : sinon la
 * route permettrait d'effacer le compte de n'importe qui avec un jeton valide — c'est
 * exactement la classe de faille (IDOR) déjà corrigée sur /users/:id.
 *
 * Aucun paramètre n'est accepté, précisément pour qu'il n'y ait rien à falsifier.
 */
@UseGuards(FirebaseAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private account: AccountService) {}

  @Delete()
  remove(@Req() req: any) {
    const u = req?.user || {};
    const id = String(u.email || u.uid || '').trim().toLowerCase();
    if (!id) throw new BadRequestException('Utilisateur inconnu');
    return this.account.deleteAccount(id);
  }
}
