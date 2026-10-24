import { ApiPropertyOptional } from '@nestjs/swagger';
import { HouseholdRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: HouseholdRole })
  @IsOptional()
  @IsEnum(HouseholdRole)
  role?: HouseholdRole;

  @ApiPropertyOptional({ description: 'Surnom propre à ce foyer' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  nickname?: string;
}
