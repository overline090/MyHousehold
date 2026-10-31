import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsUsername } from '../../users/username';

export class LoginDto {
  @IsUsername()
  username!: string;

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

  @ApiPropertyOptional({ example: '0.5.0', description: "Version de l'app : l'administration voit quels téléphones sont à jour." })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  appVersion?: string;
}
