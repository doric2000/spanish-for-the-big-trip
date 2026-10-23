import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ContractError, type Progress, startUnit } from '@spanish-for-trip/content/progress';
import { type Unit, validateUnit } from '@spanish-for-trip/content/schema';
import type { VerifiedUser } from '../auth/auth.guard.js';
import { API_CONFIG, type ApiConfig } from '../config.js';
import { UnitRevisionsRepository } from '../units/unit-revisions.repository.js';
import { UnitsService } from '../units/units.service.js';
import { ProgressRepository, type StartStatus } from './progress.repository.js';

// The rules (what may start, which revision, prerequisites) come from the tested pure
// code in content/src/progress.ts. This service loads what it needs, asks those rules,
// and lets the database function make the write safe.
@Injectable()
export class ProgressService {
  private readonly logger = new Logger(ProgressService.name);

  constructor(
    private readonly units: UnitsService,
    private readonly revisions: UnitRevisionsRepository,
    private readonly progress: ProgressRepository,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async start(user: VerifiedUser, unitId: string): Promise<{ status: StartStatus; progress: Progress }> {
    const unit = await this.units.latestUnit(unitId);
    const own = await this.storage(() => this.progress.forUnit(user.userId, unitId));
    const prerequisites = unit.requires.length ? await this.completedUnits(user.userId) : { progress: [], units: [] };

    const planned = this.rules(() => startUnit(user, unit, [...own, ...prerequisites.progress], prerequisites.units,
      { allowDraft: this.config.allowDraftUnits }));
    // Resuming or finished: nothing to write.
    if (own.some(p => p.revision === planned.revision && p.status === planned.status)) {
      return { status: planned.status === 'completed' ? 'completed' : 'existing', progress: planned };
    }
    // A new start goes through the atomic function, which also settles a simultaneous start.
    return this.storage(() => this.progress.start(user.userId, planned.unitId, planned.revision,
      planned.currentActivityId!, planned.scenarioNodeId));
  }

  // Completed rows and their exact published revisions. A draft never counts.
  private async completedUnits(userId: string): Promise<{ progress: Progress[]; units: Unit[] }> {
    return this.storage(async () => {
      const progress = await this.progress.completed(userId);
      const units: Unit[] = [];
      for (const row of progress) {
        const stored = await this.revisions.published(row.unitId, row.revision);
        const parsed = stored ? validateUnit(stored.payload) : null;
        if (parsed?.success) units.push(parsed.data);
      }
      return { progress, units };
    });
  }

  // Maps the contract's errors to HTTP. 404 hides whether a unit exists or is locked.
  private rules<T>(decide: () => T): T {
    try {
      return decide();
    } catch (error) {
      if (!(error instanceof ContractError)) throw error;
      const Http = { 400: BadRequestException, 401: UnauthorizedException, 404: NotFoundException, 409: ConflictException }[error.status];
      throw new Http();
    }
  }

  // A database failure is temporary for the app (503): it keeps its request and retries.
  private async storage<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(error instanceof Error ? error.message : error);
      throw new ServiceUnavailableException();
    }
  }
}
