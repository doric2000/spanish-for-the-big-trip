// Manual check for block-dangerous.mjs: node .claude/hooks/block-dangerous.test.mjs
import { spawnSync } from "node:child_process";

const cases = [
  ["git push --force", "git push --force origin main", true],
  ["git push -f", "git push origin main -f", true],
  ["git push normal", "git push origin main", false],
  ["git reset --hard", "git reset --hard HEAD~1", true],
  ["git reset soft", "git reset --soft HEAD~1", false],
  ["rm -rf", "rm -rf node_modules", true],
  ["rm single file", "rm notes.txt", false],
  ["Remove-Item -Recurse", "Remove-Item dist -Recurse -Force", true],
  ["supabase db push", "supabase db push", true],
  ["supabase db reset", "supabase db reset", true],
  ["supabase status", "supabase status", false],
  ["eas build", "eas build --platform ios", true],
  ["npm test", "npm test", false],
];

let failed = 0;
for (const [name, command, expectAsk] of cases) {
  const { stdout, status } = spawnSync("node", [".claude/hooks/block-dangerous.mjs"], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
  const asked = stdout.includes('"permissionDecision":"ask"');
  const ok = status === 0 && asked === expectAsk;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} (ask=${asked}, expected ${expectAsk})`);
}
process.exit(failed ? 1 : 0);
