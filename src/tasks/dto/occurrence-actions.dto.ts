import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CompleteOccurrenceDto {
  @ApiPropertyOptional({
    description:
      "Instant de l'action, si elle a été faite plus tôt. Par défaut : maintenant. Ne peut pas être dans le futur.",
  })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}

export class SkipOccurrenceDto {
  @ApiPropertyOptional({ description: 'Motif, affiché dans le foyer.' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}

export class UpdateOccurrenceDto {
  @ApiPropertyOptional({
    description: 'Réassigner. `null` rend l’occurrence ouverte à tous.',
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @ApiPropertyOptional({ description: 'Reporter l’échéance.' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}
