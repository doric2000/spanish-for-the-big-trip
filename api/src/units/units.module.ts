import { Module } from '@nestjs/common';
import { UnitRevisionsRepository } from './unit-revisions.repository.js';
import { UnitsController } from './units.controller.js';
import { UnitsService } from './units.service.js';

@Module({
  controllers: [UnitsController],
  providers: [UnitsService, UnitRevisionsRepository],
})
export class UnitsModule {}
