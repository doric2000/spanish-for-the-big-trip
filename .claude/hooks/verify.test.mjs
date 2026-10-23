// Manual check for track-edits.mjs and verify-on-stop.mjs: node .claude/hooks/verify.test.mjs
// Takes about a minute: the failure case really runs eslint, typecheck and tests.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-test-"));
const env = { ...process.env, HOOK_STATE_DIR: stateDir, CLAUDE_PROJECT_DIR: root };
const marker = path.join(stateDir, "t1.json");

const hook = (script, payload) =>
  spawnSync("node", [path.join(root, ".claude/hooks", script)], { input: JSON.stringify({ session_id: "t1", ...payload }), env, encoding: "utf8" });

let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`);
};

// track-edits
const badJson = path.join(root, "docs", "__hook_test_bad.json");
fs.writeFileSync(badJson, "{ not json");
check("invalid docs JSON -> exit 2", hook("track-edits.mjs", { tool_input: { file_path: badJson } }).status === 2);
fs.rmSync(badJson);

check("docs JSON valid -> exit 0", hook("track-edits.mjs", { tool_input: { file_path: path.join(root, "docs/planning/work-plan.json") } }).status === 0);
check("docs edit leaves no marker", !fs.existsSync(marker));

hook("track-edits.mjs", { tool_input: { file_path: path.join(root, "mobile/src/app/_layout.tsx") } });
check("mobile edit is recorded", fs.existsSync(marker) && JSON.parse(fs.readFileSync(marker, "utf8")).files.includes("mobile/src/app/_layout.tsx"));
fs.rmSync(marker, { force: true });

// verify-on-stop
check("no marker -> exit 0 (nothing to verify)", hook("verify-on-stop.mjs", {}).status === 0);

fs.writeFileSync(marker, JSON.stringify({ files: ["content/package.json"], attempts: 0 }));
const pass = hook("verify-on-stop.mjs", {});
check("passing checks -> exit 0 and marker cleared", pass.status === 0 && !fs.existsSync(marker), `(exit ${pass.status})`);

const broken = path.join(root, "mobile/src/__hook_test_broken.ts");
fs.writeFileSync(broken, "const = ;\n");
fs.writeFileSync(marker, JSON.stringify({ files: ["mobile/src/__hook_test_broken.ts"], attempts: 0 }));
const fail = hook("verify-on-stop.mjs", {});
check("failing checks -> exit 2 with report", fail.status === 2 && /failed/.test(fail.stderr), `(exit ${fail.status})`);
check("attempt counter incremented", JSON.parse(fs.readFileSync(marker, "utf8")).attempts === 1);

fs.writeFileSync(marker, JSON.stringify({ files: ["mobile/src/__hook_test_broken.ts"], attempts: 2 }));
const giveUp = hook("verify-on-stop.mjs", {});
check("3rd failure -> exit 0 (gives up, no infinite loop)", giveUp.status === 0 && !fs.existsSync(marker), `(exit ${giveUp.status})`);

fs.rmSync(broken, { force: true });
fs.rmSync(stateDir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
