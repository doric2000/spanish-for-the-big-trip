// Manual check for require-design-skills.mjs: node .claude/hooks/require-design-skills.test.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(os.tmpdir(), "design-skills-"));
const load = (name) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: name } }] } });
const transcript = (name, lines) => {
  const file = path.join(dir, `${name}.jsonl`);
  writeFileSync(file, lines.join("\n"));
  return file;
};
const all = ["ui-ux-pro-max:ui-ux-pro-max", "vercel-react-native-skills", "vercel-composition-patterns"].map(load);
const none = transcript("none", [JSON.stringify({ type: "user", message: { content: "hi" } })]);
const loaded = transcript("loaded", all);
const partial = transcript("partial", all.slice(0, 2));
const compacted = transcript("compacted", [...all, JSON.stringify({ type: "system", subtype: "compact_boundary" })]);

const FIGMA = "mcp__1d26f2b9-d76b-4a34-ab89-fc457336c2d2__use_figma";
const screen = "mobile/src/lesson/scenario-screen.tsx";
const cases = [
  ["Figma without skills", { tool_name: FIGMA, transcript_path: none }, 2],
  ["Figma with skills", { tool_name: FIGMA, transcript_path: loaded }, 0],
  ["Figma with two skills", { tool_name: FIGMA, transcript_path: partial }, 2],
  ["Figma after compaction", { tool_name: FIGMA, transcript_path: compacted }, 2],
  ["Screen edit without skills", { tool_name: "Edit", tool_input: { file_path: screen }, transcript_path: none }, 2],
  ["Screen edit with skills", { tool_name: "Write", tool_input: { file_path: screen }, transcript_path: loaded }, 0],
  ["Theme edit without skills", { tool_name: "Edit", tool_input: { file_path: "mobile/src/theme.ts" }, transcript_path: none }, 2],
  ["Logic edit without skills", { tool_name: "Edit", tool_input: { file_path: "mobile/src/lesson/opening-data.ts" }, transcript_path: none }, 0],
  ["Content edit without skills", { tool_name: "Edit", tool_input: { file_path: "content/units/unit1a.json" }, transcript_path: none }, 0],
  ["Other MCP tool", { tool_name: "mcp__ccd_turn__update_plan", transcript_path: none }, 0],
];

let failed = 0;
// The hook only sees the tools its matcher names in settings.json.
const settings = JSON.parse(readFileSync(".claude/settings.json", "utf8"));
const matchers = settings.hooks.PreToolUse.filter((h) => h.hooks.some((x) => x.command.includes("require-design-skills.mjs"))).map((h) => h.matcher);
for (const tool of ["Edit", "Write", FIGMA]) {
  if (!matchers.some((m) => new RegExp(`^(${m})$`).test(tool))) {
    failed++;
    console.log(`FAIL matcher does not cover ${tool}`);
  }
}
for (const [name, payload, expected] of cases) {
  const run = spawnSync("node", [".claude/hooks/require-design-skills.mjs"], { input: JSON.stringify(payload), encoding: "utf8" });
  const ok = run.status === expected;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name} (exit ${run.status}, expected ${expected})`);
}
process.exit(failed ? 1 : 0);
