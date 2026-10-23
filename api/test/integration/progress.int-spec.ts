// Real-database check of POST start/attempts (approved by Dor, 2026-10-23).
// Runs only on Dor's computer against the DEVELOPMENT project, with the same local
// settings file the server reads. It creates one synthetic user, uses the 1A draft that
// is already stored, and deletes the user at the end; the cascade removes its progress
// and attempts. Run: $env:INTEGRATION_DB = 'dev'; npm.cmd run test:integration
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { ConflictException } from '@nestjs/common';
import { applyAttempt } from '@spanish-for-trip/content/progress';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VerifiedUser } from '../../src/auth/auth.guard.js';
import { type ApiConfig, readConfig } from '../../src/config.js';
import { ProgressRepository } from '../../src/progress/progress.repository.js';
import { ProgressService } from '../../src/progress/progress.service.js';
import { UnitRevisionsRepository } from '../../src/units/unit-revisions.repository.js';
import { UnitsService } from '../../src/units/units.service.js';

const UNIT = 'C01-U01';
if (existsSync('.env')) process.loadEnvFile('.env');

describe('progress against the development database', () => {
  let supabase: SupabaseClient;
  let service: ProgressService;
  let progress: ProgressRepository;
  let units: UnitsService;
  let user: VerifiedUser | null = null;

  beforeAll(async () => {
    // An explicit confirmation, so this never runs against another project by accident.
    if (process.env.INTEGRATION_DB !== 'dev') {
      throw new Error("Refusing to run: set $env:INTEGRATION_DB = 'dev' to confirm the development database.");
    }
    const config: ApiConfig = { ...readConfig(process.env), allowDraftUnits: true };
    console.log(`Integration test against ${new URL(config.supabaseUrl).host}`);
    supabase = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const revisions = new UnitRevisionsRepository(supabase);
    progress = new ProgressRepository(supabase);
    units = new UnitsService(revisions, config);
    service = new ProgressService(units, revisions, progress, config);

    // A synthetic learner on a domain that cannot exist. The provider is passed the way the
    // guard would pass it; the guard itself is covered by the e2e tests.
    const { data, error } = await supabase.auth.admin.createUser({ email: `check-${randomUUID()}@check.invalid`, email_confirm: true });
    if (error || !data.user) throw new Error(`Could not create the synthetic user: ${error?.message}`);
    user = { userId: data.user.id, provider: 'google' };
  });

  afterAll(async () => {
    if (!user) return;
    // Deleting the user removes its progress and attempts (on delete cascade).
    const { error } = await supabase.auth.admin.deleteUser(user.userId);
    if (error) throw new Error(`Cleanup failed; delete the @check.invalid user by hand: ${error.message}`);
    for (const table of ['user_unit_progress', 'activity_attempts']) {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('user_id', user.userId);
      expect(count, `${table} rows left after cleanup`).toBe(0);
    }
  });

  const continueOn = (activityId: string, expectedProgressVersion: number) => ({
    requestId: randomUUID(), revision: 1, activityId, expectedProgressVersion, response: { kind: 'continue' as const },
  });

  it('starts once: started, then existing', async () => {
    const first = await service.start(user!, UNIT);
    expect(first.status).toBe('started');
    expect(first.progress).toMatchObject({ currentActivityId: 'u1a-entry', progressVersion: 0 });
    expect((await service.start(user!, UNIT)).status).toBe('existing');
  });

  it('stores a continue, replays it, and refuses the same id with other content', async () => {
    const request = continueOn('u1a-entry', 0);
    const stored = await service.submit(user!, UNIT, request);
    expect(stored.progress).toMatchObject({ currentActivityId: 'u1a-vocab-hola', progressVersion: 1 });
    expect(await service.submit(user!, UNIT, request)).toEqual(stored);
    await expect(service.submit(user!, UNIT, { ...request, expectedProgressVersion: 1, activityId: 'u1a-vocab-hola' }))
      .rejects.toThrow(ConflictException);
    const { count } = await supabase.from('activity_attempts').select('*', { count: 'exact', head: true }).eq('user_id', user!.userId);
    expect(count).toBe(1);
  });

  it('lets exactly one of two simultaneous requests through (row lock + version check)', async () => {
    // Both answers are computed from the same state (version 1), as two phones would.
    const [own] = await progress.forUnit(user!.userId, UNIT);
    const unit = await units.latestUnit(UNIT);
    const requests = [continueOn('u1a-vocab-hola', 1), continueOn('u1a-vocab-hola', 1)];
    const decided = requests.map(r => applyAttempt(user!, unit, { progress: own, attempts: [] }, r, { allowDraft: true }));
    const outcomes = await Promise.all(requests.map((request, i) => progress.submit({
      userId: user!.userId, unitId: UNIT, request, fingerprint: `${i}`.repeat(64), result: decided[i].result,
    })));
    expect(outcomes.map(o => o.status).sort()).toEqual(['conflict', 'stored']);

    const [after] = await progress.forUnit(user!.userId, UNIT);
    expect(after).toMatchObject({ currentActivityId: 'u1a-vocab-buenos-dias', progressVersion: 2 });
    const { count } = await supabase.from('activity_attempts').select('*', { count: 'exact', head: true }).eq('user_id', user!.userId);
    expect(count).toBe(2);
  });
});
