import { Module } from '@nestjs/common';
import { HouseholdsController } from './households.controller';
import { HouseholdsService } from './households.service';
import { InvitesService } from './invites.service';
import { StatusesService } from './statuses.service';

@Module({
  controllers: [HouseholdsController],
  providers: [HouseholdsService, InvitesService, StatusesService],
  exports: [HouseholdsService, InvitesService, StatusesService],
})
export class HouseholdsModule {}
