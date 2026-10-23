// PreToolUse hook: asks Dor before destructive or paid-infrastructure commands run.
// Input: JSON on stdin. Output: JSON with permissionDecision "ask" (a confirmation dialog), exit 0.

const RULES = [
  [/\bgit\s+push\b.*(\s--force\b|\s-f\b|--force-with-lease)/, "force push rewrites remote history"],
  [/\bgit\s+reset\s+--hard\b/, "reset --hard discards uncommitted work"],
  [/\bgit\s+clean\s+-\w*f/, "git clean deletes untracked files"],
  [/\brm\s+-\w*[rR]/, "recursive rm deletes a whole folder"],
  [/\bRemove-Item\b.*-Recurse/i, "recursive Remove-Item deletes a whole folder"],
  [/\bsupabase\s+db\s+(push|reset)\b/, "supabase db push/reset changes or wipes a database"],
  [/\beas\s+(build|submit|update)\b/, "EAS builds/submits are planned for stage 04 and may cost money"],
];

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const { tool_input: input = {} } = JSON.parse(raw || "{}");
const command = input.command ?? "";

const hit = RULES.find(([re]) => re.test(command));
if (hit) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: `block-dangerous hook: ${hit[1]}. Confirm with Dor before running.`,
      },
    }),
  );
}
