import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkChapterRelease } from './chapter-release.js';

const contentRoot = fileURLToPath(new URL('../../', import.meta.url));
const productRoot = dirname(contentRoot.replace(/[\\/]$/, ''));

async function main(): Promise<number> {
  try {
    const read = async (name: string): Promise<unknown> => JSON.parse(await readFile(resolve(contentRoot, name), 'utf8'));
    const units = await readdir(resolve(contentRoot, 'units'), { withFileTypes: true });
    const result = await checkChapterRelease(
      await read('release-plan.json'), await read('release-reviews.json'),
      await Promise.all(units.filter(f => f.isFile() && f.name.endsWith('.json')).map(f => read(`units/${f.name}`))),
      process.argv.slice(2).length ? process.argv.slice(2) : ['C01'], productRoot,
    );
    console.log(result.ready ? 'READY FOR CHAPTER RELEASE PREFLIGHT' : 'CHAPTER RELEASE BLOCKED / פרסום הפרק נחסם');
    for (const issue of result.issues) console.log(`- ${issue}`);
    console.log('Local check only. No chapter published and no cloud writes.');
    return result.ready ? 0 : 1;
  } catch (error) {
    console.error(`CHAPTER RELEASE BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

process.exitCode = await main();
