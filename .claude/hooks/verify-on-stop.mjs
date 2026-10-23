// Stop hook: if code was edited this turn, run lint, typecheck and tests for the parts touched.
// Exit 2 refuses to end the turn and sends the failure output back to the agent.
// After MAX_ATTEMPTS failed attempts it lets go, so a stubborn failure cannot loop forever.
// HOOK_DRY_RUN=1 prints the planned jobs instead of running them (used by verify.test.mjs).
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
const api = files.filter((f) => f.startsWith("api/"));

// Order matters: content tests rebuild content/dist, every api script rebuilds it too
// (pre* scripts), and the mobile tests read it. Run content, then api, then mobile, one
// job at a time, so no job reads content/dist while another is writing it.
const jobs = [];
if (content.length) jobs.push({ name: "content tests", cwd: "content", cmd: "npm test --silent" });
if (api.length) {
  jobs.push({ name: "api build (typecheck)", cwd: "api", cmd: "npm run build --silent" });
  jobs.push({ name: "api lint", cwd: "api", cmd: "npm run lint --silent" });
  jobs.push({ name: "api tests", cwd: "api", cmd: "npm test --silent" });
}
if (mobile.length) {
  const lintable = mobile.filter((f) => /\.(ts|tsx|js)$/.test(f)).map((f) => `"${f.slice("mobile/".length)}"`);
  if (lintable.length) jobs.push({ name: "eslint (edited files)", cwd: "mobile", cmd: `npx eslint ${lintable.join(" ")}` });
  jobs.push({ name: "mobile typecheck", cwd: "mobile", cmd: "npm run typecheck --silent" });
  jobs.push({ name: "mobile tests", cwd: "mobile", cmd: "npm test --silent" });
}

if (process.env.HOOK_DRY_RUN === "1") {
  console.log(JSON.stringify(jobs.map((j) => j.name)));
  process.exit(0);
}

const run = (job) =>
  new Promise((resolve) => {
    let out = "";
    const child = spawn(job.cmd, { cwd: path.join(root, job.cwd), shell: true });
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ ...job, code, out }));
  });

const results = [];
for (const job of jobs) results.push(await run(job));
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
