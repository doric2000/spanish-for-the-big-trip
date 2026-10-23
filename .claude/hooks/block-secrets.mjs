// PreToolUse hook: blocks tools from touching secret files or writing real keys.
// Input: JSON on stdin ({ tool_name, tool_input }). Exit 2 = block (stderr goes to the agent).
import path from "node:path";

const SECRET_EXTENSIONS = [".p8", ".p12", ".jks", ".keystore", ".mobileprovision"];

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

function block(reason) {
  console.error(`Blocked by block-secrets hook: ${reason}\nSecrets stay in local env files that Git ignores; ask Dor to handle them (AGENTS.md, Security and secrets).`);
  process.exit(2);
}

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const { tool_name: tool, tool_input: input = {} } = JSON.parse(raw || "{}");

if (tool === "Bash" && commandTouchesSecret(input.command ?? "")) {
  block("the command references a secret file.");
}

if (["Read", "Edit", "Write"].includes(tool) && isSecretFileName(input.file_path ?? "")) {
  block(`${path.basename(input.file_path)} is a secret file.`);
}

if (["Edit", "Write"].includes(tool)) {
  const text = `${input.content ?? ""}\n${input.new_string ?? ""}`;
  if (SECRET_CONTENT.some((re) => re.test(text))) {
    block("the content looks like a real secret key.");
  }
}
