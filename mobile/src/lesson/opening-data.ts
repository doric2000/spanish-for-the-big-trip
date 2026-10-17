import type { PublicUnit } from '../../../content/src/api-contract';

export type OpeningStep =
  | { type: 'entry'; id: string; titleHe: string; bodyHe: string; actionLabelHe: string; sceneAssetId: string; sceneUrl: string | null }
  | { type: 'vocabulary'; id: string; expressionEs: string; meaningHe: string; characterNameHe: string; audioAssetId: string; audioUrl: string | null };

// Reads the learner projection from the API, so answers never reach the app.
export function openingSteps(unit: PublicUnit): OpeningStep[] {
  // The server returns url null for media that is not hosted or not approved yet.
  const urlOf = (assetId: string) => unit.media.find(m => m.id === assetId)?.url ?? null;
  const steps: OpeningStep[] = [];
  // Stop at the first unsupported interaction; never skip preparation.
  for (const activity of unit.activities) {
    if (activity.type === 'entry') {
      steps.push({ type: 'entry', id: activity.id, titleHe: activity.titleHe,
        bodyHe: activity.bodyHe, actionLabelHe: activity.actionLabelHe,
        sceneAssetId: activity.sceneAssetId, sceneUrl: urlOf(activity.sceneAssetId) });
    } else if (activity.type === 'vocabulary_card') {
      steps.push({ type: 'vocabulary', id: activity.id, expressionEs: activity.expressionEs,
        meaningHe: activity.meaningHe,
        characterNameHe: unit.characters.find(c => c.id === activity.characterId)?.displayNameHe ?? '',
        audioAssetId: activity.audioAssetId, audioUrl: urlOf(activity.audioAssetId) });
    } else break;
  }
  return steps;
}

export function moveOpeningStep(index: number, direction: 'next' | 'back', count: number) {
  // count is a preview boundary, not completed lesson/progress evidence.
  return Math.max(0, Math.min(count, index + (direction === 'next' ? 1 : -1)));
}
