import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { HouseholdMemberGuard } from '../households/guards/household-member.guard';
import { AgendaService } from './agenda.service';

export class ListAgendaDto {
  @ApiProperty({ example: '2026-11-01' })
  @IsDateString({ strict: true })
  from!: string;

  @ApiProperty({ example: '2026-11-07' })
  @IsDateString({ strict: true })
  to!: string;
}

@ApiTags('agenda')
@Controller('households/:householdId/agenda')
@UseGuards(HouseholdMemberGuard)
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  @ApiOperation({
    summary: 'Vue fusionnée : rendez-vous, tâches et compteurs à échéance',
  })
  list(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAgendaDto,
  ) {
    return this.agenda.list(householdId, user.id, query.from, query.to);
  }
}
