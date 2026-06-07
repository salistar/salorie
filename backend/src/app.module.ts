import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { FirebaseService } from './firebase.service';
import { RedisService } from './redis.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { FilesController } from './files/files.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGO_URI || 'mongodb://localhost:27017/salorie'),
  ],
  controllers: [HealthController, UsersController, FilesController],
  providers: [FirebaseService, RedisService, UsersService],
})
export class AppModule {}
