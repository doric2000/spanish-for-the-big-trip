import type { Unit } from './schema.js';

// Content dependency validation; this does not assess a learner's mastery.
export function checkSkillGraph(units: readonly Unit[], knownSkills: readonly string[]): string[] {
  const issues: string[] = [];
  const known = new Set(knownSkills);
  const providers = new Map<string, Unit[]>();
  for (const unit of units) {
    for (const skill of [...unit.requires, ...unit.provides]) {
      if (!known.has(skill)) issues.push(`${unit.id}: unknown skill ${skill}`);
    }
    for (const skill of unit.provides) providers.set(skill, [...(providers.get(skill) ?? []), unit]);
  }
  const visiting = new Set<string>();
  for (const [skill, sources] of providers) if (sources.length > 1) issues.push(`Ambiguous providers for skill ${skill}`);
  const visited = new Set<string>();
  function visit(unit: Unit) {
    if (visiting.has(unit.id)) { issues.push(`${unit.id}: cyclic skill prerequisite`); return; }
    if (visited.has(unit.id)) return;
    visiting.add(unit.id);
    for (const skill of unit.requires) {
      const candidates = providers.get(skill) ?? [];
      if (!candidates.length) issues.push(`${unit.id}: prerequisite has no provider: ${skill}`);
      for (const provider of candidates) visit(provider);
    }
    visiting.delete(unit.id); visited.add(unit.id);
  }
  units.forEach(visit);
  return issues;
}
