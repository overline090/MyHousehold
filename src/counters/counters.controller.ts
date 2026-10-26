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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Right } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRight } from '../households/decorators/require-right.decorator';
import { HouseholdsService } from '../households/households.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CountersService } from './counters.service';
import {
  CreateCounterDto,
  CreateCounterEventDto,
  ListCounterEventsDto,
  UpdateCounterDto,
} from './dto/counter.dto';

@ApiTags('counters')
@Controller('counters')
export class CountersController {
  constructor(
    private readonly counters: CountersService,
    private readonly households: HouseholdsService,
  ) {}

  @Get()
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Compteurs du foyer, avec leur état dérivé' })
  async findAll(
    @Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean,
  ) {
    return this.counters.findAll(
      await this.households.currentId(), isActive);
  }

  @Post()
  @RequireRight(Right.MANAGE_TASKS)
  @ApiOperation({ summary: 'Créer un compteur' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCounterDto,
  ) {
    return this.counters.create(
      await this.households.currentId(), user.id, dto);
  }

  @Get(':counterId')
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Détail d’un compteur et ses vingt derniers événements' })
  async findOne(
    @Param('counterId', ParseUUIDPipe) counterId: string,
  ) {
    return this.counters.findOne(
      await this.households.currentId(), counterId);
  }

  @Patch(':counterId')
  @RequireRight(Right.MANAGE_TASKS)
  @ApiOperation({ summary: 'Modifier un compteur' })
  async update(
    @Param('counterId', ParseUUIDPipe) counterId: string,
    @Body() dto: UpdateCounterDto,
  ) {
    return this.counters.update(
      await this.households.currentId(), counterId, dto);
  }

  @Delete(':counterId')
  @RequireRight(Right.MANAGE_TASKS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un compteur' })
  async remove(
    @Param('counterId', ParseUUIDPipe) counterId: string,
  ): Promise<void> {
    return this.counters.remove(
      await this.households.currentId(), counterId);
  }

  // Remettre à zéro, c'est faire l'action : un enfant en a le droit,
  // un invité non.
  @Post(':counterId/events')
  @HttpCode(HttpStatus.OK)
  @RequireRight(Right.COMPLETE_TASKS)
  @ApiOperation({ summary: 'Remettre le compteur à zéro' })
  async addEvent(
    @Param('counterId', ParseUUIDPipe) counterId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCounterEventDto,
  ) {
    return this.counters.addEvent(
      await this.households.currentId(), counterId, user.id, dto);
  }

  @Get(':counterId/events')
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Historique du compteur' })
  async listEvents(
    @Param('counterId', ParseUUIDPipe) counterId: string,
    @Query() query: ListCounterEventsDto,
  ) {
    return this.counters.listEvents(
      await this.households.currentId(), counterId, query);
  }

  @Delete(':counterId/events/:eventId')
  @RequireRight(Right.COMPLETE_TASKS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Corriger une saisie erronée' })
  async removeEvent(
    @Param('counterId', ParseUUIDPipe) counterId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<void> {
    return this.counters.removeEvent(
      await this.households.currentId(), counterId, eventId);
  }
}
