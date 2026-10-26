import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { RecurrenceForm, Weekdays } from '../recurrence-forms';

const FORMES = ['DAILY', 'WEEKDAYS', 'MONTH_DAYS', 'YEAR_DATES', 'EVERY_N'] as const;
const JOURS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

/**
 * Les cinq façons dont un foyer formule une répétition. L'interface ne
 * montre jamais une RRULE : elle propose ces formes, et le serveur les
 * traduit. La règle brute reste acceptée pour qui sait ce qu'il fait.
 *
 * La cohérence entre `form` et les champs qui l'accompagnent est
 * vérifiée à la traduction, où les messages peuvent être précis — « ces
 * dates ne tiennent pas dans une seule règle » en dit plus qu'un refus
 * de validation.
 */
export class RecurrenceDto {
  @ApiProperty({ enum: FORMES })
  @IsIn(FORMES)
  form!: (typeof FORMES)[number];

  @ApiPropertyOptional({
    description: 'DAILY et EVERY_N : tous les N jours, N semaines ou N mois.',
    minimum: 1,
    maximum: 366,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(366)
  interval?: number;

  @ApiPropertyOptional({ enum: ['WEEK', 'MONTH'], description: 'EVERY_N' })
  @IsOptional()
  @IsIn(['WEEK', 'MONTH'])
  unit?: 'WEEK' | 'MONTH';

  @ApiPropertyOptional({
    description:
      'WEEKDAYS : jours de la semaine (MO…SU). MONTH_DAYS : jours du mois, 1 à 31, ou −1 pour le dernier.',
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(31)
  days?: (string | number)[];

  @ApiPropertyOptional({ description: 'YEAR_DATES : dates en MM-JJ', isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  dates?: string[];
}

/**
 * Traduit le DTO plat en forme typée. Les jours de la semaine sont
 * validés ici : c'est le seul endroit où l'on sait qu'une chaîne venue
 * du réseau doit être l'un des sept.
 */
export function versForme(dto: RecurrenceDto): RecurrenceForm {
  switch (dto.form) {
    case 'DAILY':
      return { form: 'DAILY' as const, interval: dto.interval };
    case 'WEEKDAYS':
      return {
        form: 'WEEKDAYS' as const,
        days: (dto.days ?? []).map((jour) => jourValide(String(jour).toUpperCase())),
      };
    case 'MONTH_DAYS':
      return { form: 'MONTH_DAYS' as const, days: (dto.days ?? []).map(Number) };
    case 'YEAR_DATES':
      return { form: 'YEAR_DATES' as const, dates: dto.dates ?? [] };
    case 'EVERY_N':
      return {
        form: 'EVERY_N' as const,
        unit: dto.unit ?? 'WEEK',
        interval: dto.interval ?? 1,
      };
  }
}

function jourValide(jour: string): Weekdays {
  if (!(JOURS as readonly string[]).includes(jour)) {
    throw AppException.badRequest(
      ErrorCode.INVALID_RECURRENCE,
      'Un jour de la semaine s’écrit MO, TU, WE, TH, FR, SA ou SU.',
      { day: jour },
    );
  }
  return jour as Weekdays;
}

export { JOURS };
