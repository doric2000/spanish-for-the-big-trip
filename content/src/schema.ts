import { z } from 'zod';

const text = z.string().trim().min(1);
const id = text.regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'Use a stable ID without spaces');
const review = z.strictObject({
  status: z.enum(['approved', 'needs_review']),
  source: text,
  note: text,
});
export const phases = ['context', 'preparation', 'preparation_check', 'dialogue', 'practice', 'scenario', 'review', 'summary'] as const;
const base = {
  id, review, phase: z.enum(phases), required: z.boolean(),
  introduces: z.array(id), uses: z.array(id), helpIds: z.array(id),
};
const choice = z.strictObject({ id, textHe: text });

const entry = z.strictObject({
  ...base, type: z.literal('entry'), titleHe: text, bodyHe: text,
  actionLabelHe: text, sceneAssetId: id,
});
const vocabulary = z.strictObject({
  ...base, type: z.literal('vocabulary_card'), expressionEs: text,
  meaningHe: text, characterId: id, audioAssetId: id,
});
const dialogue = z.strictObject({
  ...base, type: z.literal('dialogue'), titleHe: text,
  translationInitiallyVisible: z.boolean(),
  turns: z.array(z.strictObject({
    id, speakerId: id, textEs: text, translationHe: text, audioAssetId: id,
  })).min(2),
});
const listenSelect = z.strictObject({
  ...base, type: z.literal('listen_select'), titleHe: text, promptHe: text,
  expressionEs: text, audioAssetId: id,
  choices: z.array(choice).min(2), correctChoiceId: id,
  feedback: z.strictObject({ correctHe: text, retryHe: text }),
  allowWrittenHint: z.boolean(), scored: z.literal(false),
});
const arrange = z.strictObject({
  ...base, type: z.literal('arrange'), titleHe: text, promptHe: text,
  tiles: z.array(z.strictObject({ id, textEs: text })).min(2),
  expectedTileIds: z.array(id).min(2),
  feedback: z.strictObject({ correctHe: text, retryHe: text }),
});

const explanation = z.strictObject({
  ...base, type: z.literal('explanation'), titleHe: text, generalHe: text,
  examples: z.array(z.strictObject({ textEs: text, meaningHe: text })).min(1),
});
const speaking = z.strictObject({
  ...base, type: z.literal('speak_reveal'), promptHe: text,
  modelTextEs: text, audioAssetId: id, alternativeHe: text,
  completion: z.literal('self_comparison'),
});
const scenario = z.strictObject({
  ...base, type: z.literal('bounded_scenario'), titleHe: text,
  startNodeId: id, changedDetail: z.boolean(),
  nodes: z.array(z.strictObject({
    id, contextHe: text.optional(), promptHe: text.optional(),
    textEs: text.nullable(), translationHe: text.nullable(), audioAssetId: id.nullable(),
    terminal: z.boolean(),
    choices: z.array(z.strictObject({
      id, textEs: text, textHe: text,
      outcome: z.enum(['retry', 'advance']), nextNodeId: id.nullable(), feedbackHe: text,
    })),
  })).min(2),
});
const summary = z.strictObject({ ...base, type: z.literal('summary'), titleHe: text, bodyHe: text });

export const ActivitySchema = z.discriminatedUnion('type', [entry, vocabulary, dialogue, listenSelect, arrange, explanation, speaking, scenario, summary]);

const media = z.strictObject({
  id, kind: z.enum(['image', 'audio']), status: z.enum(['approved', 'pending']),
  // These are portable product-relative source paths, never temporary Figma URLs.
  path: text.nullable(), characterId: id.nullable(),
  note: text,
});

export const UnitSchema = z.strictObject({
  schemaVersion: z.literal(2), id, chapterId: id,
  aliases: z.array(id), revision: z.number().int().positive(),
  status: z.enum(['draft', 'published']), titleHe: text, goalHe: text,
  learnerLocale: z.literal('he-IL'), targetLocale: z.literal('es-MX'),
  requires: z.array(id), provides: z.array(id),
  languageItems: z.array(z.strictObject({ id, textEs: text, meaningHe: text })),
  preparedLanguage: z.strictObject({ understand: z.array(id), produce: z.array(id) }),
  help: z.array(z.strictObject({ id, titleHe: text, bodyHe: text, audioAssetId: id.nullable(), review })),
  completionScenarioId: id.nullable(),
  characters: z.array(z.strictObject({ id, displayNameHe: text, imageAssetId: id.nullable() })).min(1),
  media: z.array(media), activities: z.array(ActivitySchema).min(1),
  pendingStages: z.array(text),
  editorial: z.strictObject({ source: text, note: text }),
}).superRefine((unit, ctx) => {
  function issue(path: (string | number)[], message: string) {
    ctx.addIssue({ code: 'custom', path, message });
  }
  function unique(values: string[], path: (string | number)[]) {
    const seen = new Set<string>();
    values.forEach((value, i) => {
      if (seen.has(value)) issue([...path, i], `Duplicate ID: ${value}`);
      seen.add(value);
    });
  }
  unique(unit.activities.map(a => a.id), ['activities']);
  unique(unit.media.map(a => a.id), ['media']);
  unique(unit.characters.map(c => c.id), ['characters']);
  unique(unit.aliases, ['aliases']);
  unique(unit.requires, ['requires']);
  unique(unit.provides, ['provides']);
  unique(unit.languageItems.map(l => l.id), ['languageItems']);
  unique(unit.help.map(h => h.id), ['help']);
  unique(unit.preparedLanguage.understand, ['preparedLanguage', 'understand']);
  unique(unit.preparedLanguage.produce, ['preparedLanguage', 'produce']);
  const language = new Set(unit.languageItems.map(l => l.id));
  const help = new Set(unit.help.map(h => h.id));
  const prepared = new Set<string>();
  for (const mode of ['understand', 'produce'] as const) {
    for (const value of unit.preparedLanguage[mode]) {
      if (!language.has(value)) issue(['preparedLanguage', mode], `Unknown language item: ${value}`);
    }
  }
  for (const value of unit.preparedLanguage.produce) {
    if (!unit.preparedLanguage.understand.includes(value)) issue(['preparedLanguage', 'produce'], 'Production must also be prepared for understanding');
  }
  const assets = new Map(unit.media.map(a => [a.id, a]));
  const characters = new Set(unit.characters.map(c => c.id));
  function assetRef(value: string, kind: 'image' | 'audio', path: (string | number)[]) {
    if (assets.get(value)?.kind !== kind) issue(path, `Unknown ${kind} asset: ${value}`);
  }
  unit.media.forEach((asset, i) => {
    if (asset.status === 'approved' && !asset.path) issue(['media', i, 'path'], 'Approved media requires a file');
    if (asset.path && (!asset.path.startsWith('assets/') || asset.path.includes('\\') || asset.path.split('/').some(p => p === '..' || p === '.' || p === ''))) {
      issue(['media', i, 'path'], 'Use an assets/ path inside the product repository');
    }
    if (asset.characterId && !characters.has(asset.characterId)) issue(['media', i, 'characterId'], 'Unknown character');
  });
  unit.characters.forEach((character, i) => {
    if (character.imageAssetId) assetRef(character.imageAssetId, 'image', ['characters', i, 'imageAssetId']);
  });
  unit.help.forEach((item, i) => {
    if (item.audioAssetId) assetRef(item.audioAssetId, 'audio', ['help', i, 'audioAssetId']);
    if (unit.status === 'published' && item.review.status !== 'approved') issue(['help', i, 'review'], 'Publication requires reviewed help');
  });
  let previousPhase = -1;
  unit.activities.forEach((activity, i) => {
    const path = ['activities', i];
    const phase = phases.indexOf(activity.phase);
    if (phase < previousPhase) issue([...path, 'phase'], 'Learner phases must remain in teaching order');
    previousPhase = phase;
    const allowed = {
      entry: ['context'], vocabulary_card: ['preparation'], explanation: ['preparation'],
      listen_select: ['preparation_check', 'practice', 'review'], dialogue: ['dialogue'],
      speak_reveal: ['practice', 'review'], arrange: ['practice', 'review'], bounded_scenario: ['scenario'], summary: ['summary'],
    };
    if (!(allowed[activity.type] as readonly string[]).includes(activity.phase)) issue([...path, 'phase'], 'Activity type does not match its learning phase');
    for (const field of ['introduces', 'uses', 'helpIds'] as const) unique(activity[field], [...path, field]);
    for (const value of activity.helpIds) if (!help.has(value)) issue([...path, 'helpIds'], `Unknown help: ${value}`);
    if (activity.introduces.length && activity.phase !== 'preparation') issue([...path, 'introduces'], 'New language belongs in preparation before use');
    for (const value of activity.introduces) {
      if (!language.has(value)) issue([...path, 'introduces'], `Unknown language item: ${value}`);
      prepared.add(value);
    }
    for (const value of activity.uses) {
      if (!language.has(value)) issue([...path, 'uses'], `Unknown language item: ${value}`);
      else if (!prepared.has(value)) issue([...path, 'uses'], `Language used before preparation: ${value}`);
      if (!unit.preparedLanguage.understand.includes(value)) issue([...path, 'uses'], `Language not declared for understanding: ${value}`);
      if (['speak_reveal', 'arrange', 'bounded_scenario'].includes(activity.type) && !unit.preparedLanguage.produce.includes(value)) issue([...path, 'uses'], `Language not declared for production: ${value}`);
    }
    if (activity.type === 'entry') assetRef(activity.sceneAssetId, 'image', [...path, 'sceneAssetId']);
    if ('audioAssetId' in activity) assetRef(activity.audioAssetId, 'audio', [...path, 'audioAssetId']);
    if (activity.type === 'vocabulary_card' && !characters.has(activity.characterId)) issue([...path, 'characterId'], 'Unknown character');
    if (activity.type === 'dialogue') {
      unique(activity.turns.map(t => t.id), [...path, 'turns']);
      activity.turns.forEach((turn, j) => {
        if (!characters.has(turn.speakerId)) issue([...path, 'turns', j, 'speakerId'], 'Unknown speaker');
        assetRef(turn.audioAssetId, 'audio', [...path, 'turns', j, 'audioAssetId']);
      });
    }
    if (activity.type === 'listen_select') {
      unique(activity.choices.map(c => c.id), [...path, 'choices']);
      if (!activity.choices.some(c => c.id === activity.correctChoiceId)) issue([...path, 'correctChoiceId'], 'Correct answer does not exist in choices');
    }
    if (activity.type === 'arrange') {
      unique(activity.tiles.map(t => t.id), [...path, 'tiles']);
      unique(activity.expectedTileIds, [...path, 'expectedTileIds']);
      const tiles = new Set(activity.tiles.map(t => t.id));
      if (activity.expectedTileIds.length !== activity.tiles.length) issue([...path, 'expectedTileIds'], 'Arrangement must use every tile exactly once');
      for (const tileId of activity.expectedTileIds) {
        if (!tiles.has(tileId)) issue([...path, 'expectedTileIds'], `Unknown answer tile: ${tileId}`);
      }
    }
    if (activity.type === 'bounded_scenario') {
      unique(activity.nodes.map(n => n.id), [...path, 'nodes']);
      const nodes = new Map(activity.nodes.map(n => [n.id, n]));
      if (!nodes.has(activity.startNodeId)) issue([...path, 'startNodeId'], 'Unknown scenario start node');
      activity.nodes.forEach((node, j) => {
        const hasSpeech = node.textEs !== null;
        if ((node.translationHe !== null) !== hasSpeech || (node.audioAssetId !== null) !== hasSpeech) issue([...path, 'nodes', j], 'Scenario speech, translation and audio must be present together or all null');
        if (!hasSpeech && !node.contextHe) issue([...path, 'nodes', j, 'contextHe'], 'Nonverbal scenario nodes require visible context');
        if (!hasSpeech && !node.terminal && !node.promptHe) issue([...path, 'nodes', j, 'promptHe'], 'Nonverbal choice nodes require a learner prompt');
        if (node.audioAssetId !== null) assetRef(node.audioAssetId, 'audio', [...path, 'nodes', j, 'audioAssetId']);
        unique(node.choices.map(c => c.id), [...path, 'nodes', j, 'choices']);
        if (node.terminal === (node.choices.length > 0)) issue([...path, 'nodes', j], 'Only terminal nodes have no choices');
        for (const choice of node.choices) {
          if (choice.outcome === 'advance' && (!choice.nextNodeId || !nodes.has(choice.nextNodeId))) issue([...path, 'nodes', j], 'Unknown scenario destination');
          if (choice.outcome === 'retry' && choice.nextNodeId !== null) issue([...path, 'nodes', j], 'Retry must stay at the current node');
        }
      });
      const visited = new Set<string>();
      const stack = new Set<string>();
      function visit(nodeId: string): boolean {
        const node = nodes.get(nodeId);
        if (!node) return false;
        if (stack.has(nodeId)) { issue([...path, 'nodes'], 'Scenario advance branches must not cycle'); return false; }
        if (visited.has(nodeId)) return true;
        visited.add(nodeId); stack.add(nodeId);
        let reachesEnd = node.terminal;
        for (const choice of node.choices.filter(c => c.outcome === 'advance')) {
          const reachable = visit(choice.nextNodeId!);
          if (!reachable) issue([...path, 'nodes'], `Branch cannot finish: ${nodeId}`);
          reachesEnd = reachable || reachesEnd;
        }
        if (!reachesEnd) issue([...path, 'nodes'], `Scenario node cannot finish: ${nodeId}`);
        stack.delete(nodeId);
        return reachesEnd;
      }
      visit(activity.startNodeId);
      if (visited.size !== nodes.size) issue([...path, 'nodes'], 'Scenario contains unreachable nodes');
    }
    if (unit.status === 'published' && activity.review.status !== 'approved') issue([...path, 'review'], 'Publication requires reviewed activity copy');
  });
  if (unit.status === 'published') {
    for (const phase of phases) {
      if (!unit.activities.some(a => a.phase === phase && a.required)) issue(['activities'], `Publication requires a mandatory ${phase} activity`);
    }
    if (!unit.activities.some(a => a.type === 'speak_reveal' && a.required)) issue(['activities'], 'Publication requires self-comparison speaking practice');
    if (unit.pendingStages.length) issue(['pendingStages'], 'Publication blocked: learner stages are incomplete');
    unit.media.forEach((asset, i) => {
      if (asset.status !== 'approved') issue(['media', i, 'status'], 'Publication requires approved media');
    });
  }
  if (unit.completionScenarioId !== null) {
    const activity = unit.activities.find(a => a.id === unit.completionScenarioId);
    if (activity?.type !== 'bounded_scenario' || !activity.required || !activity.changedDetail) issue(['completionScenarioId'], 'Completion requires a mandatory scenario with a changed familiar detail');
  } else if (unit.status === 'published') issue(['completionScenarioId'], 'Publication requires a completion scenario');
  if (unit.status === 'published') {
    for (const value of [...unit.preparedLanguage.understand, ...unit.preparedLanguage.produce]) {
      if (!prepared.has(value)) issue(['preparedLanguage'], `Declared language has no preparation: ${value}`);
    }
  }
});

export type Unit = z.infer<typeof UnitSchema>;
export type Activity = z.infer<typeof ActivitySchema>;

// The same publication gate will be used by a later importer. This never writes to a database.
export function validateUnit(input: unknown, forPublication = false) {
  if (forPublication && typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return UnitSchema.safeParse({ ...input, status: 'published' });
  }
  return UnitSchema.safeParse(input);
}
