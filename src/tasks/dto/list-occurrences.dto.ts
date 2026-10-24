import { ApiPropertyOptional } from '@nestjs/swagger';
import { OccurrenceStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListOccurrencesDto {
  @ApiPropertyOptional({
    description: 'Jour de début, YYYY-MM-DD (défaut : aujourd’hui)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'Jour de fin, YYYY-MM-DD (défaut : dans 7 jours)' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @ApiPropertyOptional({
    description: "Identifiant d'un membre, ou « me » pour soi-même.",
  })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ enum: OccurrenceStatus })
  @IsOptional()
  @IsEnum(OccurrenceStatus)
  status?: OccurrenceStatus;

  @ApiPropertyOptional({ default: 100, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
