import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { CountersController } from './counters.controller';
import { CountersService } from './counters.service';

@Module({
  imports: [HouseholdsModule],
  controllers: [CountersController],
  providers: [CountersService],
  exports: [CountersService],
})
export class CountersModule {}
