import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AttemptRequestSchema, projectActivity } from '@spanish-for-trip/content/api-contract';
import { applyAttempt, attemptFingerprint, type AttemptResult, ContractError, type Progress, startUnit } from '@spanish-for-trip/content/progress';
import { type Unit, validateUnit } from '@spanish-for-trip/content/schema';
import type { VerifiedUser } from '../auth/auth.guard.js';
import { API_CONFIG, type ApiConfig } from '../config.js';
import { UnitRevisionsRepository } from '../units/unit-revisions.repository.js';
import { UnitsService } from '../units/units.service.js';
import { ProgressRepository, type StartStatus } from './progress.repository.js';

export type StartResult = { status: StartStatus; progress: Progress; scenario: ReturnType<typeof projectActivity> | null };

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

  async start(user: VerifiedUser, unitId: string): Promise<StartResult> {
    const started = await this.startOrResume(user, unitId);
    return { ...started, scenario: await this.currentScenario(started.progress) };
  }

  // A learner who left in the middle of a scenario resumes at the same node. The unit
  // route projects only the start node, so the start reply carries the current one,
  // projected the same way (no answers, no branch destinations).
  private async currentScenario(progress: Progress): Promise<StartResult['scenario']> {
    if (progress.status !== 'in_progress' || !progress.scenarioNodeId) return null;
    const unit = await this.pinnedUnit(progress.unitId, progress.revision);
    const activity = unit.activities.find(a => a.id === progress.currentActivityId);
    return activity?.type === 'bounded_scenario' ? projectActivity(activity, progress.scenarioNodeId) : null;
  }

  private async startOrResume(user: VerifiedUser, unitId: string): Promise<{ status: StartStatus; progress: Progress }> {
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

  // One learner action. The order matters: a retry is answered from the log before
  // anything is computed, because by then the progress has usually moved on and the
  // rules would (correctly) call the old request stale.
  async submit(user: VerifiedUser, unitId: string, body: unknown): Promise<AttemptResult> {
    const parsed = AttemptRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    const request = parsed.data;
    const fingerprint = attemptFingerprint(unitId, request);

    const previous = await this.storage(() => this.progress.attempt(user.userId, request.requestId));
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new ConflictException('Request ID was already used for different input');
      return previous.result;
    }

    // The learner stays on the revision they started, even if a newer one exists.
    const own = await this.storage(() => this.progress.forUnit(user.userId, unitId));
    const current = own.find(p => p.status === 'in_progress') ?? own.find(p => p.revision === request.revision);
    if (!current) throw new NotFoundException();
    const unit = await this.pinnedUnit(unitId, current.revision);

    // The tested rules decide: correct or not, feedback, the next activity.
    const decided = this.rules(() => applyAttempt(user, unit, { progress: current, attempts: [] }, request,
      { allowDraft: this.config.allowDraftUnits }));

    const saved = await this.storage(() => this.progress.submit({ userId: user.userId, unitId, request, fingerprint, result: decided.result }));
    switch (saved.status) {
      case 'stored':
      case 'replayed':
        return saved.result;
      case 'conflict':
        throw new ConflictException(saved.reason === 'request_id_reused' ? 'Request ID was already used for different input' : 'Progress changed; reload progress');
      case 'not_found':
        throw new NotFoundException();
    }
  }

  private async pinnedUnit(unitId: string, revision: number): Promise<Unit> {
    const stored = await this.storage(() => this.revisions.exact(unitId, revision, this.config.allowDraftUnits));
    if (!stored) throw new NotFoundException();
    const unit = validateUnit(stored.payload);
    if (!unit.success) {
      this.logger.error(`Stored revision ${revision} of ${unitId} does not match the content schema`);
      throw new InternalServerErrorException();
    }
    return unit.data;
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
