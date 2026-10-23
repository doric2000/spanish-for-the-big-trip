import { AttemptRequestSchema, projectActivity, type AttemptRequest } from './api-contract.js';
import { canonicalJson, sha256 } from './digest.js';
import type { Unit } from './schema.js';

export class ContractError extends Error {
  constructor(public readonly status: 400 | 401 | 404 | 409, message: string) { super(message); }
}
// Supplied by the future authentication guard, never parsed from a request body.
export type VerifiedActor = { userId: string; provider: 'google' | 'apple' };
type Evidence = 'viewed' | 'correct' | 'correct_with_help' | 'self_compared' | 'scenario_completed' | 'skipped';
export type Progress = {
  userId: string; unitId: string; revision: number; status: 'in_progress' | 'completed';
  currentActivityId: string | null; progressVersion: number; scenarioNodeId: string | null;
  usedHelpForCurrent: boolean;
  completed: { activityId: string; evidence: Evidence; usedHelp: boolean; comparisonMode: 'recording' | 'without_microphone' | null }[];
};
export type AttemptResult = {
  outcome: Evidence | 'retry' | 'advanced' | 'help'; feedbackHe: string | null;
  revealed: ReturnType<typeof projectActivity> | { expressionEs: string } | { titleHe: string; bodyHe: string; audioAssetId: string | null } | null;
  progress: Progress;
};
export type StoredAttempt = { userId: string; requestId: string; fingerprint: string; result: AttemptResult };
export type SubmissionState = { progress: Progress; attempts: StoredAttempt[] };

function identity(actor: VerifiedActor | null): asserts actor is VerifiedActor {
  if (!actor?.userId || !['google', 'apple'].includes(actor.provider)) throw new ContractError(401, 'A verified Google/Apple session is required');
}
// allowDraft is only for local development (approved-decisions.json#stage05_atomic_attempt_functions):
// it lets a learner start and answer the latest draft. It never makes a draft count as a
// completed unit; prerequisites below read only published revisions.
export type ProgressOptions = { allowDraft?: boolean };
function available(unit: Unit, options: ProgressOptions) {
  if (unit.status !== 'published' && !options.allowDraft) throw new ContractError(404, 'Unit is not available');
}
export function startUnit(actor: VerifiedActor | null, latest: Unit, existing: readonly Progress[], completedRevisions: readonly Unit[], options: ProgressOptions = {}): Progress {
  identity(actor);
  const own = existing.filter(p => p.userId === actor.userId && p.unitId === latest.id);
  const active = own.find(p => p.status === 'in_progress');
  if (active) return structuredClone(active); // Caller must load this pinned revision, not latest.
  available(latest, options);
  const skills = new Set(completedRevisions.filter(u => u.status === 'published' && existing.some(p => p.userId === actor.userId && p.unitId === u.id && p.revision === u.revision && p.status === 'completed')).flatMap(u => u.provides));
  if (latest.requires.some(s => !skills.has(s))) throw new ContractError(404, 'Prerequisites are not complete');
  const completed = own.find(p => p.revision === latest.revision && p.status === 'completed');
  if (completed) return structuredClone(completed);
  const first = latest.activities[0]!;
  return { userId: actor.userId, unitId: latest.id, revision: latest.revision, status: 'in_progress', currentActivityId: first.id, progressVersion: 0, scenarioNodeId: first.type === 'bounded_scenario' ? first.startNodeId : null, usedHelpForCurrent: false, completed: [] };
}

// Pure local reference implementation. PostgreSQL transaction/lock/unique-key
// enforcement belongs to04; the NestJS transport and durable mobile queue to05.
export function applyAttempt(actor: VerifiedActor | null, unit: Unit, state: SubmissionState, input: unknown, options: ProgressOptions = {}): { state: SubmissionState; result: AttemptResult; replayed: boolean } {
  identity(actor); available(unit, options);
  if (state.progress.userId !== actor.userId || state.progress.unitId !== unit.id) throw new ContractError(404, 'Progress is not available');
  const parsed = AttemptRequestSchema.safeParse(input);
  if (!parsed.success) throw new ContractError(400, 'Invalid attempt request');
  const request: AttemptRequest = parsed.data;
  const fingerprint = sha256(canonicalJson({ unitId: unit.id, ...request }));
  const previous = state.attempts.find(a => a.userId === actor.userId && a.requestId === request.requestId);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new ContractError(409, 'Request ID was already used for different input');
    return { state: structuredClone(state), result: structuredClone(previous.result), replayed: true };
  }
  const progress = structuredClone(state.progress);
  const activity = unit.activities.find(a => a.id === request.activityId);
  if (!activity) throw new ContractError(400, 'Unknown activity');
  if (request.revision !== unit.revision || progress.revision !== unit.revision || request.expectedProgressVersion !== progress.progressVersion || progress.currentActivityId !== activity.id || progress.status !== 'in_progress') throw new ContractError(409, 'Progress or revision changed; reload progress');
  const response = request.response;
  let outcome: AttemptResult['outcome'] = 'viewed';
  let feedbackHe: string | null = null;
  let revealed: AttemptResult['revealed'] = null;
  let completed = false;
  if (response.kind === 'skip') {
    if (activity.required) throw new ContractError(400, 'Required activities cannot be skipped');
    outcome = 'skipped'; completed = true;
  } else if (response.kind === 'help') {
    const help = unit.help.find(h => h.id === response.helpId && activity.helpIds.includes(h.id));
    if (!help) throw new ContractError(400, 'Help is not available for this activity');
    outcome = 'help'; progress.usedHelpForCurrent = true;
    revealed = { titleHe: help.titleHe, bodyHe: help.bodyHe, audioAssetId: help.audioAssetId };
  } else if (response.kind === 'written_hint') {
    if (activity.type !== 'listen_select' || !activity.allowWrittenHint) throw new ContractError(400, 'Written hint is not available');
    outcome = 'help'; progress.usedHelpForCurrent = true; revealed = { expressionEs: activity.expressionEs };
  } else if (activity.type === 'listen_select' && response.kind === 'choice') {
    if (!activity.choices.some(c => c.id === response.choiceId)) throw new ContractError(400, 'Unknown choice');
    completed = response.choiceId === activity.correctChoiceId;
    outcome = completed ? (progress.usedHelpForCurrent ? 'correct_with_help' : 'correct') : 'retry';
    if (!completed) progress.usedHelpForCurrent = true; // Corrective feedback is assistance too.
    feedbackHe = completed ? activity.feedback.correctHe : activity.feedback.retryHe;
  } else if (activity.type === 'arrange' && response.kind === 'arrange') {
    const tiles = new Set(activity.tiles.map(t => t.id));
    if (response.tileIds.length !== tiles.size || new Set(response.tileIds).size !== tiles.size || response.tileIds.some(tileId => !tiles.has(tileId))) throw new ContractError(400, 'Use each available tile exactly once');
    completed = response.tileIds.every((tileId, index) => tileId === activity.expectedTileIds[index]);
    outcome = completed ? (progress.usedHelpForCurrent ? 'correct_with_help' : 'correct') : 'retry';
    if (!completed) progress.usedHelpForCurrent = true;
    feedbackHe = completed ? activity.feedback.correctHe : activity.feedback.retryHe;
  } else if (activity.type === 'speak_reveal' && response.kind === 'self_comparison') {
    outcome = 'self_compared'; completed = true;
  } else if (activity.type === 'bounded_scenario' && response.kind === 'scenario_choice') {
    const node = activity.nodes.find(n => n.id === progress.scenarioNodeId);
    if (!node || response.nodeId !== node.id) throw new ContractError(409, 'Scenario node changed');
    const choice = node.choices.find(c => c.id === response.choiceId);
    if (!choice) throw new ContractError(400, 'Unknown scenario choice');
    feedbackHe = choice.feedbackHe;
    if (choice.outcome === 'retry') { outcome = 'retry'; progress.usedHelpForCurrent = true; }
    else {
      const next = activity.nodes.find(n => n.id === choice.nextNodeId)!;
      progress.scenarioNodeId = next.id; revealed = projectActivity(activity, next.id);
      completed = next.terminal; outcome = completed ? 'scenario_completed' : 'advanced';
    }
  } else if (['entry', 'vocabulary_card', 'explanation', 'dialogue', 'summary'].includes(activity.type) && response.kind === 'continue') {
    completed = true; outcome = 'viewed';
  } else throw new ContractError(400, 'Response does not match the activity type');
  if (completed) {
    progress.completed.push({ activityId: activity.id, evidence: outcome as Evidence, usedHelp: progress.usedHelpForCurrent, comparisonMode: response.kind === 'self_comparison' ? response.mode : null });
    const next = unit.activities[unit.activities.findIndex(a => a.id === activity.id) + 1];
    progress.currentActivityId = next?.id ?? null;
    progress.scenarioNodeId = next?.type === 'bounded_scenario' ? next.startNodeId : null;
    progress.usedHelpForCurrent = false;
    if (!next) {
      if (unit.activities.some(a => a.required && !progress.completed.some(c => c.activityId === a.id && c.evidence !== 'skipped'))) throw new ContractError(409, 'Required activities are incomplete');
      progress.status = 'completed';
    }
  }
  progress.progressVersion += 1;
  const result: AttemptResult = { outcome, feedbackHe, revealed, progress };
  const attempt: StoredAttempt = { userId: actor.userId, requestId: request.requestId, fingerprint, result: structuredClone(result) };
  return { state: { progress, attempts: [...structuredClone(state.attempts), attempt] }, result: structuredClone(result), replayed: false };
}
