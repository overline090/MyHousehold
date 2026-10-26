import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentMode, TaskKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { RecurrenceDto } from './recurrence.dto';

/**
 * Une seule ressource pour les trois façons d'être due. C'est le `kind`
 * qui change, pas l'endpoint : le foyer ne vit qu'une liste de choses à
 * faire.
 */
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

  @ApiPropertyOptional({ enum: TaskKind, default: TaskKind.SCHEDULED })
  @IsOptional()
  @IsEnum(TaskKind)
  kind?: TaskKind;

  @ApiPropertyOptional({ description: 'Groupe de tâches. Une tâche en a un au plus.' })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @ApiPropertyOptional({
    description:
      'De +3 (urgente) à −3 (en dernier), 0 = normale. Une priorité négative n’est pas une tâche sans importance : c’est une tâche qui cède le passage.',
    default: 0,
    minimum: -3,
    maximum: 3,
  })
  @IsOptional()
  @IsInt()
  @Min(-3)
  @Max(3)
  priority?: number;

  // ── Tâche récurrente ───────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'SCHEDULED : la répétition, dans l’une des cinq formes. Traduite en RRULE par le serveur.',
    type: RecurrenceDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto;

  @ApiPropertyOptional({
    description:
      'SCHEDULED : RRULE RFC 5545 sans le préfixe « RRULE: », pour qui sait ce qu’il fait. `recurrence` suffit dans tous les autres cas.',
    example: 'FREQ=WEEKLY;BYDAY=MO',
  })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  rrule?: string;

  @ApiPropertyOptional({
    description: "SCHEDULED : heure locale d'échéance. Absente = toute la journée.",
    example: '19:00',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'dueTime doit être au format HH:mm.',
  })
  dueTime?: string;

  @ApiPropertyOptional({
    description: "SCHEDULED : délai après l'échéance avant de marquer la tâche manquée.",
    default: 24,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  graceHours?: number;

  // ── Tâche de fond ──────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'BACKGROUND : délai maximum entre deux fois, en secondes. Absent = la tâche compte le temps sans jamais être en retard.',
    example: 1209600,
  })
  @IsOptional()
  @IsInt()
  @Min(3600)
  @Max(10 * 365 * 24 * 3600)
  maxIntervalSeconds?: number;

  @ApiPropertyOptional({
    description: 'BACKGROUND : fraction du délai à partir de laquelle on prévient.',
    default: 0.8,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1)
  warnRatio?: number;

  // ── Tâche ponctuelle ───────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'ONE_OFF : date limite, facultative. « Sans date limite » est un choix normal.',
    example: '2026-11-15',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  dueDate?: string;

  // ── Commun ─────────────────────────────────────────────────────────

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
