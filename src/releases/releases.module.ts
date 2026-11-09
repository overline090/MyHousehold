import { Module, OnModuleInit } from '@nestjs/common';
import { MiseAJourService } from './mise-a-jour.service';
import { ReleasesController } from './releases.controller';
import { ReleasesService } from './releases.service';

@Module({
  controllers: [ReleasesController],
  providers: [ReleasesService, MiseAJourService],
  exports: [ReleasesService, MiseAJourService],
})
export class ReleasesModule implements OnModuleInit {
  constructor(private readonly miseAJour: MiseAJourService) {}

  async onModuleInit(): Promise<void> {
    await this.miseAJour.initialiser();
  }
}
