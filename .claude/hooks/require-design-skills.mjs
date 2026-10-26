// PreToolUse hook: design work (Figma tools, or editing a mobile screen) is blocked until the
// three design skills were loaded in this conversation (Dor, 2026-10-26; AGENTS.md › Design).
// Input: JSON on stdin ({ tool_name, tool_input, transcript_path }). Exit 2 = block (stderr goes to the agent).
import fs from "node:fs";
import path from "node:path";

const REQUIRED = ["ui-ux-pro-max:ui-ux-pro-max", "vercel-react-native-skills", "vercel-composition-patterns"];

// Figma MCP tools that read or change a design; the server prefix differs between machines.
const FIGMA_TOOL = /__(use_figma|generate_figma_design|get_design_context|get_screenshot|get_metadata|search_design_system|get_variable_defs|create_new_file|upload_assets|generate_image|get_figma_skill)$/;

const root = process.env.CLAUDE_PROJECT_DIR ?? path.resolve(import.meta.dirname, "../..");

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const { tool_name: tool = "", tool_input: input = {}, transcript_path: transcript } = JSON.parse(raw || "{}");

function isDesignWork() {
  if (FIGMA_TOOL.test(tool)) return true;
  if (!["Edit", "Write", "MultiEdit"].includes(tool) || !input.file_path) return false;
  const rel = path.relative(root, path.resolve(input.file_path)).split(path.sep).join("/");
  // Screens and shared UI components, plus the shared theme.
  return rel.startsWith("mobile/") && !rel.includes("node_modules") && (rel.endsWith(".tsx") || rel === "mobile/src/theme.ts");
}

if (!isDesignWork()) process.exit(0);
if (!transcript || !fs.existsSync(transcript)) process.exit(0);

// After a context compaction the skill text is gone, so only loads after the last one count.
const text = fs.readFileSync(transcript, "utf8");
const boundary = text.lastIndexOf('"compact_boundary"');
const recent = boundary === -1 ? text : text.slice(boundary);
const missing = REQUIRED.filter((name) => !new RegExp(`"skill"\\s*:\\s*"${name}"`).test(recent));
if (missing.length === 0) process.exit(0);

console.error(`Design work needs these skills loaded first (Skill tool): ${missing.join(", ")}. Load them, then retry.`);
process.exit(2);
