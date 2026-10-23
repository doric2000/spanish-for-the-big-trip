import { Inject, Injectable } from '@nestjs/common';
import type { AttemptRequest } from '@spanish-for-trip/content/api-contract';
import type { AttemptResult, Progress } from '@spanish-for-trip/content/progress';
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

// What public.submit_activity_attempt answers.
export type SubmitOutcome =
  | { status: 'stored' | 'replayed'; result: AttemptResult }
  | { status: 'conflict'; reason: 'request_id_reused' | 'progress_changed' }
  | { status: 'not_found' };

export interface SubmitInput {
  userId: string; unitId: string; request: AttemptRequest; fingerprint: string;
  result: AttemptResult;
}

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

  /** A stored attempt of this learner with this request id, or null. */
  async attempt(userId: string, requestId: string): Promise<{ fingerprint: string; result: AttemptResult } | null> {
    const { data, error } = await this.supabase
      .from('activity_attempts').select('request_fingerprint, server_result')
      .eq('user_id', userId).eq('request_id', requestId)
      .maybeSingle<{ request_fingerprint: string; server_result: AttemptResult }>();
    if (error) throw new Error(`activity_attempts read failed: ${error.message}`);
    return data ? { fingerprint: data.request_fingerprint, result: data.server_result } : null;
  }

  /**
   * Atomic submit (public.submit_activity_attempt): locks this learner's progress row,
   * replays a stored request, refuses a reused id or stale progress, otherwise stores
   * the attempt and the new progress in one transaction.
   */
  async submit(input: SubmitInput): Promise<SubmitOutcome> {
    const { request, result } = input;
    const { data, error } = await this.supabase.rpc('submit_activity_attempt', {
      p_user_id: input.userId, p_request_id: request.requestId, p_unit_id: input.unitId,
      p_revision: request.revision, p_activity_id: request.activityId, p_fingerprint: input.fingerprint,
      p_response: request.response, p_expected_version: request.expectedProgressVersion,
      p_result: result, p_progress: result.progress,
    });
    if (error) throw new Error(`submit_activity_attempt failed: ${error.message}`);
    return data as SubmitOutcome;
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
