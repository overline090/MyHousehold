import { Module } from '@nestjs/common';
import { PluginsModule } from '../plugins/plugins.module';
import { StockImagesService } from './images.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [PluginsModule],
  controllers: [StockController],
  providers: [StockService, StockImagesService],
})
export class StockModule {}
