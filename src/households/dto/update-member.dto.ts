import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpdateMemberDto {
  @ApiProperty({ description: 'Nouveau statut du membre' })
  @IsUUID()
  statusId!: string;
}
