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
import { RequireRight } from '../households/decorators/require-right.decorator';
import { HouseholdsService } from '../households/households.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateTaskGroupDto, UpdateTaskGroupDto } from './dto/task-group.dto';
import { ListOccurrencesDto } from './dto/list-occurrences.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { MarkDoneDto } from './dto/mark-done.dto';
import {
  CompleteOccurrenceDto,
  SkipOccurrenceDto,
  UpdateOccurrenceDto,
} from './dto/occurrence-actions.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { OccurrencesService } from './occurrences.service';
import { TaskGroupsService } from './task-groups.service';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@Controller()
export class TasksController {
  constructor(
    private readonly households: HouseholdsService,
    private readonly tasks: TasksService,
    private readonly occurrences: OccurrencesService,
    private readonly groups: TaskGroupsService,
  ) {}

  // ── Définitions ──────────────────────────────────────────────────────
  // Tout est une tâche : récurrente, de fond ou ponctuelle. C'est le
  // `kind` qui change, pas l'endpoint — le foyer ne vit qu'une liste de
  // choses à faire.

  @Get('tasks')
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Tâches du foyer, tous types confondus' })
  async findAll(@Query() query: ListTasksDto) {
    return this.tasks.findAll(await this.households.currentId(), query);
  }

  @Post('tasks')
  @RequireRight(Right.MANAGE_TASKS)
  @ApiOperation({ summary: 'Créer une tâche' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(
      await this.households.currentId(), user.id, dto);
  }

  @Get('tasks/:taskId')
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Détail d’une tâche et ses dix prochaines échéances' })
  async findOne(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.tasks.findOne(
      await this.households.currentId(), taskId);
  }

  @Patch('tasks/:taskId')
  @RequireRight(Right.MANAGE_TASKS)
  @ApiOperation({
    summary: 'Modifier une tâche. Regénère les échéances futures en attente',
  })
  async update(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(
      await this.households.currentId(), taskId, dto);
  }

  @Delete('tasks/:taskId')
  @RequireRight(Right.MANAGE_TASKS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une tâche en conservant son historique' })
  async remove(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<void> {
    return this.tasks.remove(
      await this.households.currentId(), taskId);
  }

  // 201 : déclarer une tâche de fond faite crée bien une entrée au
  // journal, celle qui fait repartir le temps écoulé de zéro.
  @Post('tasks/:taskId/done')
  @RequireRight(Right.COMPLETE_TASKS)
  @ApiOperation({ summary: 'Déclarer une tâche de fond faite' })
  async markDone(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkDoneDto,
  ) {
    return this.tasks.markDone(
      await this.households.currentId(),
      taskId,
      user.id,
      dto,
    );
  }

  // ── Groupes ──────────────────────────────────────────────────────────

  @Get('task-groups')
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Groupes de tâches' })
  async findAllGroups() {
    return this.groups.findAll(await this.households.currentId());
  }

  @Post('task-groups')
  @RequireRight(Right.MANAGE_TASKS)
  @ApiOperation({ summary: 'Créer un groupe de tâches' })
  async createGroup(@Body() dto: CreateTaskGroupDto) {
    return this.groups.create(await this.households.currentId(), dto);
  }

  @Patch('task-groups/:groupId')
  @RequireRight(Right.MANAGE_TASKS)
  @ApiOperation({ summary: 'Modifier un groupe de tâches' })
  async updateGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateTaskGroupDto,
  ) {
    return this.groups.update(await this.households.currentId(), groupId, dto);
  }

  @Delete('task-groups/:groupId')
  @RequireRight(Right.MANAGE_TASKS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprimer un groupe. Ses tâches sont détachées, pas supprimées',
  })
  async removeGroup(@Param('groupId', ParseUUIDPipe) groupId: string): Promise<void> {
    return this.groups.remove(await this.households.currentId(), groupId);
  }

  // ── Occurrences ──────────────────────────────────────────────────────

  @Get('occurrences')
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Ce qu’il y a à faire, sur une fenêtre de jours' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOccurrencesDto,
  ) {
    return this.occurrences.list(
      await this.households.currentId(), user.id, query);
  }

  // 200 et non 201 : cocher une tâche ne crée pas de ressource, c'est un
  // changement d'état. Le rejeu du même geste renvoie donc le même code
  // que le premier envoi, ce qui simplifie le client hors-ligne.
  @Post('occurrences/:occurrenceId/complete')
  @HttpCode(HttpStatus.OK)
  @RequireRight(Right.COMPLETE_TASKS)
  @ApiOperation({ summary: 'Marquer faite' })
  async complete(
    @Param('occurrenceId', ParseUUIDPipe) occurrenceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteOccurrenceDto,
  ) {
    return this.occurrences.complete(
      await this.households.currentId(), occurrenceId, user.id, dto);
  }

  @Post('occurrences/:occurrenceId/uncomplete')
  @HttpCode(HttpStatus.OK)
  @RequireRight(Right.COMPLETE_TASKS)
  @ApiOperation({ summary: 'Décocher (48 heures)' })
  async uncomplete(
    @Param('occurrenceId', ParseUUIDPipe) occurrenceId: string,
  ) {
    return this.occurrences.uncomplete(
      await this.households.currentId(), occurrenceId);
  }

  @Post('occurrences/:occurrenceId/skip')
  @HttpCode(HttpStatus.OK)
  @RequireRight(Right.COMPLETE_TASKS)
  @ApiOperation({ summary: 'Passer son tour' })
  async skip(
    @Param('occurrenceId', ParseUUIDPipe) occurrenceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SkipOccurrenceDto,
  ) {
    return this.occurrences.skip(
      await this.households.currentId(), occurrenceId, user.id, dto);
  }

  @Patch('occurrences/:occurrenceId')
  // Réassigner ou reporter touche à l'organisation du foyer, pas à
  // l'exécution d'une tâche : c'est un acte d'adulte.
  @RequireRight(Right.MANAGE_TASKS)
  @ApiOperation({ summary: 'Réassigner, reporter, annoter' })
  async updateOccurrence(
    @Param('occurrenceId', ParseUUIDPipe) occurrenceId: string,
    @Body() dto: UpdateOccurrenceDto,
  ) {
    return this.occurrences.update(
      await this.households.currentId(), occurrenceId, dto);
  }
}
