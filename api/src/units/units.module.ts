import { Module } from '@nestjs/common';
import { UnitRevisionsRepository } from './unit-revisions.repository.js';
import { UnitsController } from './units.controller.js';
import { UnitsService } from './units.service.js';

@Module({
  controllers: [UnitsController],
  providers: [UnitsService, UnitRevisionsRepository],
  // The progress routes read the same validated units.
  exports: [UnitsService, UnitRevisionsRepository],
})
export class UnitsModule {}
