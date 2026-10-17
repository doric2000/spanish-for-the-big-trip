import type { PublicUnit } from '../../../content/src/api-contract';

export type OpeningStep =
  | { type: 'entry'; id: string; titleHe: string; bodyHe: string; actionLabelHe: string; sceneAssetId: string; sceneUrl: string | null;
    kickerHe: string | null; sceneCaption: string | null; characterNameHe: string | null }
  | { type: 'vocabulary'; id: string; expressionEs: string; meaningHe: string; characterNameHe: string; audioAssetId: string; audioUrl: string | null };

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
      steps.push({ type: 'vocabulary', id: activity.id, expressionEs: activity.expressionEs,
        meaningHe: activity.meaningHe,
        characterNameHe: nameOf(activity.characterId) ?? '',
        audioAssetId: activity.audioAssetId, audioUrl: urlOf(activity.audioAssetId) });
    } else break;
  }
  return steps;
}

export function moveOpeningStep(index: number, direction: 'next' | 'back', count: number) {
  // count is a preview boundary, not completed lesson/progress evidence.
  return Math.max(0, Math.min(count, index + (direction === 'next' ? 1 : -1)));
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
