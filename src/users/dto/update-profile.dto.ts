import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsHexColor,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Marie' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Dupont' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  lastName?: string;

  @ApiPropertyOptional({
    example: '1986-03-12',
    description: 'null efface la date : on ne force personne à la déclarer.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  birthDate?: string | null;

  @ApiPropertyOptional({ example: 'fr-FR' })
  @IsOptional()
  @IsString()
  @Length(2, 10)
  locale?: string;

  @ApiPropertyOptional({ example: 'Europe/Paris' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: '#0F766E', description: 'Couleur à défaut de photo' })
  @IsOptional()
  @IsHexColor()
  avatarColor?: string;
}
