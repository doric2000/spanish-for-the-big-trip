# Joint development instructions

This is the product Git root for "ספרדית לטיול הגדול". The full workspace instructions in [../AGENTS.md](../AGENTS.md) apply to this repository and all future subdirectories. Read the repository-local [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) before substantive work; it preserves the joint learning workflow when the checkout is copied elsewhere.

In the SpanishForTrip workspace, also read ../.codex-review/project-context.json, approved-decisions.json, work-plan.json, development-learning-log.json and the previous stage handoff. Direct user instructions and explicit decisions take precedence. If the workspace context is unavailable, use this guide and README for the recorded baseline and request missing stage context before extending scope.

## Required workflow

- Explain each meaningful step in clear Hebrew before acting: goal, reason, tools, execution location and evidence of success. Define unfamiliar terms with a project example.
- Agree who performs the action. Give Dor one small real task with explained commands and expected output. Wait for his result; do not perform his assigned action unless he delegates it.
- Dor explicitly delegated code writing/editing to Codex on 2026-10-15. Implement useful small parts within the current stage, explain their code and verify them. Dor handles meaningful environment/account/settings and device/API/database/Git checks; do not assign code typing/pasting or repeatedly ask for coding permission. Keep learning checkpoints around behavior, not every minor edit, to support the one-week target. Wait for Dor's assigned practical results.
- Check understanding briefly through Dor's explanation or a small variation. Record actual participation, evidence, concepts, open questions and the next step in the workspace learning log. Distinguish Codex implementation, Dor execution and demonstrated understanding.
- Work only on the current authorized stage. Finish the stage with the handoff fields in work-plan.json. Do not dispatch or message other stage chats from the planned list.
- Keep application delivery status separate from learning progress. Preserve this workflow in active documentation and future handoffs.

## Accepted scope and boundaries

- Name: ספרדית לטיול הגדול. Tagline: לומדים מה שצריך לטיול, בתרגולים קצרים וממוקדים.
- TypeScript, React Native/Expo, Node.js/NestJS and PostgreSQL/Supabase; one small authored API and one complete reviewed unit1A first. API hosting is still open.
- Dor selected a flat product layout: mobile/, api/ and supabase/ directly under this Git root. Create each part only at its authorized stage; the initial mobile scaffold belongs in mobile/.
- iPhone first, eventual Android compatibility. Windows development and EAS cloud iPhone build path. Apple/Expo browser access has been reported by Dor; actual signing/build/install still needs proof.
- Mandatory Google or Apple sign-in, with both provider paths required. No guest/anonymous learning.
- Author lesson stages and Hebrew/Spanish wording jointly. Audition Spanish-only natural voice samples before full audio production. The old prototype is exploratory and its content/voices are not automatically approved.
- Explain/install one tool or dependency group at a time. The one-week low-cost target does not waive learning checkpoints or authorize purchases, batch setup or provisioning beyond the agreed step.
- On-device recording/self-replay is the current proposal; cloud recording retention is not selected. Full offline support, unrestricted live AI and automatic pronunciation scoring are outside the first milestone.
- Enter credentials only through secure local/provider flows. Never request or write secrets in chat, commands, logs or learning notes.
- Keep developer teaching in documentation and conversation; learner screens are for learning Spanish.
