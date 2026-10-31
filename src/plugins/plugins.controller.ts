import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Right } from '@prisma/client';
import { IsBoolean } from 'class-validator';
import { RequireRight } from '../households/decorators/require-right.decorator';
import { PluginsService } from './plugins.service';

class EnabledDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

@ApiTags('plugins')
@Controller('plugins')
export class PluginsController {
  constructor(private readonly plugins: PluginsService) {}

  @Get()
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Les plugins du foyer, activés ou non' })
  list() {
    return this.plugins.list();
  }

  @Patch(':id')
  @RequireRight(Right.MANAGE_SERVER)
  @ApiOperation({ summary: 'Activer ou désactiver un plugin' })
  set(@Param('id') id: string, @Body() dto: EnabledDto) {
    return this.plugins.setEnabled(id, dto.enabled);
  }
}
