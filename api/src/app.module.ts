import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CoreModule } from './core.module.js';
import { ProgressModule } from './progress/progress.module.js';
import { RequestLogMiddleware } from './request-log.middleware.js';
import { UnitsModule } from './units/units.module.js';

@Module({
  imports: [CoreModule, UnitsModule, ProgressModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLogMiddleware).forRoutes('{*splat}');
  }
}
