import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SetupPairingPurpose } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreatePairingDto {
  @ApiProperty({ enum: SetupPairingPurpose })
  @IsEnum(SetupPairingPurpose)
  purpose!: SetupPairingPurpose;
}

export class SkipStepDto {
  @ApiProperty({ enum: ['network', 'import'] })
  @IsIn(['network', 'import'])
  step!: 'network' | 'import';
}

export class SetupHouseholdDto {
  @ApiProperty({ example: 'Maison des Dupont' })
  @IsString()
  @Length(1, 80)
  name!: string;
}

export class ClaimDto {
  @ApiProperty({ description: "Code d'appariement affiché par l'assistant." })
  @IsString()
  @Length(4, 20)
  code!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'Le mot de passe doit faire au moins 10 caractères.' })
  @MaxLength(256)
  password!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 60)
  displayName!: string;
}

export class ImportedTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty()
  @IsString()
  @Length(1, 120)
  title!: string;

  @ApiProperty({ example: 'FREQ=WEEKLY;BYDAY=MO' })
  @IsString()
  @Length(1, 500)
  rrule!: string;

  @ApiPropertyOptional({ example: '19:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  dueTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  points?: number;
}

export class ImportedCounterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty()
  @IsString()
  @Length(1, 120)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(60)
  targetIntervalSeconds?: number;
}

export class ImportedAppointmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty()
  @IsString()
  @Length(1, 160)
  title!: string;

  @ApiProperty()
  @IsDateString()
  startAt!: string;

  @ApiProperty()
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  rrule?: string;
}

export class ImportDto {
  @ApiProperty({ description: "Code d'appariement de type IMPORT." })
  @IsString()
  @Length(4, 20)
  code!: string;

  @ApiProperty({ example: 'Maison des Dupont' })
  @IsString()
  @Length(1, 80)
  householdName!: string;

  @ApiPropertyOptional({ example: 'Europe/Paris' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ type: [ImportedTaskDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportedTaskDto)
  tasks?: ImportedTaskDto[];

  @ApiPropertyOptional({ type: [ImportedCounterDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportedCounterDto)
  counters?: ImportedCounterDto[];

  @ApiPropertyOptional({ type: [ImportedAppointmentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportedAppointmentDto)
  appointments?: ImportedAppointmentDto[];
}
