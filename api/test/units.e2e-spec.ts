import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { API_CONFIG, type ApiConfig } from '../src/config.js';
import { SUPABASE } from '../src/core.module.js';
import { ProgressRepository } from '../src/progress/progress.repository.js';
import { UnitRevisionsRepository } from '../src/units/unit-revisions.repository.js';
import { fakeProgress } from './fake-progress.js';
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
    .overrideProvider(ProgressRepository).useValue(fakeProgress())
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

describe('POST /v1/units/:unitId/start', () => {
  let app: INestApplication<App>;
  afterEach(async () => {
    await app.close();
  });

  it('starts the unit for the signed-in learner, then returns the same progress', async () => {
    app = await startApp(true);
    const server = app.getHttpServer();
    const first = await request(server).post('/v1/units/C01-U01/start').set('Authorization', 'Bearer valid-token').expect(200)
      .expect('Cache-Control', 'no-store');
    expect(first.body.status).toBe('started');
    expect(first.body.progress).toMatchObject({ userId: learner.sub, currentActivityId: 'u1a-entry', progressVersion: 0 });
    const again = await request(server).post('/v1/units/C01-U01/start').set('Authorization', 'Bearer valid-token').expect(200);
    expect(again.body.status).toBe('existing');
  });

  it('ignores a user id in the body: the learner comes only from the token', async () => {
    app = await startApp(true);
    const response = await request(app.getHttpServer()).post('/v1/units/C01-U01/start')
      .set('Authorization', 'Bearer apple-token').send({ userId: '00000000-0000-4000-8000-000000000099' }).expect(200);
    expect(response.body.progress.userId).toBe(learner.sub);
  });

  it('returns 401 without a token and 404 for the draft without ALLOW_DRAFT_UNITS', async () => {
    app = await startApp(false);
    const server = app.getHttpServer();
    await request(server).post('/v1/units/C01-U01/start').expect(401);
    await request(server).post('/v1/units/C01-U01/start').set('Authorization', 'Bearer valid-token').expect(404);
  });
});

describe('POST /v1/units/:unitId/attempts', () => {
  let app: INestApplication<App>;
  afterEach(async () => {
    await app.close();
  });
  const continueEntry = {
    requestId: '00000000-0000-4000-8000-000000000011', revision: 1, activityId: 'u1a-entry',
    expectedProgressVersion: 0, response: { kind: 'continue' },
  };

  it('starts, then a continue on the entry moves to the first card; a retry gets the same answer', async () => {
    app = await startApp(true);
    const server = app.getHttpServer();
    await request(server).post('/v1/units/C01-U01/start').set('Authorization', 'Bearer valid-token').expect(200);
    const first = await request(server).post('/v1/units/C01-U01/attempts').set('Authorization', 'Bearer valid-token')
      .send(continueEntry).expect(200).expect('Cache-Control', 'no-store');
    expect(first.body).toMatchObject({ outcome: 'viewed', progress: { currentActivityId: 'u1a-vocab-hola', progressVersion: 1 } });
    const retry = await request(server).post('/v1/units/C01-U01/attempts').set('Authorization', 'Bearer valid-token')
      .send(continueEntry).expect(200);
    expect(retry.body).toEqual(first.body);
  });

  it('returns 400 for a malformed body, 401 without a token and 409 for a stale version', async () => {
    app = await startApp(true);
    const server = app.getHttpServer();
    await request(server).post('/v1/units/C01-U01/start').set('Authorization', 'Bearer valid-token').expect(200);
    await request(server).post('/v1/units/C01-U01/attempts').send(continueEntry).expect(401);
    await request(server).post('/v1/units/C01-U01/attempts').set('Authorization', 'Bearer valid-token').send({ kind: 'continue' }).expect(400);
    await request(server).post('/v1/units/C01-U01/attempts').set('Authorization', 'Bearer valid-token')
      .send({ ...continueEntry, expectedProgressVersion: 3 }).expect(409);
  });
});
