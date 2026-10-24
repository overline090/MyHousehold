import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HouseholdRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { RequireRole } from '../households/decorators/require-role.decorator';
import { HouseholdMemberGuard } from '../households/guards/household-member.guard';
import { ROLE_TO_COMPLETE, ROLE_TO_MANAGE_CONTENT } from '../households/roles';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListOccurrencesDto } from './dto/list-occurrences.dto';
import {
  CompleteOccurrenceDto,
  SkipOccurrenceDto,
  UpdateOccurrenceDto,
} from './dto/occurrence-actions.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { OccurrencesService } from './occurrences.service';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@Controller('households/:householdId')
@UseGuards(HouseholdMemberGuard)
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly occurrences: OccurrencesService,
  ) {}

  // ── Définitions ──────────────────────────────────────────────────────
  // Définir l'organisation du foyer est un acte d'adulte ; un enfant
  // complète ce qui lui est assigné sans redéfinir les règles.

  @Get('tasks')
  @ApiOperation({ summary: 'Tâches récurrentes du foyer' })
  findAll(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean,
  ) {
    return this.tasks.findAll(householdId, isActive);
  }

  @Post('tasks')
  @RequireRole(ROLE_TO_MANAGE_CONTENT)
  @ApiOperation({ summary: 'Créer une tâche récurrente' })
  create(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(householdId, user.id, dto);
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Détail d’une tâche et ses dix prochaines échéances' })
  findOne(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.tasks.findOne(householdId, taskId);
  }

  @Patch('tasks/:taskId')
  @RequireRole(ROLE_TO_MANAGE_CONTENT)
  @ApiOperation({
    summary: 'Modifier une tâche. Regénère les échéances futures en attente',
  })
  update(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(householdId, taskId, dto);
  }

  @Delete('tasks/:taskId')
  @RequireRole(ROLE_TO_MANAGE_CONTENT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une tâche en conservant son historique' })
  remove(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<void> {
    return this.tasks.remove(householdId, taskId);
  }

  // ── Occurrences ──────────────────────────────────────────────────────

  @Get('occurrences')
  @ApiOperation({ summary: 'Ce qu’il y a à faire, sur une fenêtre de jours' })
  list(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOccurrencesDto,
  ) {
    return this.occurrences.list(householdId, user.id, query);
  }

  // 200 et non 201 : cocher une tâche ne crée pas de ressource, c'est un
  // changement d'état. Le rejeu du même geste renvoie donc le même code
  // que le premier envoi, ce qui simplifie le client hors-ligne.
  @Post('occurrences/:occurrenceId/complete')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ROLE_TO_COMPLETE)
  @ApiOperation({ summary: 'Marquer faite' })
  complete(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('occurrenceId', ParseUUIDPipe) occurrenceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteOccurrenceDto,
  ) {
    return this.occurrences.complete(householdId, occurrenceId, user.id, dto);
  }

  @Post('occurrences/:occurrenceId/uncomplete')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ROLE_TO_COMPLETE)
  @ApiOperation({ summary: 'Décocher (48 heures)' })
  uncomplete(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('occurrenceId', ParseUUIDPipe) occurrenceId: string,
  ) {
    return this.occurrences.uncomplete(householdId, occurrenceId);
  }

  @Post('occurrences/:occurrenceId/skip')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ROLE_TO_COMPLETE)
  @ApiOperation({ summary: 'Passer son tour' })
  skip(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('occurrenceId', ParseUUIDPipe) occurrenceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SkipOccurrenceDto,
  ) {
    return this.occurrences.skip(householdId, occurrenceId, user.id, dto);
  }

  @Patch('occurrences/:occurrenceId')
  // Réassigner ou reporter touche à l'organisation du foyer, pas à
  // l'exécution d'une tâche : c'est un acte d'adulte.
  @RequireRole(HouseholdRole.ADULT)
  @ApiOperation({ summary: 'Réassigner, reporter, annoter' })
  updateOccurrence(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('occurrenceId', ParseUUIDPipe) occurrenceId: string,
    @Body() dto: UpdateOccurrenceDto,
  ) {
    return this.occurrences.update(householdId, occurrenceId, dto);
  }
}
