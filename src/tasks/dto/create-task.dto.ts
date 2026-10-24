import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentMode } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateTaskDto {
  @ApiPropertyOptional({
    description:
      'UUID généré par le client. Rend la création idempotente : un envoi rejoué ne crée pas une seconde tâche.',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'Sortir les poubelles' })
  @IsString()
  @Length(1, 120)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @ApiPropertyOptional({ example: 'cuisine' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  category?: string;

  @ApiProperty({
    description: 'RRULE RFC 5545 sans le préfixe « RRULE: ». Au maximum quotidienne.',
    example: 'FREQ=WEEKLY;BYDAY=MO',
  })
  @IsString()
  @Length(1, 500)
  rrule!: string;

  @ApiPropertyOptional({
    description: "Heure locale d'échéance. Absente = toute la journée.",
    example: '19:00',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'dueTime doit être au format HH:mm.',
  })
  dueTime?: string;

  @ApiPropertyOptional({ description: 'Estimation, pour équilibrer la charge' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;

  @ApiPropertyOptional({ enum: AssignmentMode, default: AssignmentMode.ANYONE })
  @IsOptional()
  @IsEnum(AssignmentMode)
  assignmentMode?: AssignmentMode;

  @ApiPropertyOptional({
    description:
      "Membres concernés. Aucun pour ANYONE, exactement un pour FIXED, au moins deux pour ROTATION (dans l'ordre du tour).",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  assignees?: string[];

  @ApiPropertyOptional({
    description: "Délai après l'échéance avant de marquer la tâche manquée.",
    default: 24,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  graceHours?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  points?: number;

  @ApiPropertyOptional({ description: 'Premier jour possible, YYYY-MM-DD' })
  @IsOptional()
  @IsDateString({ strict: true })
  startsOn?: string;

  @ApiPropertyOptional({ description: 'Dernier jour possible, YYYY-MM-DD' })
  @IsOptional()
  @IsDateString({ strict: true })
  endsOn?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
