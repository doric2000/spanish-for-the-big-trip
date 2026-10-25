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
  const allowDraftUnits = env.ALLOW_DRAFT_UNITS === 'true';
  // Vercel sets VERCEL=1 in every deployment; drafts must never be served there.
  if (allowDraftUnits && env.VERCEL) {
    throw new Error('ALLOW_DRAFT_UNITS is for local development only');
  }
  return { supabaseUrl, supabaseSecretKey, allowDraftUnits };
}
