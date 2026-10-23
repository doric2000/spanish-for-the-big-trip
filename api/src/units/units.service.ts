import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { projectUnit, type PublicUnit } from '@spanish-for-trip/content/api-contract';
import { type Unit, validateUnit } from '@spanish-for-trip/content/schema';
import { API_CONFIG, type ApiConfig } from '../config.js';
import { UnitRevisionsRepository } from './unit-revisions.repository.js';

// Same shape as stable ids in content/src/api-contract.ts.
const UNIT_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

@Injectable()
export class UnitsService {
  private readonly logger = new Logger(UnitsService.name);

  constructor(
    private readonly revisions: UnitRevisionsRepository,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async learnerUnit(unitId: string): Promise<PublicUnit> {
    const unit = await this.latestUnit(unitId);
    // Answers and review data are removed here. Media URLs come with Supabase Storage (a later step).
    return projectUnit(unit, {}, {}, { allowDraft: this.config.allowDraftUnits });
  }

  // The newest revision a learner may use (drafts only with ALLOW_DRAFT_UNITS), validated.
  // Shared with the progress routes, which need the full unit including answers.
  async latestUnit(unitId: string): Promise<Unit> {
    if (!UNIT_ID.test(unitId)) throw new NotFoundException();

    let row: { payload: unknown } | null;
    try {
      row = await this.revisions.latest(unitId, this.config.allowDraftUnits);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : error);
      throw new ServiceUnavailableException();
    }
    if (!row) throw new NotFoundException();

    // The stored copy came from validated JSON; checking again catches a bad import.
    const unit = validateUnit(row.payload);
    if (!unit.success) {
      this.logger.error(`Stored revision of ${unitId} does not match the content schema`);
      throw new InternalServerErrorException();
    }
    return unit.data;
  }
}
