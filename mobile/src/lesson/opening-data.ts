import type { PublicUnit } from '../../../content/src/api-contract';

export type OpeningStep =
  | { type: 'entry'; id: string; titleHe: string; bodyHe: string; actionLabelHe: string; sceneAssetId: string; sceneUrl: string | null;
    kickerHe: string | null; sceneCaption: string | null; characterNameHe: string | null }
  | { type: 'vocabulary'; id: string; expressionEs: string; meaningHe: string; characterNameHe: string;
    characterImageAssetId: string | null; characterImageUrl: string | null; audioAssetId: string; audioUrl: string | null };

// Reads the learner projection from the API, so answers never reach the app.
export function openingSteps(unit: PublicUnit): OpeningStep[] {
  // The server returns url null for media that is not hosted or not approved yet.
  const urlOf = (assetId: string) => unit.media.find(m => m.id === assetId)?.url ?? null;
  const nameOf = (characterId: string) => unit.characters.find(c => c.id === characterId)?.displayNameHe ?? null;
  const steps: OpeningStep[] = [];
  // Stop at the first unsupported interaction; never skip preparation.
  for (const activity of unit.activities) {
    if (activity.type === 'entry') {
      steps.push({ type: 'entry', id: activity.id, titleHe: activity.titleHe,
        bodyHe: activity.bodyHe, actionLabelHe: activity.actionLabelHe,
        sceneAssetId: activity.sceneAssetId, sceneUrl: urlOf(activity.sceneAssetId),
        kickerHe: activity.kickerHe ?? null, sceneCaption: activity.sceneCaption ?? null,
        characterNameHe: activity.characterId ? nameOf(activity.characterId) : null });
    } else if (activity.type === 'vocabulary_card') {
      const imageAssetId = unit.characters.find(c => c.id === activity.characterId)?.imageAssetId ?? null;
      steps.push({ type: 'vocabulary', id: activity.id, expressionEs: activity.expressionEs,
        meaningHe: activity.meaningHe,
        characterNameHe: nameOf(activity.characterId) ?? '',
        characterImageAssetId: imageAssetId, characterImageUrl: imageAssetId ? urlOf(imageAssetId) : null,
        audioAssetId: activity.audioAssetId, audioUrl: urlOf(activity.audioAssetId) });
    } else break;
  }
  return steps;
}

export function moveOpeningStep(index: number, direction: 'next' | 'back', count: number) {
  // count is a preview boundary, not completed lesson/progress evidence.
  return Math.max(0, Math.min(count, index + (direction === 'next' ? 1 : -1)));
}

type ServerProgress = { status: 'in_progress' | 'completed'; currentActivityId: string | null; revision: number; progressVersion: number };

// The furthest step the server allows. An activity past the supported prefix, or a
// completed unit, maps to steps.length: the preview's end screen.
export function frontierIndex(steps: readonly OpeningStep[], progress: ServerProgress) {
  if (progress.status === 'completed') return steps.length;
  const index = steps.findIndex(s => s.id === progress.currentActivityId);
  return index === -1 ? steps.length : index;
}

// "Continue" on the current activity. The requestId is created once per tap and reused
// for every retry of that tap, so a resend never counts twice.
export function continueRequest(progress: ServerProgress & { currentActivityId: string }, requestId: string) {
  return { requestId, revision: progress.revision, activityId: progress.currentActivityId,
    expectedProgressVersion: progress.progressVersion, response: { kind: 'continue' as const } };
}

// A tap the server had not confirmed when the app closed, saved with its owner.
export type ContinueRequest = ReturnType<typeof continueRequest>;
export type PendingAttempt = { userId: string; unitId: string; request: ContinueRequest };

// Restores a saved tap only if it belongs to this learner and unit and is exactly the
// request for where the server stands now. If the progress already moved on, resending
// it would return the old stored answer and jump the screen back, so it is dropped.
export function restorablePending(saved: string | null, userId: string, unitId: string, progress: ServerProgress) {
  if (!saved || progress.status !== 'in_progress' || !progress.currentActivityId) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(saved); } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  const { userId: owner, unitId: unit, request } = parsed as Partial<PendingAttempt>;
  if (owner !== userId || unit !== unitId || !request || typeof request.requestId !== 'string') return null;
  const expected = continueRequest({ ...progress, currentActivityId: progress.currentActivityId }, request.requestId);
  return JSON.stringify(request) === JSON.stringify(expected) ? expected : null;
}

// Display codes from the stable unit id: C01-U01 -> { short: '1A', long: 'C01·U01' }.
// Any other id shape is shown as is.
export function unitCodes(unitId: string) {
  const match = /^C(\d{2})-U(\d{2})$/.exec(unitId);
  const unit = match ? Number(match[2]) : 0;
  if (!match || unit < 1 || unit > 26) return { short: unitId, long: unitId };
  return { short: `${Number(match[1])}${String.fromCharCode(64 + unit)}`, long: `C${match[1]}·U${match[2]}` };
}

// Header code, e.g. 1A·01/16: the activity position within the whole unit.
export function activityCode(unitId: string, index: number, count: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${unitCodes(unitId).short}·${pad(index + 1)}/${pad(count)}`;
}

// Figma vocabulary State=Long text (Karantina 60 instead of 104): a phrase, or a word
// too long for one line at 104pt. "Gracias" (7) still fits; "Buenos días" does not.
export function isLongExpression(expressionEs: string) {
  return expressionEs.trim().length > 8;
}
