import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Right } from '@prisma/client';
import { RequireRight } from '../households/decorators/require-right.decorator';
import { HouseholdsService } from '../households/households.service';
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
@Controller('activity')
export class ActivityController {
  constructor(
    private readonly activity: ActivityService,
    private readonly households: HouseholdsService,
  ) {}

  @Get()
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Fil d’activité du foyer' })
  async list(@Query() query: ListActivityDto) {
    return this.activity.list(
      await this.households.currentId(),
      query.limit ?? 50,
      query.cursor,
    );
  }
}
