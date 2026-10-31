import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DetectionDto } from './detection.dto';

export class UpdateHouseholdDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weekStartsOn?: number;

  @ApiPropertyOptional({
    type: DetectionDto,
    description: 'Ce que les détails des tâches reconnaissent. Ce qui est envoyé remplace, ce qui manque est gardé.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DetectionDto)
  detection?: DetectionDto;
}
