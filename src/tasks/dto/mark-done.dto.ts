import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, Length } from 'class-validator';

/** Déclarer une tâche de fond faite. */
export class MarkDoneDto {
  @ApiPropertyOptional({
    description:
      "UUID généré par le client. Rend l'appel idempotent : un double tap ou un rejeu hors-ligne ne crée pas deux entrées.",
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({
    description:
      "Quand l'action a été faite, et non quand elle a été saisie : on constate souvent après coup. Un instant futur est refusé.",
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
