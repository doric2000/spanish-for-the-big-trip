// Generates scene images with the OpenAI Image API from a jobs file.
// Usage (from the repository root): node assets/tools/generate-image.mjs <jobs.json> [jobId ...]
// The key is read from assets/.env (OPENAI_API_KEY=...), which Git ignores.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const MODEL = 'gpt-image-2.5-sunburst';
// Standard prices per 1M tokens (developers.openai.com/api/docs/pricing, 2026-10-28).
const PRICE = { imageIn: 8, textIn: 5, imageOut: 30 };

const [jobsPath, ...onlyIds] = process.argv.slice(2);
if (!jobsPath) throw new Error('Usage: node assets/tools/generate-image.mjs <jobs.json> [jobId ...]');
const envFile = resolve('assets/.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing from assets/.env');

const { shared = '', jobs } = JSON.parse(readFileSync(jobsPath, 'utf8'));
const selected = onlyIds.length ? jobs.filter(j => onlyIds.includes(j.id)) : jobs;
let total = 0;

for (const job of selected) {
  if (existsSync(job.out)) { console.log(`skip ${job.id}: ${job.out} exists`); continue; }
  const form = new FormData();
  form.append('model', MODEL);
  form.append('prompt', [shared, job.prompt].filter(Boolean).join('\n\n'));
  form.append('size', job.size ?? '1536x1024');
  form.append('quality', job.quality ?? 'medium');
  form.append('background', job.background ?? 'opaque');
  form.append('output_format', 'png');
  for (const ref of job.refs ?? []) {
    form.append('image[]', new Blob([readFileSync(ref)], { type: 'image/png' }), basename(ref));
  }
  // Reference images go through the edits endpoint; without them it is a plain generation.
  const endpoint = job.refs?.length ? 'edits' : 'generations';
  const body = endpoint === 'edits' ? form : JSON.stringify(Object.fromEntries(form));
  const response = await fetch(`https://api.openai.com/v1/images/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      ...(endpoint === 'generations' && { 'Content-Type': 'application/json' }),
    },
    body,
  });
  const result = await response.json();
  if (!response.ok) { console.error(`fail ${job.id}: ${result.error?.message ?? response.status}`); continue; }

  mkdirSync(dirname(job.out), { recursive: true });
  writeFileSync(job.out, Buffer.from(result.data[0].b64_json, 'base64'));
  const u = result.usage?.input_tokens_details ?? {};
  const cost = ((u.image_tokens ?? 0) * PRICE.imageIn + (u.text_tokens ?? 0) * PRICE.textIn
    + (result.usage?.output_tokens ?? 0) * PRICE.imageOut) / 1e6;
  total += cost;
  console.log(`done ${job.id}: ${job.out} (~$${cost.toFixed(3)})`);
}
console.log(`estimated total: ~$${total.toFixed(3)}`);
