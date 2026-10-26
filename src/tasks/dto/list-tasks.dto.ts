import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskKind } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ListTasksDto {
  @ApiPropertyOptional({
    enum: TaskKind,
    description: 'Récurrentes, de fond ou ponctuelles. Absent = toutes.',
  })
  @IsOptional()
  @IsEnum(TaskKind)
  kind?: TaskKind;

  @ApiPropertyOptional({ description: 'Tâches d’un groupe' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Sans les tâches en pause' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === 'true' || value === true))
  @IsBoolean()
  isActive?: boolean;
}
