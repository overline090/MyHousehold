import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { HouseholdMemberGuard } from '../households/guards/household-member.guard';
import { ActivityService } from './activity.service';

export class ListActivityDto {
  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Identifiant de la dernière entrée de la page précédente.',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

@ApiTags('activity')
@Controller('households/:householdId/activity')
@UseGuards(HouseholdMemberGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @ApiOperation({ summary: 'Fil d’activité du foyer' })
  list(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Query() query: ListActivityDto,
  ) {
    return this.activity.list(householdId, query.limit ?? 50, query.cursor);
  }
}
