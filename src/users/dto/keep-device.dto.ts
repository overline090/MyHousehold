import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class KeepDeviceDto {
  @ApiProperty({ description: "L'appareil qui reste connecté : celui d'où vient la demande." })
  @IsString()
  @Length(1, 64)
  deviceId!: string;
}
