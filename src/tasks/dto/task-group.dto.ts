import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class CreateTaskGroupDto {
  @ApiPropertyOptional({ description: 'UUID généré par le client' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Cuisine' })
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiPropertyOptional({ example: '#0F766E', description: 'Repère de lecture en liste' })
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  position?: number;
}

export class UpdateTaskGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  position?: number;
}
