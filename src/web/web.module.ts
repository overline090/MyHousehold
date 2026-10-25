import { DynamicModule, Module } from '@nestjs/common';
import { RACINE_WEB, WebController } from './web.controller';

@Module({})
export class WebModule {
  static forRoot(racine: string): DynamicModule {
    return {
      module: WebModule,
      controllers: [WebController],
      providers: [{ provide: RACINE_WEB, useValue: racine }],
    };
  }
}
