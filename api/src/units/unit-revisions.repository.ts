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

  /** One exact revision a learner is pinned to; drafts only when included. */
  async exact(unitId: string, revision: number, includeDrafts: boolean): Promise<{ payload: unknown } | null> {
    let query = this.supabase
      .from('unit_revisions')
      .select('authoring_payload')
      .eq('unit_id', unitId)
      .eq('revision', revision);
    if (!includeDrafts) query = query.eq('status', 'published');
    const { data, error } = await query.maybeSingle<{ authoring_payload: unknown }>();
    if (error) throw new Error(`unit_revisions read failed: ${error.message}`);
    return data ? { payload: data.authoring_payload } : null;
  }

  /** One exact published revision, or null. Used for completed prerequisites: drafts never count. */
  async published(unitId: string, revision: number): Promise<{ payload: unknown } | null> {
    const { data, error } = await this.supabase
      .from('unit_revisions')
      .select('authoring_payload')
      .eq('unit_id', unitId)
      .eq('revision', revision)
      .eq('status', 'published')
      .maybeSingle<{ authoring_payload: unknown }>();
    if (error) throw new Error(`unit_revisions read failed: ${error.message}`);
    return data ? { payload: data.authoring_payload } : null;
  }
}
