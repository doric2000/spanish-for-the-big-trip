// Stop hook: if code was edited this turn, run lint (changed files), typecheck and tests.
// Exit 2 refuses to end the turn and sends the failure output back to the agent.
// After MAX_ATTEMPTS failed attempts it lets go, so a stubborn failure cannot loop forever.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_ATTEMPTS = 3;
const root = process.env.CLAUDE_PROJECT_DIR ?? path.resolve(import.meta.dirname, "../..");
const stateDir = process.env.HOOK_STATE_DIR ?? path.join(os.tmpdir(), "spanish-trip-hooks");

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const { session_id: sessionId = "unknown" } = JSON.parse(raw || "{}");

const marker = path.join(stateDir, `${sessionId.replace(/[^\w-]/g, "_")}.json`);
if (!fs.existsSync(marker)) process.exit(0);

const state = JSON.parse(fs.readFileSync(marker, "utf8"));
const files = state.files.filter((f) => fs.existsSync(path.join(root, f)));
const mobile = files.filter((f) => f.startsWith("mobile/"));
const content = files.filter((f) => f.startsWith("content/"));

const jobs = [];
if (mobile.length) {
  const lintable = mobile.filter((f) => /\.(ts|tsx|js)$/.test(f)).map((f) => `"${f.slice("mobile/".length)}"`);
  if (lintable.length) jobs.push({ name: "eslint (edited files)", cwd: "mobile", cmd: `npx eslint ${lintable.join(" ")}` });
  jobs.push({ name: "mobile typecheck", cwd: "mobile", cmd: "npm run typecheck --silent" });
  jobs.push({ name: "mobile tests", cwd: "mobile", cmd: "npm test --silent" });
}
if (content.length) jobs.push({ name: "content tests", cwd: "content", cmd: "npm test --silent" });

const run = (job) =>
  new Promise((resolve) => {
    let out = "";
    const child = spawn(job.cmd, { cwd: path.join(root, job.cwd), shell: true });
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ ...job, code, out }));
  });

const results = await Promise.all(jobs.map(run));
const failed = results.filter((r) => r.code !== 0);

if (!failed.length) {
  fs.rmSync(marker, { force: true });
  process.exit(0);
}

const report = failed
  .map((r) => `--- ${r.name} failed (exit ${r.code}) ---\n${r.out.trim().split("\n").slice(-30).join("\n")}`)
  .join("\n\n");

state.attempts = (state.attempts ?? 0) + 1;
if (state.attempts >= MAX_ATTEMPTS) {
  fs.rmSync(marker, { force: true });
  console.log(JSON.stringify({ systemMessage: `verify-on-stop gave up after ${MAX_ATTEMPTS} attempts. Still failing:\n${report}` }));
  process.exit(0);
}

fs.writeFileSync(marker, JSON.stringify(state));
console.error(`Checks failed (attempt ${state.attempts}/${MAX_ATTEMPTS}). Fix before finishing; if a failure predates this turn, say so.\n\n${report}`);
process.exit(2);
