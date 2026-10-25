export interface ApiConfig {
  supabaseUrl: string;
  supabaseSecretKey: string;
  // Development only: see docs/planning/approved-decisions.json#stage05_draft_units_in_development.
  allowDraftUnits: boolean;
}

export const API_CONFIG = Symbol('API_CONFIG');

export function readConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseSecretKey = env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY (local settings file, or Environment Variables in Vercel)');
  }
  // Allowed in the development deployment too while Dor is the only learner (2026-10-25).
  // Turning it off in Vercel is a release gate: approved-decisions.json#stage05_draft_units_in_development.
  const allowDraftUnits = env.ALLOW_DRAFT_UNITS === 'true';
  return { supabaseUrl, supabaseSecretKey, allowDraftUnits };
}
