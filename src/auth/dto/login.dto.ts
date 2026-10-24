import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;

  @ApiPropertyOptional({
    description:
      "Identifiant d'appareil généré par le client. Permet de révoquer une session appareil par appareil.",
  })
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiPropertyOptional({ example: 'Pixel 8 de Marie' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceName?: string;
}
