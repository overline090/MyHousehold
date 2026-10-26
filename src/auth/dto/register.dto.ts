import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
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
  firstName!: string;

  @ApiProperty({ example: 'Dupont' })
  @IsString()
  @Length(1, 60)
  lastName!: string;

  @ApiPropertyOptional({ example: '1986-03-12', description: 'Date de naissance' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({
    description:
      "Code d'invitation. Exigé dès que les inscriptions libres sont fermées, c'est-à-dire dès la fin de l'installation.",
    example: 'K7PQ2M4R',
  })
  @IsOptional()
  @IsString()
  @Length(4, 20)
  inviteCode?: string;

  @ApiPropertyOptional({ example: 'Europe/Paris' })
  @IsOptional()
  @IsString()
  timezone?: string;
}
