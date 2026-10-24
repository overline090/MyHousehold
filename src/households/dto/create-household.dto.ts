import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class CreateHouseholdDto {
  @ApiPropertyOptional({
    description:
      'UUID généré par le client. Rend la création idempotente : un envoi rejoué ne crée pas un second foyer.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Maison des Dupont' })
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiPropertyOptional({ example: 'Europe/Paris' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ description: '1 = lundi', minimum: 1, maximum: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weekStartsOn?: number;
}
