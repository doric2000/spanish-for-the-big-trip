// PreToolUse hook: blocks tools from touching secret files or writing real keys.
// Input: JSON on stdin ({ tool_name, tool_input }). Exit 2 = block (stderr goes to the agent).
import path from "node:path";

const SECRET_EXTENSIONS = [".p8", ".p12", ".jks", ".keystore", ".mobileprovision"];
// PowerShell is the main shell on Dor's Windows machine, so it is guarded like Bash.
const SHELL_TOOLS = ["Bash", "PowerShell"];

// Real key shapes only; the bare word "service_role" is allowed because docs mention it.
const SECRET_CONTENT = [
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /SERVICE_ROLE_KEY\s*[=:]\s*["']?[A-Za-z0-9._-]{20,}/i,
];

function isSecretFileName(name) {
  const base = path.basename(name).toLowerCase();
  if (base === ".env.example") return false;
  if (base === ".env" || base.startsWith(".env.")) return true;
  return SECRET_EXTENSIONS.some((ext) => base.endsWith(ext));
}

// Picks file-like words out of a shell command and tests each one.
function commandTouchesSecret(command) {
  const words = command.split(/[\s"'`|;&<>()=]+/).filter(Boolean);
  return words.some(isSecretFileName);
}

// A Grep glob such as "**/.env*", "*.p8" or "{.env,.env.local}": drop the wildcards and
// test each alternative. Searching a folder is fine: ripgrep skips hidden and
// Git-ignored files (all secret files here) unless a glob or path names them.
function globTouchesSecret(glob) {
  return glob.split(/[{},]+/).filter(Boolean).some((part) => {
    const name = part.replace(/[*?[\]!]/g, "");
    return name !== "" && isSecretFileName(name);
  });
}

function block(reason) {
  console.error(`Blocked by block-secrets hook: ${reason}\nSecrets stay in local env files that Git ignores; ask Dor to handle them (AGENTS.md, Security and secrets).`);
  process.exit(2);
}

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const { tool_name: tool, tool_input: input = {} } = JSON.parse(raw || "{}");

if (SHELL_TOOLS.includes(tool)) {
  const command = input.command ?? "";
  if (commandTouchesSecret(command)) block("the command references a secret file.");
  // A key typed into a command ends up in logs and shell history.
  if (SECRET_CONTENT.some((re) => re.test(command))) block("the command contains what looks like a real secret key.");
}

if (["Read", "Edit", "Write"].includes(tool) && isSecretFileName(input.file_path ?? "")) {
  block(`${path.basename(input.file_path)} is a secret file.`);
}

// Grep prints matching lines, so searching inside a secret file reads it.
if (tool === "Grep" && (isSecretFileName(input.path ?? "") || globTouchesSecret(input.glob ?? ""))) {
  block("the search targets a secret file.");
}

if (["Edit", "Write"].includes(tool)) {
  const text = `${input.content ?? ""}\n${input.new_string ?? ""}`;
  if (SECRET_CONTENT.some((re) => re.test(text))) {
    block("the content looks like a real secret key.");
  }
}
