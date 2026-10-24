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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { RequireRole } from '../households/decorators/require-role.decorator';
import { HouseholdMemberGuard } from '../households/guards/household-member.guard';
import { ROLE_TO_COMPLETE, ROLE_TO_MANAGE_CONTENT } from '../households/roles';
import { CountersService } from './counters.service';
import {
  CreateCounterDto,
  CreateCounterEventDto,
  ListCounterEventsDto,
  UpdateCounterDto,
} from './dto/counter.dto';

@ApiTags('counters')
@Controller('households/:householdId/counters')
@UseGuards(HouseholdMemberGuard)
export class CountersController {
  constructor(private readonly counters: CountersService) {}

  @Get()
  @ApiOperation({ summary: 'Compteurs du foyer, avec leur état dérivé' })
  findAll(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean,
  ) {
    return this.counters.findAll(householdId, isActive);
  }

  @Post()
  @RequireRole(ROLE_TO_MANAGE_CONTENT)
  @ApiOperation({ summary: 'Créer un compteur' })
  create(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCounterDto,
  ) {
    return this.counters.create(householdId, user.id, dto);
  }

  @Get(':counterId')
  @ApiOperation({ summary: 'Détail d’un compteur et ses vingt derniers événements' })
  findOne(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('counterId', ParseUUIDPipe) counterId: string,
  ) {
    return this.counters.findOne(householdId, counterId);
  }

  @Patch(':counterId')
  @RequireRole(ROLE_TO_MANAGE_CONTENT)
  @ApiOperation({ summary: 'Modifier un compteur' })
  update(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('counterId', ParseUUIDPipe) counterId: string,
    @Body() dto: UpdateCounterDto,
  ) {
    return this.counters.update(householdId, counterId, dto);
  }

  @Delete(':counterId')
  @RequireRole(ROLE_TO_MANAGE_CONTENT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un compteur' })
  remove(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('counterId', ParseUUIDPipe) counterId: string,
  ): Promise<void> {
    return this.counters.remove(householdId, counterId);
  }

  // Remettre à zéro, c'est faire l'action : un enfant en a le droit,
  // un invité non.
  @Post(':counterId/events')
  @HttpCode(HttpStatus.OK)
  @RequireRole(ROLE_TO_COMPLETE)
  @ApiOperation({ summary: 'Remettre le compteur à zéro' })
  addEvent(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('counterId', ParseUUIDPipe) counterId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCounterEventDto,
  ) {
    return this.counters.addEvent(householdId, counterId, user.id, dto);
  }

  @Get(':counterId/events')
  @ApiOperation({ summary: 'Historique du compteur' })
  listEvents(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('counterId', ParseUUIDPipe) counterId: string,
    @Query() query: ListCounterEventsDto,
  ) {
    return this.counters.listEvents(householdId, counterId, query);
  }

  @Delete(':counterId/events/:eventId')
  @RequireRole(ROLE_TO_COMPLETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Corriger une saisie erronée' })
  removeEvent(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('counterId', ParseUUIDPipe) counterId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<void> {
    return this.counters.removeEvent(householdId, counterId, eventId);
  }
}
