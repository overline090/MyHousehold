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
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  ListAppointmentsDto,
  RespondDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly households: HouseholdsService,
  ) {}

  @Get()
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Rendez-vous d’une fenêtre, récurrences déroulées' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAppointmentsDto,
  ) {
    return this.appointments.list(
      await this.households.currentId(), user.id, query.from, query.to);
  }

  @Post()
  @RequireRight(Right.MANAGE_APPOINTMENTS)
  @ApiOperation({ summary: 'Créer un rendez-vous' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointments.create(
      await this.households.currentId(), user.id, dto);
  }

  @Get(':appointmentId')
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Détail d’un rendez-vous' })
  async findOne(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointments.findOne(
      await this.households.currentId(), appointmentId, user.id);
  }

  @Patch(':appointmentId')
  @RequireRight(Right.MANAGE_APPOINTMENTS)
  @ApiOperation({ summary: 'Modifier un rendez-vous' })
  async update(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointments.update(
      await this.households.currentId(), appointmentId, user.id, dto);
  }

  @Delete(':appointmentId')
  @RequireRight(Right.MANAGE_APPOINTMENTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un rendez-vous' })
  async remove(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.appointments.remove(
      await this.households.currentId(), appointmentId, user.id);
  }

  // Répondre ne demande pas d'être adulte : on répond pour soi, et un
  // enfant invité chez le dentiste peut dire qu'il a vu le rendez-vous.
  @Post(':appointmentId/respond')
  @RequireRight(Right.VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Répondre à une invitation' })
  async respond(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RespondDto,
  ) {
    return this.appointments.respond(
      await this.households.currentId(), appointmentId, user.id, dto);
  }
}
