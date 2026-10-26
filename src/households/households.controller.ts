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
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Right } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { RequireRight } from './decorators/require-right.decorator';
import { CreateInviteDto } from './dto/create-invite.dto';
import { CreateStatusDto, DeleteStatusDto, UpdateStatusDto } from './dto/status.dto';
import { UpdateHouseholdDto } from './dto/update-household.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { HouseholdsService } from './households.service';
import { InvitesService } from './invites.service';
import { StatusesService } from './statuses.service';

/**
 * Un serveur sert un seul foyer : aucune route ne porte son
 * identifiant, et il n'y a pas de route pour en créer un second — c'est
 * l'assistant d'installation qui crée le seul qui existera.
 */
@ApiTags('household')
@Controller()
export class HouseholdsController {
  constructor(
    private readonly households: HouseholdsService,
    private readonly invites: InvitesService,
    private readonly statuses: StatusesService,
  ) {}

  @Get('household')
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Le foyer' })
  describe() {
    return this.households.describe();
  }

  @Patch('household')
  @RequireRight(Right.MANAGE_SERVER)
  @ApiOperation({ summary: 'Nom, fuseau, premier jour de la semaine' })
  update(@Body() dto: UpdateHouseholdDto) {
    return this.households.update(dto);
  }

  @Get('members')
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Membres du foyer' })
  members() {
    return this.households.members();
  }

  @Patch('members/:userId')
  @RequireRight(Right.MANAGE_MEMBERS)
  @ApiOperation({ summary: "Changer le statut d'un membre" })
  updateMember(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.households.updateMember(userId, actor.id, dto);
  }

  // ── Statuts ────────────────────────────────────────────────────────

  @Get('statuses')
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Statuts du foyer et leurs droits' })
  listStatuses() {
    return this.statuses.list();
  }

  @Post('statuses')
  @RequireRight(Right.MANAGE_STATUSES)
  @ApiOperation({ summary: 'Créer un statut (interface web)' })
  createStatus(@Body() dto: CreateStatusDto) {
    return this.statuses.create(dto);
  }

  @Patch('statuses/:id')
  @RequireRight(Right.MANAGE_STATUSES)
  @ApiOperation({ summary: 'Modifier un statut (interface web)' })
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStatusDto) {
    return this.statuses.update(id, dto);
  }

  @Delete('statuses/:id')
  @RequireRight(Right.MANAGE_STATUSES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un statut (interface web)' })
  removeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: DeleteStatusDto,
  ): Promise<void> {
    return this.statuses.remove(id, dto);
  }

  // ── Invitations ────────────────────────────────────────────────────

  @Post('invites')
  @RequireRight(Right.MANAGE_MEMBERS)
  @ApiOperation({ summary: "Créer un code d'invitation" })
  createInvite(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInviteDto) {
    return this.invites.create(user.id, dto);
  }

  @Get('invites')
  @RequireRight(Right.MANAGE_MEMBERS)
  @ApiOperation({ summary: 'Codes d’invitation actifs' })
  listInvites() {
    return this.invites.list();
  }

  @Delete('invites/:id')
  @RequireRight(Right.MANAGE_MEMBERS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Révoquer un code' })
  revokeInvite(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.invites.revoke(id);
  }
}
