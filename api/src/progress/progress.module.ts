import { Module } from '@nestjs/common';
import { UnitsModule } from '../units/units.module.js';
import { ProgressController } from './progress.controller.js';
import { ProgressRepository } from './progress.repository.js';
import { ProgressService } from './progress.service.js';

@Module({
  imports: [UnitsModule],
  controllers: [ProgressController],
  providers: [ProgressService, ProgressRepository],
})
export class ProgressModule {}
