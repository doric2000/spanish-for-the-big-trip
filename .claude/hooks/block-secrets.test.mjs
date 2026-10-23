// Manual check for block-secrets.mjs: node .claude/hooks/block-secrets.test.mjs
// Strings are assembled at runtime so this file itself never trips the hook.
import { spawnSync } from "node:child_process";

const E = ".e" + "nv";
const KEY = "sb_" + "secret_" + "abcdefghijklmnop";
const cases = [
  ["Read env file", { tool_name: "Read", tool_input: { file_path: `mobile/${E}` } }, 2],
  ["Read env.local", { tool_name: "Read", tool_input: { file_path: `mobile/${E}.local` } }, 2],
  ["Read env.example", { tool_name: "Read", tool_input: { file_path: `mobile/${E}.example` } }, 0],
  ["Read .p8 key", { tool_name: "Read", tool_input: { file_path: "AuthKey_X.p8" } }, 2],
  ["Bash cat env", { tool_name: "Bash", tool_input: { command: `cat mobile/${E}` } }, 2],
  ["Bash npm test", { tool_name: "Bash", tool_input: { command: "npm test" } }, 0],
  ["Write real key", { tool_name: "Write", tool_input: { file_path: "a.md", content: KEY } }, 2],
  ["Write doc mention", { tool_name: "Write", tool_input: { file_path: "a.md", content: "service_role stays server-side" } }, 0],
];

let failed = 0;
for (const [name, payload, expected] of cases) {
  const { status } = spawnSync("node", [".claude/hooks/block-secrets.mjs"], { input: JSON.stringify(payload) });
  const ok = status === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} (exit ${status}, expected ${expected})`);
}
process.exit(failed ? 1 : 0);
