import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AssignmentMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateCounterDto {
  @ApiPropertyOptional({
    description: 'UUID généré par le client : rend la création idempotente.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Changer les draps' })
  @IsString()
  @Length(1, 120)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @ApiPropertyOptional({ example: 'chambre' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  category?: string;

  @ApiPropertyOptional({
    description:
      'Intervalle cible en secondes (1209600 = 14 jours). Absent : le compteur ne fait que compter, sans notion de retard.',
    example: 1209600,
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(315_360_000)
  targetIntervalSeconds?: number;

  @ApiPropertyOptional({
    description: "Fraction de l'intervalle à partir de laquelle on prévient.",
    default: 0.8,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1)
  warnRatio?: number;

  @ApiPropertyOptional({ enum: AssignmentMode, default: AssignmentMode.ANYONE })
  @IsOptional()
  @IsEnum(AssignmentMode)
  assignmentMode?: AssignmentMode;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCounterDto extends PartialType(CreateCounterDto) {}

export class CreateCounterEventDto {
  @ApiPropertyOptional({
    description:
      'UUID généré par le client. Un double tap ou un rejeu hors-ligne ne crée pas deux événements.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({
    description:
      "Quand l'action a été faite, si ce n'est pas maintenant. Ne peut pas être dans le futur.",
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}

export class ListCounterEventsDto {
  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Identifiant du dernier événement de la page précédente.',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
