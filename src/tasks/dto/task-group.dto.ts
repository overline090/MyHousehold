import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { EstUneIcone, ICONES } from '../../common/icones/icone';

const DESCRIPTION_ICONE = `Une icône de la liste (${ICONES.join(', ')}), « texte: » suivi d'un emoji ou d'une à deux lettres, ou null.`;

export class CreateTaskGroupDto {
  @ApiPropertyOptional({ description: 'UUID généré par le client' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Cuisine' })
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiPropertyOptional({ example: '#0F766E', description: 'Repère de lecture en liste' })
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional({ nullable: true, example: 'texte:🍳', description: DESCRIPTION_ICONE })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @EstUneIcone()
  icon?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  position?: number;
}

export class UpdateTaskGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional({ nullable: true, example: 'texte:🍳', description: DESCRIPTION_ICONE })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @EstUneIcone()
  icon?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  position?: number;
}
