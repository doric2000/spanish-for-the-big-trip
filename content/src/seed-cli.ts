import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChapterPlanSchema } from './chapter-release.js';
import { loadValidUnit } from './cli.js';
import { unitDigest } from './digest.js';
import { buildDraftSeedSql } from './seed-sql.js';

const contentRoot = fileURLToPath(new URL('../../', import.meta.url));
const productRoot = dirname(contentRoot.replace(/[\\/]$/, ''));

async function main(args: string[]): Promise<number> {
  const source = args[0] ?? 'units/unit1a.json';
  try {
    const loaded = await loadValidUnit(source, false);
    if (!loaded.unit) {
      console.error(`SEED BLOCKED / נחסם:\n${loaded.issues.map(x => `- ${x}`).join('\n')}`);
      return 1;
    }
    const plan = ChapterPlanSchema.parse(JSON.parse(await readFile(resolve(contentRoot, 'release-plan.json'), 'utf8')));
    const unit = loaded.unit;
    const digest = await unitDigest(unit, productRoot);
    const sql = buildDraftSeedSql(plan, unit, digest, `content/${source}`);
    // Generated output is ignored by Git: the JSON in content/ stays the only source.
    const out = resolve(productRoot, 'supabase/seed/generated', `${unit.aliases[0]?.toLowerCase() ?? unit.id}-draft.sql`);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, sql, 'utf8');
    console.log(`WROTE ${out}`);
    console.log(`${unit.id} revision ${unit.revision} (draft), digest ${digest}`);
    console.log('Nothing was sent to the cloud. Store the draft with: npx.cmd --no-install supabase db query --linked -f <file>');
    return 0;
  } catch (error) {
    console.error(`SEED BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
