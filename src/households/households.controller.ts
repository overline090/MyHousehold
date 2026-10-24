import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HouseholdRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { RequireRole } from './decorators/require-role.decorator';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { UpdateHouseholdDto } from './dto/update-household.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { HouseholdMemberGuard } from './guards/household-member.guard';
import { HouseholdsService } from './households.service';
import { InvitesService } from './invites.service';

@ApiTags('households')
@Controller('households')
export class HouseholdsController {
  constructor(
    private readonly households: HouseholdsService,
    private readonly invites: InvitesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Créer un foyer (on en devient propriétaire)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateHouseholdDto) {
    return this.households.create(user.id, dto);
  }

  @Get(':householdId')
  @UseGuards(HouseholdMemberGuard)
  @ApiOperation({ summary: 'Détail du foyer' })
  findOne(@Param('householdId', ParseUUIDPipe) householdId: string) {
    return this.households.findOne(householdId);
  }

  @Patch(':householdId')
  @UseGuards(HouseholdMemberGuard)
  @RequireRole(HouseholdRole.OWNER)
  @ApiOperation({ summary: 'Modifier le foyer' })
  update(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Body() dto: UpdateHouseholdDto,
  ) {
    return this.households.update(householdId, dto);
  }

  @Delete(':householdId')
  @UseGuards(HouseholdMemberGuard)
  @RequireRole(HouseholdRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer le foyer' })
  remove(@Param('householdId', ParseUUIDPipe) householdId: string): Promise<void> {
    return this.households.remove(householdId);
  }

  @Get(':householdId/members')
  @UseGuards(HouseholdMemberGuard)
  @ApiOperation({ summary: 'Membres du foyer' })
  members(@Param('householdId', ParseUUIDPipe) householdId: string) {
    return this.households.members(householdId);
  }

  @Patch(':householdId/members/:userId')
  @UseGuards(HouseholdMemberGuard)
  @RequireRole(HouseholdRole.OWNER)
  @ApiOperation({ summary: "Changer le rôle ou le surnom d'un membre" })
  updateMember(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.households.updateMember(householdId, userId, actor.id, dto);
  }

  @Post(':householdId/invites')
  @UseGuards(HouseholdMemberGuard)
  @RequireRole(HouseholdRole.OWNER)
  @ApiOperation({ summary: "Créer un code d'invitation" })
  createInvite(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invites.create(householdId, user.id, dto);
  }

  @Get(':householdId/invites')
  @UseGuards(HouseholdMemberGuard)
  @RequireRole(HouseholdRole.OWNER)
  @ApiOperation({ summary: 'Codes d’invitation actifs' })
  listInvites(@Param('householdId', ParseUUIDPipe) householdId: string) {
    return this.invites.list(householdId);
  }
}
