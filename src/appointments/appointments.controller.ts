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
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { RequireRole } from '../households/decorators/require-role.decorator';
import { HouseholdMemberGuard } from '../households/guards/household-member.guard';
import { ROLE_TO_MANAGE_CONTENT } from '../households/roles';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  ListAppointmentsDto,
  RespondDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';

@ApiTags('appointments')
@Controller('households/:householdId/appointments')
@UseGuards(HouseholdMemberGuard)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Rendez-vous d’une fenêtre, récurrences déroulées' })
  list(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAppointmentsDto,
  ) {
    return this.appointments.list(householdId, user.id, query.from, query.to);
  }

  @Post()
  @RequireRole(ROLE_TO_MANAGE_CONTENT)
  @ApiOperation({ summary: 'Créer un rendez-vous' })
  create(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointments.create(householdId, user.id, dto);
  }

  @Get(':appointmentId')
  @ApiOperation({ summary: 'Détail d’un rendez-vous' })
  findOne(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointments.findOne(householdId, appointmentId, user.id);
  }

  @Patch(':appointmentId')
  @RequireRole(ROLE_TO_MANAGE_CONTENT)
  @ApiOperation({ summary: 'Modifier un rendez-vous' })
  update(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointments.update(householdId, appointmentId, user.id, dto);
  }

  @Delete(':appointmentId')
  @RequireRole(ROLE_TO_MANAGE_CONTENT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un rendez-vous' })
  remove(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.appointments.remove(householdId, appointmentId, user.id);
  }

  // Répondre ne demande pas d'être adulte : on répond pour soi, et un
  // enfant invité chez le dentiste peut dire qu'il a vu le rendez-vous.
  @Post(':appointmentId/respond')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Répondre à une invitation' })
  respond(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RespondDto,
  ) {
    return this.appointments.respond(householdId, appointmentId, user.id, dto);
  }
}
