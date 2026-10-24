import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AppointmentVisibility, AttendeeResponse } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateAppointmentDto {
  @ApiPropertyOptional({
    description: 'UUID généré par le client : rend la création idempotente.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Dentiste — Lou' })
  @IsString()
  @Length(1, 160)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @ApiPropertyOptional({ example: 'Cabinet du docteur Martin' })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  location?: string;

  @ApiProperty({ example: '2026-11-03T15:30:00Z' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ example: '2026-11-03T16:15:00Z' })
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional({
    description: 'Journée entière : l’heure est ignorée.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @ApiPropertyOptional({ description: 'RRULE RFC 5545, pour un rendez-vous récurrent.' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  rrule?: string;

  @ApiPropertyOptional({
    enum: AppointmentVisibility,
    default: AppointmentVisibility.HOUSEHOLD,
  })
  @IsOptional()
  @IsEnum(AppointmentVisibility)
  visibility?: AppointmentVisibility;

  @ApiPropertyOptional({ type: [String], description: 'Membres concernés.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  // UUID v7 comme partout ailleurs : ne pas contraindre la version.
  @IsUUID(undefined, { each: true })
  attendees?: string[];
}

export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto) {}

export class RespondDto {
  @ApiProperty({ enum: AttendeeResponse })
  @IsEnum(AttendeeResponse)
  response!: AttendeeResponse;
}

export class ListAppointmentsDto {
  @ApiProperty({ description: 'Début de la fenêtre, YYYY-MM-DD', example: '2026-11-01' })
  @IsDateString({ strict: true })
  from!: string;

  @ApiProperty({ description: 'Fin de la fenêtre, YYYY-MM-DD', example: '2026-11-30' })
  @IsDateString({ strict: true })
  to!: string;
}
