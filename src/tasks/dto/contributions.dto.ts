import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class ContributionsDto {
  @ApiPropertyOptional({ description: 'Le mois, AAAA-MM. Absent : le mois en cours dans le fuseau du foyer.' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month doit être au format AAAA-MM.' })
  month?: string;
}
