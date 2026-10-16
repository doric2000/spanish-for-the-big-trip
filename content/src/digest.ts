import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Unit } from './schema.js';

export function canonicalJson(input: unknown): string {
  if (input === null || typeof input !== 'object') return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(input).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
export const sha256 = (input: string | Uint8Array): string => createHash('sha256').update(input).digest('hex');

// Call only after checkMediaFiles verifies containment and existence.
export async function unitDigest(unit: Unit, productRoot: string): Promise<string> {
  const files = await Promise.all(unit.media.map(async asset => ({
    id: asset.id, digest: asset.path ? sha256(await readFile(resolve(productRoot, asset.path))) : null,
  })));
  const { status: _status, ...source } = unit;
  return sha256(canonicalJson({ source, files }));
}
