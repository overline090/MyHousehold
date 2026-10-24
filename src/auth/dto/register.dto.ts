import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'marie@example.com' })
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email!: string;

  @ApiProperty({ minLength: 10, example: 'un mot de passe long' })
  // 10 caractères minimum, sans exigence de symboles : la longueur
  // protège, les règles de composition ne font que pousser les gens vers
  // « Motdepasse1! ».
  @IsString()
  @MinLength(10, { message: 'Le mot de passe doit faire au moins 10 caractères.' })
  @MaxLength(256)
  password!: string;

  @ApiProperty({ example: 'Marie' })
  @IsString()
  @Length(1, 60)
  displayName!: string;

  @ApiPropertyOptional({ example: 'Europe/Paris' })
  @IsOptional()
  @IsString()
  timezone?: string;
}
