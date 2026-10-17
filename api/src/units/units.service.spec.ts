import {
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { fakeRevisions, PRIVATE_FIELDS, unit1aPayload } from '../../test/unit1a.js';
import type { ApiConfig } from '../config.js';
import type { UnitRevisionsRepository } from './unit-revisions.repository.js';
import { UnitsService } from './units.service.js';

function service(revisions: Pick<UnitRevisionsRepository, 'latest'>, allowDraftUnits: boolean) {
  const config: ApiConfig = { supabaseUrl: 'https://example.supabase.co', supabaseSecretKey: 'test-only', allowDraftUnits };
  return new UnitsService(revisions as UnitRevisionsRepository, config);
}

describe('UnitsService.learnerUnit', () => {
  it('returns the 1A draft without answers when drafts are allowed', async () => {
    const unit = await service(fakeRevisions([unit1aPayload()]), true).learnerUnit('C01-U01');
    expect(unit.id).toBe('C01-U01');
    expect(unit.activities).toHaveLength(16);
    // No media is hosted yet, so every url is null in draft mode.
    expect(unit.media.every(m => m.url === null)).toBe(true);
    const text = JSON.stringify(unit);
    for (const field of PRIVATE_FIELDS) expect(text).not.toContain(field);
  });

  it('returns 404 for a draft-only unit without ALLOW_DRAFT_UNITS', async () => {
    await expect(service(fakeRevisions([unit1aPayload()]), false).learnerUnit('C01-U01')).rejects.toThrow(NotFoundException);
  });

  it('returns 404 for an unknown or malformed unit id without reading the database', async () => {
    const latest = vi.fn(() => Promise.resolve(null));
    await expect(service({ latest }, true).learnerUnit('C01-U99')).rejects.toThrow(NotFoundException);
    await expect(service({ latest }, true).learnerUnit('../secrets')).rejects.toThrow(NotFoundException);
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when the database cannot be read', async () => {
    const latest = () => Promise.reject(new Error('connection reset'));
    await expect(service({ latest }, true).learnerUnit('C01-U01')).rejects.toThrow(ServiceUnavailableException);
  });

  it('returns 500 when a stored payload does not match the content schema', async () => {
    const broken = { ...unit1aPayload(), activities: 'not a list' };
    await expect(service(fakeRevisions([broken]), true).learnerUnit('C01-U01')).rejects.toThrow(InternalServerErrorException);
  });
});
