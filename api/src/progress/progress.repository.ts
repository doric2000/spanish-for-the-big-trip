import { Inject, Injectable } from '@nestjs/common';
import type { Progress } from '@spanish-for-trip/content/progress';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from '../core.module.js';

// One row of public.user_unit_progress (supabase/migrations/20261016113506_create_user_unit_progress.sql).
export interface ProgressRow {
  user_id: string;
  unit_id: string;
  revision: number;
  status: 'in_progress' | 'completed';
  current_activity_id: string | null;
  scenario_node_id: string | null;
  used_help_for_current: boolean;
  completed_activity_evidence: Progress['completed'];
  progress_version: number;
}

export type StartStatus = 'started' | 'existing' | 'completed';

export function progressFromRow(row: ProgressRow): Progress {
  return {
    userId: row.user_id, unitId: row.unit_id, revision: row.revision, status: row.status,
    currentActivityId: row.current_activity_id, progressVersion: row.progress_version,
    scenarioNodeId: row.scenario_node_id, usedHelpForCurrent: row.used_help_for_current,
    completed: row.completed_activity_evidence,
  };
}

// The only code that knows how progress is stored. The server key bypasses RLS, so
// every query here is scoped to the verified user id it is given. Tests replace it.
@Injectable()
export class ProgressRepository {
  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  /** This learner's rows for one unit (any revision, active or completed). */
  async forUnit(userId: string, unitId: string): Promise<Progress[]> {
    const { data, error } = await this.supabase
      .from('user_unit_progress').select('*').eq('user_id', userId).eq('unit_id', unitId);
    if (error) throw new Error(`user_unit_progress read failed: ${error.message}`);
    return (data as ProgressRow[]).map(progressFromRow);
  }

  /** This learner's completed rows in all units, for prerequisite checks. */
  async completed(userId: string): Promise<Progress[]> {
    const { data, error } = await this.supabase
      .from('user_unit_progress').select('*').eq('user_id', userId).eq('status', 'completed');
    if (error) throw new Error(`user_unit_progress read failed: ${error.message}`);
    return (data as ProgressRow[]).map(progressFromRow);
  }

  /**
   * Atomic start (public.start_unit_progress): returns the active row, the completed row
   * of this revision, or a new row. Two simultaneous starts create one row.
   */
  async start(userId: string, unitId: string, revision: number, firstActivityId: string, scenarioNodeId: string | null): Promise<{ status: StartStatus; progress: Progress }> {
    const { data, error } = await this.supabase.rpc('start_unit_progress', {
      p_user_id: userId, p_unit_id: unitId, p_revision: revision,
      p_first_activity_id: firstActivityId, p_scenario_node_id: scenarioNodeId,
    });
    if (error) throw new Error(`start_unit_progress failed: ${error.message}`);
    const result = data as { status: StartStatus; progress: ProgressRow };
    return { status: result.status, progress: progressFromRow(result.progress) };
  }
}
