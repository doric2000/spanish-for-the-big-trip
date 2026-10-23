// PostToolUse hook (Edit|Write): fast checks after each edit, and a record of edited code files
// that verify-on-stop.mjs reads at the end of the turn.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? path.resolve(import.meta.dirname, "../..");
const stateDir = process.env.HOOK_STATE_DIR ?? path.join(os.tmpdir(), "spanish-trip-hooks");

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const { session_id: sessionId = "unknown", tool_input: input = {} } = JSON.parse(raw || "{}");

const file = input.file_path ? path.resolve(input.file_path) : "";
const rel = path.relative(root, file).split(path.sep).join("/");
if (!file || rel.startsWith("..")) process.exit(0);

// docs/ JSON is the source of truth for status: a broken file must be caught immediately.
if (rel.startsWith("docs/") && rel.endsWith(".json")) {
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`Invalid JSON in ${rel}: ${error.message}`);
    process.exit(2);
  }
  process.exit(0);
}

if (/^(mobile|content|api)\/.+\.(ts|tsx|js|cjs|mjs|json)$/.test(rel) && !rel.includes("node_modules")) {
  fs.mkdirSync(stateDir, { recursive: true });
  const marker = path.join(stateDir, `${sessionId.replace(/[^\w-]/g, "_")}.json`);
  const state = fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker, "utf8")) : { files: [], attempts: 0 };
  if (!state.files.includes(rel)) state.files.push(rel);
  fs.writeFileSync(marker, JSON.stringify(state));
}
