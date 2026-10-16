import { z } from 'zod';
import type { Activity, Unit } from './schema.js';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
export const StartRequestSchema = z.strictObject({});
export const AttemptRequestSchema = z.strictObject({
  requestId: z.uuid(), revision: z.number().int().positive(), activityId: id,
  expectedProgressVersion: z.number().int().nonnegative(),
  response: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('continue') }),
    z.strictObject({ kind: z.literal('choice'), choiceId: id }),
    z.strictObject({ kind: z.literal('arrange'), tileIds: z.array(id).min(1) }),
    z.strictObject({ kind: z.literal('scenario_choice'), nodeId: id, choiceId: id }),
    z.strictObject({ kind: z.literal('self_comparison'), mode: z.enum(['recording', 'without_microphone']), compared: z.literal(true) }),
    z.strictObject({ kind: z.literal('written_hint') }),
    z.strictObject({ kind: z.literal('help'), helpId: id }),
    z.strictObject({ kind: z.literal('skip') }),
  ]),
});
export type AttemptRequest = z.infer<typeof AttemptRequestSchema>;
export const PendingSubmissionSchema = z.strictObject({ userId: z.uuid(), unitId: id, request: AttemptRequestSchema });
export function restorePending(input: unknown, userId: string) {
  const result = PendingSubmissionSchema.safeParse(input);
  return result.success && result.data.userId === userId ? result.data : null;
}

// An explicit allowlist, never a spread/omit of the authoring payload.
export function projectActivity(activity: Activity, scenarioNodeId?: string) {
  const common = { id: activity.id, type: activity.type, phase: activity.phase, required: activity.required, helpIds: [...activity.helpIds] };
  switch (activity.type) {
    case 'entry': return { ...common, titleHe: activity.titleHe, bodyHe: activity.bodyHe, actionLabelHe: activity.actionLabelHe, sceneAssetId: activity.sceneAssetId };
    case 'vocabulary_card': return { ...common, expressionEs: activity.expressionEs, meaningHe: activity.meaningHe, characterId: activity.characterId, audioAssetId: activity.audioAssetId };
    case 'explanation': return { ...common, titleHe: activity.titleHe, generalHe: activity.generalHe, examples: activity.examples.map(e => ({ textEs: e.textEs, meaningHe: e.meaningHe })) };
    case 'dialogue': return { ...common, titleHe: activity.titleHe, translationInitiallyVisible: activity.translationInitiallyVisible, turns: activity.turns.map(t => ({ id: t.id, speakerId: t.speakerId, textEs: t.textEs, translationHe: t.translationHe, audioAssetId: t.audioAssetId })) };
    case 'listen_select': return { ...common, titleHe: activity.titleHe, promptHe: activity.promptHe, audioAssetId: activity.audioAssetId, choices: activity.choices.map(c => ({ id: c.id, textHe: c.textHe })), allowWrittenHint: activity.allowWrittenHint, scored: activity.scored };
    case 'arrange': return { ...common, titleHe: activity.titleHe, promptHe: activity.promptHe, tiles: activity.tiles.map(t => ({ id: t.id, textEs: t.textEs })) };
    case 'speak_reveal': return { ...common, promptHe: activity.promptHe, modelTextEs: activity.modelTextEs, audioAssetId: activity.audioAssetId, alternativeHe: activity.alternativeHe, completion: activity.completion };
    case 'bounded_scenario': {
      const node = activity.nodes.find(n => n.id === (scenarioNodeId ?? activity.startNodeId));
      if (!node) throw new Error('Unknown scenario node');
      return { ...common, titleHe: activity.titleHe, node: {
        id: node.id,
        ...(node.contextHe ? { contextHe: node.contextHe } : {}),
        ...(node.promptHe ? { promptHe: node.promptHe } : {}),
        textEs: node.textEs, translationHe: node.translationHe, audioAssetId: node.audioAssetId,
        terminal: node.terminal, choices: node.choices.map(c => ({ id: c.id, textEs: c.textEs, textHe: c.textHe })),
      } };
    }
    case 'summary': return { ...common, titleHe: activity.titleHe, bodyHe: activity.bodyHe };
  }
}

export function projectUnit(unit: Unit, assetUrls: Readonly<Record<string, string>>, scenarioNodes: Readonly<Record<string, string>> = {}) {
  if (unit.status !== 'published') throw new Error('Drafts are not learner-readable');
  return {
    schemaVersion: unit.schemaVersion, id: unit.id, chapterId: unit.chapterId, revision: unit.revision,
    titleHe: unit.titleHe, goalHe: unit.goalHe, learnerLocale: unit.learnerLocale, targetLocale: unit.targetLocale,
    characters: unit.characters.map(c => ({ id: c.id, displayNameHe: c.displayNameHe, imageAssetId: c.imageAssetId })),
    media: unit.media.map(m => {
      const url = assetUrls[m.id];
      if (m.status !== 'approved' || !url || new URL(url).protocol !== 'https:') throw new Error(`Missing approved HTTPS media: ${m.id}`);
      return { id: m.id, kind: m.kind, url };
    }),
    help: unit.help.map(h => ({ id: h.id, titleHe: h.titleHe, bodyHe: h.bodyHe, audioAssetId: h.audioAssetId })),
    activities: unit.activities.map(a => projectActivity(a, scenarioNodes[a.id])),
  };
}
export type PublicUnit = ReturnType<typeof projectUnit>;
export type PublicActivity = ReturnType<typeof projectActivity>;
