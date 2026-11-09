import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class PolitiqueDto {
  @ApiPropertyOptional({ description: 'Installer seul les nouvelles versions, la nuit' })
  @IsOptional()
  @IsBoolean()
  automatique?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 23, description: 'Heure locale où l’outil peut agir' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  heure?: number;

  @ApiPropertyOptional({ description: 'Installer seul les versions majeures aussi' })
  @IsOptional()
  @IsBoolean()
  majeures?: boolean;
}
