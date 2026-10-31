import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Une tuile de l'accueil : laquelle, sa largeur en colonnes (sur 12) et
 * sa hauteur en pixels — absente, la tuile prend la hauteur de son
 * contenu. `taille` (S, M, L, XL) est l'ancienne largeur : encore
 * acceptée, l'interface la convertit en colonnes.
 */
export class TuileDto {
  @ApiPropertyOptional({ example: 'en-retard' })
  @IsString()
  @Matches(/^[a-z0-9-]{1,40}$/)
  id!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 12, example: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  colonnes?: number;

  @ApiPropertyOptional({ minimum: 40, maximum: 4000, example: 228 })
  @IsOptional()
  @IsInt()
  @Min(40)
  @Max(4000)
  hauteur?: number;

  @ApiPropertyOptional({ enum: ['S', 'M', 'L', 'XL'], deprecated: true })
  @IsOptional()
  @IsIn(['S', 'M', 'L', 'XL'])
  taille?: 'S' | 'M' | 'L' | 'XL';
}

/**
 * Les préférences d'affichage d'un compte. Chaque champ est facultatif :
 * ce qui est envoyé remplace, ce qui manque est gardé.
 */
export class PreferencesDto {
  @ApiPropertyOptional({
    type: [TuileDto],
    description: 'Les tuiles de l’accueil, dans l’ordre.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => TuileDto)
  accueil?: TuileDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  navigationRepliee?: boolean;

  @ApiPropertyOptional({ enum: ['accueil', 'taches', 'agenda'] })
  @IsOptional()
  @IsIn(['accueil', 'taches', 'agenda'])
  pageOuverture?: 'accueil' | 'taches' | 'agenda';

  @ApiPropertyOptional({ enum: ['auto', 'clair', 'sombre'] })
  @IsOptional()
  @IsIn(['auto', 'clair', 'sombre'])
  apparence?: 'auto' | 'clair' | 'sombre';
}
