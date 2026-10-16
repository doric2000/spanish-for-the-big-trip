import { z } from 'zod';
import { validateUnit, type Unit } from './schema.js';
import { checkMediaFiles } from './cli.js';
import { checkSkillGraph } from './curriculum.js';
import { unitDigest } from './digest.js';

const id = z.string().min(1);
export const ChapterPlanSchema = z.strictObject({
  schemaVersion: z.literal(1), curriculumVersion: z.number().int().positive(),
  course: z.strictObject({ id, titleHe: id }),
  productionOrder: z.array(id).min(1),
  skillIds: z.array(id).min(1),
  chapters: z.array(z.strictObject({ id, titleHe: id, unitIds: z.array(id).min(1) })).min(1),
}).superRefine((plan, ctx) => {
  const chapterIds = plan.chapters.map(c => c.id);
  const unitIds = plan.chapters.flatMap(c => c.unitIds);
  if (new Set(plan.skillIds).size !== plan.skillIds.length) ctx.addIssue({ code: 'custom', message: 'Duplicate skill ID' });
  if (new Set(chapterIds).size !== chapterIds.length || new Set(unitIds).size !== unitIds.length) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate chapter or unit ID in release plan' });
  }
  if (JSON.stringify(chapterIds) !== JSON.stringify(plan.productionOrder)) {
    ctx.addIssue({ code: 'custom', message: 'Chapter list must match production order' });
  }
});

export type ChapterPlan = z.infer<typeof ChapterPlanSchema>;

const check = z.strictObject({ status: z.enum(['pending', 'passed']), evidence: z.string().trim().min(1).nullable() });
const ReviewsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  chapters: z.array(z.strictObject({
    chapterId: id, unitRevisions: z.record(id, z.number().int().positive()),
    unitDigests: z.record(id, z.string().regex(/^[a-f0-9]{64}$/)),
    checks: z.strictObject({ contentCopy: check, naturalAudio: check, iphoneFlow: check, savedProgress: check, changedDetailTask: check }),
  })),
}).superRefine((reviews, ctx) => {
  const ids = reviews.chapters.map(c => c.chapterId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Duplicate chapter review' });
});

// Authoring preflight only. A future publisher must call this before exposing a
// chapter. It does not certify language quality or perform publication itself.
export async function checkChapterRelease(
  planInput: unknown, reviewInput: unknown, unitInputs: unknown[],
  requestedChapterIds: string[], productRoot: string,
): Promise<{ ready: boolean; issues: string[]; unitIds: string[] }> {
  const issues: string[] = [];
  const planResult = ChapterPlanSchema.safeParse(planInput);
  const reviewResult = ReviewsSchema.safeParse(reviewInput);
  if (!planResult.success) issues.push(`Release plan: ${planResult.error.message}`);
  if (!reviewResult.success) issues.push(`Chapter reviews: ${reviewResult.error.message}`);
  if (!planResult.success || !reviewResult.success) return { ready: false, issues, unitIds: [] };
  const plan = planResult.data;
  if (!requestedChapterIds.length || JSON.stringify(requestedChapterIds) !== JSON.stringify(plan.productionOrder.slice(0, requestedChapterIds.length))) {
    return { ready: false, issues: ['Release must contain a nonempty prefix of the planned chapter order'], unitIds: [] };
  }
  const rawUnits = new Map<string, unknown>();
  for (const input of unitInputs) {
    if (typeof input !== 'object' || input === null || !('id' in input) || typeof input.id !== 'string') {
      issues.push('Unit source has no stable ID');
      continue;
    }
    if (rawUnits.has(input.id)) issues.push(`Duplicate unit source: ${input.id}`);
    rawUnits.set(input.id, input);
  }
  const skills = new Set<string>();
  const validatedUnits: Unit[] = [];
  const unitIds: string[] = [];
  for (const chapter of plan.chapters.filter(c => requestedChapterIds.includes(c.id))) {
    const review = reviewResult.data.chapters.find(r => r.chapterId === chapter.id);
    if (!review) issues.push(`${chapter.id}: chapter review is missing`);
    if (review) {
      for (const field of ['unitRevisions', 'unitDigests'] as const) {
        if (JSON.stringify(Object.keys(review[field]).sort()) !== JSON.stringify([...chapter.unitIds].sort())) issues.push(`${chapter.id}: ${field} must cover exactly the planned chapter units`);
      }
      for (const [name, result] of Object.entries(review.checks)) {
        if (result.status !== 'passed' || !result.evidence) issues.push(`${chapter.id}: ${name} requires a passed check and evidence`);
      }
    }
    for (const unitId of chapter.unitIds) {
      unitIds.push(unitId);
      if (!rawUnits.has(unitId)) {
        issues.push(`${chapter.id}: missing unit ${unitId}`);
        continue;
      }
      const result = validateUnit(rawUnits.get(unitId), true);
      if (!result.success) {
        for (const issue of result.error.issues) issues.push(`${unitId}.${issue.path.join('.')}: ${issue.message}`);
        continue;
      }
      const unit: Unit = result.data;
      validatedUnits.push(unit);
      if (unit.chapterId !== chapter.id) issues.push(`${unitId}: belongs to ${unit.chapterId}, expected ${chapter.id}`);
      if (review?.unitRevisions[unitId] !== unit.revision) issues.push(`${unitId}: chapter review does not cover revision ${unit.revision}`);
      for (const skill of unit.requires) {
        if (!skills.has(skill)) issues.push(`${unitId}: prerequisite not provided earlier in release: ${skill}`);
      }
      const mediaIssues = await checkMediaFiles(unit, productRoot);
      for (const problem of mediaIssues) issues.push(`${unitId}: ${problem}`);
      if (!mediaIssues.length && review?.unitDigests[unitId] !== await unitDigest(unit, productRoot)) issues.push(`${unitId}: chapter review does not cover current content and media digest`);
      for (const skill of unit.provides) skills.add(skill);
    }
  }
  issues.push(...checkSkillGraph(validatedUnits, plan.skillIds));
  return { ready: issues.length === 0, issues, unitIds };
}
