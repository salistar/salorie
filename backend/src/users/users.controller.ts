import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { AdminKeyGuard } from '../auth/admin-key.guard';

@UseGuards(AdminKeyGuard) // fix IDOR : dump utilisateurs reserve au super-admin (X-Admin-Key)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  list(@Query('max') max?: string) {
    return this.users.list(max ? parseInt(max, 10) : 200);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.users.get(id);
  }
}
