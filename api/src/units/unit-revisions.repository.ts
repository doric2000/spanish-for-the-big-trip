import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from '../core.module.js';

// The only code that knows how unit revisions are stored. Tests replace it with a fake.
@Injectable()
export class UnitRevisionsRepository {
  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  /** Raw authoring payload of the newest revision, or null. Throws when the database cannot be read. */
  async latest(unitId: string, includeDrafts: boolean): Promise<{ payload: unknown } | null> {
    let query = this.supabase
      .from('unit_revisions')
      .select('authoring_payload')
      .eq('unit_id', unitId);
    if (!includeDrafts) query = query.eq('status', 'published');
    const { data, error } = await query
      .order('revision', { ascending: false })
      .limit(1)
      .maybeSingle<{ authoring_payload: unknown }>();
    if (error) throw new Error(`unit_revisions read failed: ${error.message}`);
    return data ? { payload: data.authoring_payload } : null;
  }
}
