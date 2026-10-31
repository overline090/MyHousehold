import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

/**
 * Une règle de copie automatique : ce qu'elle repère devient, dans les
 * détails d'une tâche, un bouton qui copie d'un appui. Pas d'expression
 * régulière à écrire : un mot-clé, ou un format où # est un chiffre, A
 * une lettre et * l'un ou l'autre.
 */
export class RegleDeCopieDto {
  @ApiProperty({ example: 'code-du-portail' })
  @IsString()
  @Matches(/^[a-z0-9-]{1,40}$/)
  id!: string;

  @ApiProperty({ example: 'Code du portail' })
  @IsString()
  @Length(1, 60)
  nom!: string;

  @ApiProperty({ enum: ['MOT_CLE', 'FORMAT'] })
  @IsIn(['MOT_CLE', 'FORMAT'])
  type!: 'MOT_CLE' | 'FORMAT';

  @ApiProperty({ example: 'Code du portail', description: 'Le mot-clé, ou le format (CT-######).' })
  @IsString()
  @Length(1, 80)
  motif!: string;

  @ApiProperty()
  @IsBoolean()
  active!: boolean;
}

export class DetectionDto {
  @ApiPropertyOptional({ description: 'Reconnaître les numéros de téléphone' })
  @IsOptional()
  @IsBoolean()
  telephones?: boolean;

  @ApiPropertyOptional({ description: 'Reconnaître les adresses postales' })
  @IsOptional()
  @IsBoolean()
  adresses?: boolean;

  @ApiPropertyOptional({ description: 'Reconnaître les liens web' })
  @IsOptional()
  @IsBoolean()
  liens?: boolean;

  @ApiPropertyOptional({ type: [RegleDeCopieDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RegleDeCopieDto)
  regles?: RegleDeCopieDto[];
}
