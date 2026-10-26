import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Right } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateStatusDto {
  @ApiPropertyOptional({ description: 'UUID généré par le client' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Colocataire' })
  @IsString()
  @Length(1, 40)
  name!: string;

  @ApiProperty({ enum: Right, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsEnum(Right, { each: true })
  rights!: Right[];

  @ApiPropertyOptional({ description: 'Statut donné aux nouveaux membres' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  position?: number;
}

export class UpdateStatusDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 40)
  name?: string;

  @ApiPropertyOptional({ enum: Right, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Right, { each: true })
  rights?: Right[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  position?: number;
}

export class DeleteStatusDto {
  @ApiPropertyOptional({
    description:
      'Statut vers lequel déplacer les membres qui portent celui-ci. Exigé tant qu’il en reste.',
  })
  @IsOptional()
  @IsUUID()
  moveMembersTo?: string;
}
