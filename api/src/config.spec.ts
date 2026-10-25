import { readConfig } from './config.js';

const base = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'test-only' };

describe('readConfig', () => {
  it('serves only published units unless ALLOW_DRAFT_UNITS is exactly true', () => {
    expect(readConfig(base).allowDraftUnits).toBe(false);
    expect(readConfig({ ...base, ALLOW_DRAFT_UNITS: 'TRUE' }).allowDraftUnits).toBe(false);
    expect(readConfig({ ...base, ALLOW_DRAFT_UNITS: 'true' }).allowDraftUnits).toBe(true);
  });

  it('serves drafts in a Vercel deployment only when the setting is there too', () => {
    expect(readConfig({ ...base, VERCEL: '1' }).allowDraftUnits).toBe(false);
    expect(readConfig({ ...base, ALLOW_DRAFT_UNITS: 'true', VERCEL: '1' }).allowDraftUnits).toBe(true);
  });

  it('fails at startup without the Supabase settings', () => {
    expect(() => readConfig({ SUPABASE_URL: base.SUPABASE_URL })).toThrow(/SUPABASE_SECRET_KEY/);
  });
});
