import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { API_CONFIG, type ApiConfig } from '../src/config.js';
import { SUPABASE } from '../src/core.module.js';
import { UnitRevisionsRepository } from '../src/units/unit-revisions.repository.js';
import { fakeRevisions, PRIVATE_FIELDS, unit1aPayload } from './unit1a.js';

const learner = {
  sub: '00000000-0000-4000-8000-000000000001', role: 'authenticated', aud: 'authenticated', is_anonymous: false,
  app_metadata: { provider: 'google', providers: ['google'] },
};

// Stands in for Supabase Auth: each test token maps to the claims it would verify to.
const fakeSupabase = {
  auth: {
    getClaims: (token: string) => {
      const claims = {
        'valid-token': learner,
        'apple-token': { ...learner, app_metadata: { provider: 'apple', providers: ['apple'] } },
        'email-token': { ...learner, app_metadata: { provider: 'email', providers: ['email'] } },
        'no-provider-token': { ...learner, app_metadata: {} },
        'anonymous-token': { ...learner, is_anonymous: true },
        'service-token': { ...learner, role: 'service_role' },
      }[token];
      return Promise.resolve(claims ? { data: { claims }, error: null } : { data: null, error: new Error('invalid JWT') });
    },
  },
};

async function startApp(allowDraftUnits: boolean): Promise<INestApplication<App>> {
  const config: ApiConfig = { supabaseUrl: 'https://example.supabase.co', supabaseSecretKey: 'test-only', allowDraftUnits };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(API_CONFIG).useValue(config)
    .overrideProvider(SUPABASE).useValue(fakeSupabase)
    .overrideProvider(UnitRevisionsRepository).useValue(fakeRevisions([unit1aPayload()]))
    .compile();
  const app = module.createNestApplication<INestApplication<App>>({ logger: false });
  await app.init();
  return app;
}

describe('GET /v1/units/:unitId', () => {
  let app: INestApplication<App>;
  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with the learner projection for a signed-in user', async () => {
    app = await startApp(true);
    const response = await request(app.getHttpServer())
      .get('/v1/units/C01-U01')
      .set('Authorization', 'Bearer valid-token')
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(response.body.id).toBe('C01-U01');
    for (const field of PRIVATE_FIELDS) expect(response.text).not.toContain(field);
  });

  it('returns 401 without a token, with a bad token, or for a non-learner session', async () => {
    app = await startApp(true);
    const server = app.getHttpServer();
    await request(server).get('/v1/units/C01-U01').expect(401);
    await request(server).get('/v1/units/C01-U01').set('Authorization', 'valid-token').expect(401);
    for (const token of ['forged-token', 'anonymous-token', 'service-token', 'email-token', 'no-provider-token']) {
      await request(server).get('/v1/units/C01-U01').set('Authorization', `Bearer ${token}`).expect(401);
    }
  });

  it('accepts both product sign-in providers, Google and Apple', async () => {
    app = await startApp(true);
    for (const token of ['valid-token', 'apple-token']) {
      await request(app.getHttpServer()).get('/v1/units/C01-U01').set('Authorization', `Bearer ${token}`).expect(200);
    }
  });

  it('returns 404 for an unknown unit', async () => {
    app = await startApp(true);
    await request(app.getHttpServer()).get('/v1/units/C01-U99').set('Authorization', 'Bearer valid-token').expect(404);
  });

  it('returns 404 for the 1A draft when ALLOW_DRAFT_UNITS is off', async () => {
    app = await startApp(false);
    await request(app.getHttpServer()).get('/v1/units/C01-U01').set('Authorization', 'Bearer valid-token').expect(404);
  });
});
