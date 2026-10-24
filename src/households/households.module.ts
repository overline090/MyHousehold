import { Module } from '@nestjs/common';
import { HouseholdMemberGuard } from './guards/household-member.guard';
import { HouseholdsController } from './households.controller';
import { HouseholdsService } from './households.service';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { MembershipCacheService } from './membership-cache.service';

@Module({
  controllers: [HouseholdsController, InvitesController],
  providers: [
    HouseholdsService,
    InvitesService,
    HouseholdMemberGuard,
    MembershipCacheService,
  ],
  exports: [HouseholdsService, HouseholdMemberGuard, MembershipCacheService],
})
export class HouseholdsModule {}
