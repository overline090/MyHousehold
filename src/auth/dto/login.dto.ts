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
}
