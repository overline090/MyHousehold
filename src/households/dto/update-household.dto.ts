import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';
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

  @ApiPropertyOptional({ description: 'Inscriptions libres, sans code d’invitation.' })
  @IsOptional()
  @IsBoolean()
  registrationOpen?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 720, description: 'Durée d’un code d’invitation, en heures.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  inviteTtlHours?: number;

  @ApiPropertyOptional({
    type: DetectionDto,
    description: 'Ce que les détails des tâches reconnaissent. Ce qui est envoyé remplace, ce qui manque est gardé.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DetectionDto)
  detection?: DetectionDto;
}
