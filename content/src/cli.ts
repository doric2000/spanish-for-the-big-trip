import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateUnit, type Unit } from './schema.js';

const contentRoot = fileURLToPath(new URL('../../', import.meta.url));
const productRoot = dirname(contentRoot.replace(/[\\/]$/, ''));

export async function checkMediaFiles(unit: Unit, root: string): Promise<string[]> {
  const issues: string[] = [];
  const assetsRoot = resolve(root, 'assets');
  for (const asset of unit.media) {
    if (asset.status !== 'approved' || !asset.path) continue;
    try {
      const actual = await realpath(resolve(root, asset.path));
      const local = relative(await realpath(assetsRoot), actual);
      if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) {
        issues.push(`${asset.id}: file escapes assets directory`);
        continue;
      }
      const info = await stat(actual);
      if (!info.isFile() || info.size === 0) issues.push(`${asset.id}: file is empty or not a file`);
    } catch {
      issues.push(`${asset.id}: approved file is missing`);
    }
  }
  return issues;
}

// Schema, approved media files and known skills. Shared by validate and seed:sql.
export async function loadValidUnit(source: string, publish: boolean): Promise<{ unit: Unit; issues: [] } | { unit: null; issues: string[] }> {
  const input: unknown = JSON.parse(await readFile(resolve(contentRoot, source), 'utf8'));
  const result = validateUnit(input, publish);
  if (!result.success) return { unit: null, issues: result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`) };
  const missing = await checkMediaFiles(result.data, productRoot);
  if (missing.length) return { unit: null, issues: missing };
  const plan = JSON.parse(await readFile(resolve(contentRoot, 'release-plan.json'), 'utf8')) as { skillIds: string[] };
  const unknownSkills = [...result.data.requires, ...result.data.provides].filter(skill => !plan.skillIds.includes(skill));
  if (unknownSkills.length) return { unit: null, issues: [`unknown skills: ${unknownSkills.join(', ')}`] };
  return { unit: result.data, issues: [] };
}

export async function main(args: string[]): Promise<number> {
  const source = args.find(a => a !== '--publish') ?? 'units/unit1a.json';
  try {
    const loaded = await loadValidUnit(source, args.includes('--publish'));
    if (!loaded.unit) {
      console.error(`INVALID / נחסם:\n${loaded.issues.map(x => `- ${x}`).join('\n')}`);
      return 1;
    }
    const unit = loaded.unit;
    console.log(`VALID ${unit.status.toUpperCase()}: ${unit.id} / ${unit.aliases.join(', ')} — ${unit.activities.length} activities`);
    console.log(`Pending: ${unit.pendingStages.length} stages; ${unit.media.filter(a => a.status === 'pending').length} media assets; ${unit.activities.filter(a => a.review.status !== 'approved').length} activity reviews`);
    console.log('Local validation only. No content published and no cloud writes.');
    return 0;
  } catch (error) {
    console.error(`INVALID / נחסם: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
