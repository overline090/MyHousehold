import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

/** Une tuile de l'accueil : laquelle, et sa largeur. */
export class TuileDto {
  @ApiPropertyOptional({ example: 'en-retard' })
  @IsString()
  @Matches(/^[a-z0-9-]{1,40}$/)
  id!: string;

  @ApiPropertyOptional({ enum: ['S', 'M', 'L', 'XL'] })
  @IsIn(['S', 'M', 'L', 'XL'])
  taille!: 'S' | 'M' | 'L' | 'XL';
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
