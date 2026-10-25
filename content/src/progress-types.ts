import type { projectActivity } from './api-contract.js';

// The progress shapes the API returns, without the rules. Kept apart from progress.ts so
// the app can import them without Node-only modules (progress.ts hashes with node:crypto).
export type Evidence = 'viewed' | 'correct' | 'correct_with_help' | 'self_compared' | 'scenario_completed' | 'skipped';
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
