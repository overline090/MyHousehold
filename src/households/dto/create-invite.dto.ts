import { ApiPropertyOptional } from '@nestjs/swagger';
import { HouseholdRole } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateInviteDto {
  @ApiPropertyOptional({ enum: HouseholdRole, default: HouseholdRole.ADULT })
  @IsOptional()
  @IsEnum(HouseholdRole)
  role?: HouseholdRole;

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
