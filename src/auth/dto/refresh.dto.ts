import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class RefreshDto {
  /** Absent pour le navigateur, qui le porte dans un cookie `HttpOnly`. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(20)
  refreshToken?: string;
}
