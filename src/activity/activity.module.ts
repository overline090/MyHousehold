import { Module } from '@nestjs/common';
import { HouseholdsModule } from '../households/households.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

@Module({
  imports: [HouseholdsModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
