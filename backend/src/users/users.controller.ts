import { Controller, Get, Param, Query } from '@nestjs/common';
import { UsersService } from './users.service';

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
