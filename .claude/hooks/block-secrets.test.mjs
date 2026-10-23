// Manual check for block-secrets.mjs: node .claude/hooks/block-secrets.test.mjs
// Strings are assembled at runtime so this file itself never trips the hook.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const E = ".e" + "nv";
const KEY = "sb_" + "secret_" + "abcdefghijklmnop";
const P8 = ".p" + "8";
const cases = [
  ["Read env file", { tool_name: "Read", tool_input: { file_path: `mobile/${E}` } }, 2],
  ["Read env.local", { tool_name: "Read", tool_input: { file_path: `mobile/${E}.local` } }, 2],
  ["Read env.example", { tool_name: "Read", tool_input: { file_path: `mobile/${E}.example` } }, 0],
  ["Read .p8 key", { tool_name: "Read", tool_input: { file_path: "AuthKey_X.p8" } }, 2],
  ["Bash cat env", { tool_name: "Bash", tool_input: { command: `cat mobile/${E}` } }, 2],
  ["Bash npm test", { tool_name: "Bash", tool_input: { command: "npm test" } }, 0],
  ["Write real key", { tool_name: "Write", tool_input: { file_path: "a.md", content: KEY } }, 2],
  ["Write doc mention", { tool_name: "Write", tool_input: { file_path: "a.md", content: "service_role stays server-side" } }, 0],
  // PowerShell is the main shell on Windows and is guarded like Bash.
  ["PowerShell Get-Content env", { tool_name: "PowerShell", tool_input: { command: `Get-Content mobile/${E}.local` } }, 2],
  ["PowerShell Windows path", { tool_name: "PowerShell", tool_input: { command: `Get-Content api\\${E}` } }, 2],
  ["PowerShell npm test", { tool_name: "PowerShell", tool_input: { command: "npm.cmd test" } }, 0],
  // Grep prints matching lines, so searching a secret file reads it.
  ["Grep path env", { tool_name: "Grep", tool_input: { pattern: "KEY", path: `api/${E}` } }, 2],
  ["Grep glob env", { tool_name: "Grep", tool_input: { pattern: "KEY", glob: `**/${E}*` } }, 2],
  ["Grep glob key file", { tool_name: "Grep", tool_input: { pattern: "BEGIN", glob: `*${P8}` } }, 2],
  ["Grep glob braces", { tool_name: "Grep", tool_input: { pattern: "x", glob: `{*.ts,${E}.local}` } }, 2],
  ["Grep code folder", { tool_name: "Grep", tool_input: { pattern: "KEY", path: "mobile/src", glob: "*.{ts,tsx}" } }, 0],
  ["Grep env.example", { tool_name: "Grep", tool_input: { pattern: "KEY", path: `mobile/${E}.example` } }, 0],
  // A key typed into a command ends up in logs and shell history.
  ["Bash key in command", { tool_name: "Bash", tool_input: { command: `curl -H "apikey: ${KEY}" https://example.test` } }, 2],
  ["PowerShell key in command", { tool_name: "PowerShell", tool_input: { command: `$env:K = "${KEY}"` } }, 2],
];

let failed = 0;
// The hook only sees the tools its matcher names in settings.json.
const settings = JSON.parse(readFileSync(".claude/settings.json", "utf8"));
const matchers = settings.hooks.PreToolUse.filter((h) => h.hooks.some((x) => x.command.includes("block-secrets.mjs"))).map((h) => h.matcher);
for (const tool of ["Read", "Edit", "Write", "Grep", "Bash", "PowerShell"]) {
  const ok = matchers.some((m) => new RegExp(`^(${m})$`).test(tool));
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  settings matcher covers ${tool}`);
}
for (const [name, payload, expected] of cases) {
  const { status } = spawnSync("node", [".claude/hooks/block-secrets.mjs"], { input: JSON.stringify(payload) });
  const ok = status === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} (exit ${status}, expected ${expected})`);
}
process.exit(failed ? 1 : 0);
