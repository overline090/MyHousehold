import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HouseholdsModule } from '../households/households.module';
import { AvatarsService } from './avatars.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [UsersController],
  providers: [UsersService, AvatarsService],
  exports: [UsersService, AvatarsService],
})
export class UsersModule {}
