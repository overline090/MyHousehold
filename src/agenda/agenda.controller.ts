import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { Right } from '@prisma/client';
import { RequireRight } from '../households/decorators/require-right.decorator';
import { HouseholdsService } from '../households/households.service';
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
@Controller('agenda')
export class AgendaController {
  constructor(
    private readonly agenda: AgendaService,
    private readonly households: HouseholdsService,
  ) {}

  @Get()
  @RequireRight(Right.VIEW)
  @ApiOperation({
    summary: 'Vue fusionnée : rendez-vous, tâches et compteurs à échéance',
  })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListAgendaDto) {
    return this.agenda.list(
      await this.households.currentId(),
      user.id,
      query.from,
      query.to,
    );
  }
}
