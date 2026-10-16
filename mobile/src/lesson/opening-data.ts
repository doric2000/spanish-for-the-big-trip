import type { Unit } from '../../../content/src/schema';

export type OpeningStep =
  | { type: 'entry'; id: string; titleHe: string; bodyHe: string; actionLabelHe: string; scenePath: string | null }
  | { type: 'vocabulary'; id: string; expressionEs: string; meaningHe: string; characterNameHe: string; audioPath: string | null };

export function openingSteps(unit: Unit): OpeningStep[] {
  function approvedPath(assetId: string, kind: 'image' | 'audio') {
    const asset = unit.media.find(m => m.id === assetId && m.kind === kind);
    return asset?.status === 'approved' ? asset.path : null;
  }
  const steps: OpeningStep[] = [];
  // Stop at the first unsupported interaction; never skip preparation.
  for (const activity of unit.activities) {
    if (activity.type === 'entry') {
      steps.push({ type: 'entry', id: activity.id, titleHe: activity.titleHe,
        bodyHe: activity.bodyHe, actionLabelHe: activity.actionLabelHe,
        scenePath: approvedPath(activity.sceneAssetId, 'image') });
    } else if (activity.type === 'vocabulary_card') {
      steps.push({ type: 'vocabulary', id: activity.id, expressionEs: activity.expressionEs,
        meaningHe: activity.meaningHe,
        characterNameHe: unit.characters.find(c => c.id === activity.characterId)?.displayNameHe ?? '',
        audioPath: approvedPath(activity.audioAssetId, 'audio') });
    } else break;
  }
  return steps;
}

export function moveOpeningStep(index: number, direction: 'next' | 'back', count: number) {
  // count is a preview boundary, not completed lesson/progress evidence.
  return Math.max(0, Math.min(count, index + (direction === 'next' ? 1 : -1)));
}
