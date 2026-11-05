import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { EstUneIcone, ICONES } from '../../common/icones/icone';

export { ICONES };

export class CreateBoardDto {
  @ApiPropertyOptional({ description: 'Identifiant choisi par le téléphone, pour une création faite hors ligne.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Garde-manger' })
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'bocal',
    description: `Une icône de la liste (${ICONES.join(', ')}), ou « texte: » suivi d'un emoji ou d'une à deux lettres.`,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @EstUneIcone()
  icon?: string | null;

  @ApiPropertyOptional({ example: '#0F766E' })
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  position?: number;
}

export class UpdateBoardDto extends PartialType(OmitType(CreateBoardDto, ['id'] as const)) {}

export class CreateItemDto {
  @ApiPropertyOptional({ description: 'Identifiant choisi par le téléphone, pour une création faite hors ligne.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty()
  @IsUUID()
  boardId!: string;

  @ApiProperty({ example: 'Café en grains' })
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'bocal',
    description: `Une icône de la liste (${ICONES.join(', ')}), ou « texte: » suivi d'un emoji ou d'une à deux lettres.`,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @EstUneIcone()
  icon?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  quantity?: number;

  @ApiPropertyOptional({ nullable: true, description: 'Absent ou null : pas de minimum.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(100000)
  minimum?: number | null;

  @ApiPropertyOptional({ nullable: true, example: '2027-03-12' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString({ strict: true })
  expiresOn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  link?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(0, 500)
  detail?: string | null;
}

export class UpdateItemDto extends PartialType(OmitType(CreateItemDto, ['id'] as const)) {}

export class AdjustDto {
  @ApiProperty({ example: -1, description: 'Ce qui entre (+) ou sort (−).' })
  @IsInt()
  @Min(-100000)
  @Max(100000)
  delta!: number;
}

export class SortieLigneDto {
  @ApiProperty()
  @IsUUID()
  id!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity!: number;
}

export class SortieDto {
  @ApiProperty({ type: [SortieLigneDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SortieLigneDto)
  items!: SortieLigneDto[];
}
