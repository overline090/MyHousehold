import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateInviteDto {
  @ApiProperty({ description: "Statut attribué à l'arrivée" })
  @IsUUID()
  statusId!: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxUses?: number;

  @ApiPropertyOptional({
    description: 'Durée de validité en heures (168 h = 7 jours par défaut)',
    default: 168,
    minimum: 1,
    maximum: 720,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  ttlHours?: number;
}
