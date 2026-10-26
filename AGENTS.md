# ספרדית לטיול הגדול — agent instructions

This is the **only full instruction file** for the project. It applies to every agent (Codex, Claude or other) and every directory in this repository. Nested `AGENTS.md` files (for example `mobile/AGENTS.md`) add only directory-specific technical notes; do not copy rules from here into them.

Since 2026-10-16 everything that matters lives in this one repository. The folder above it (`../.codex-review/`, `../output/`) is a **legacy archive** outside Git: read it only when a document explicitly cites a `.codex-review/...` path that is not under `docs/`.

## Where things live

| Need | File |
| --- | --- |
| Live delivery status, current stage, next action | `docs/planning/work-plan.json#delivery` |
| Approved technology/product decisions | `docs/planning/approved-decisions.json` |
| Selected tools and installed skills | `docs/planning/toolchain.json` |
| Project background | `docs/planning/project-context.json` |
| Previous stage summaries | `docs/planning/stage-handoffs/` |
| Dor's learning record | `docs/learning/development-learning-log.json` |
| Joint workflow (Hebrew, for Dor) | `docs/DEVELOPMENT_GUIDE.md` |
| Active curriculum (v4, interaction-led) | `docs/curriculum/curriculum-plan.json`; readable export `docs/curriculum/Spanish_For_Trip_Curriculum.pdf` |
| Reviewed unit 1A copy | `docs/curriculum/unit1a-content.json` |
| Previous content bank | `docs/curriculum/pilot-spec.json` |
| Lesson JSON/Zod contract | `content/README.md` |
| Figma templates | `docs/design/interaction-catalog.json` |
| Dated verification evidence | `docs/evidence/` |
| Research (stack, hosting, pronunciation) | `docs/research/` |
| Project audits | `docs/audits/` |

Status lives **only** in `docs/planning/work-plan.json#delivery`. Do not restate status in this file, READMEs or other AGENTS files; link to it.

## Purpose and division of work

Dor and the agent build the app together. Dor wants hands-on understanding of every stage so he can explain it in job interviews; shipping code alone does not meet that goal.

- **Agent:** writes and edits code within the current agreed stage (standing authorization from Dor, 2026-10-15) and explains the meaningful parts. Do not ask Dor to type/paste code or re-approve routine coding unless he asks to type.
  After a step passes its automated checks, the agent makes the topic-sized commits and pushes to `main` itself, then reports the commit hashes (Dor, 2026-10-25). The push deploys the API to Vercel, where Dor runs the device check; the step counts as done only after that check, and a problem it finds is fixed with a new commit. Push before the device check only while Dor is the only learner; a migration or seed the change needs is applied first. Verify the state with `git status`/`git log` first, and the deployment through the Vercel MCP; never force-push or rewrite pushed history.
  The agent also runs development-database work itself through the linked Supabase CLI, only on `spanish-for-trip-dev` (Dor, 2026-10-26): draft seeds and SQL checks with `npx.cmd --no-install supabase db query --linked`, migrations with `db push --linked` after a `--dry-run`, and resets of Dor's own test progress. Before a delete it reads the rows it will remove; it reports what ran and the result. It never runs `db reset` in the cloud, never touches other learners' data or a production project, and anything that needs a secret or a new login stays with Dor.
- **Dor:** performs meaningful environment installation, account/settings work and device/API checks. When an action is assigned to Dor, leave it for him and wait for his result; do it yourself only if he delegates it.
- Place learning checkpoints around useful behavior, not after every import or small edit.
- Explain and install one tool or dependency group at a time. Do not complete whole frontend/backend modules, install a full stack or deploy a batch of changes ahead of the agreed checkpoints.
- Routine document maintenance and checks of already-authorized changes may proceed without extra approval prompts.
- Load only the installed skills relevant to the next action (listed in `toolchain.json`) and keep the working Expo SDK.
- Keep application delivery status separate from Dor's learning progress.

## Workflow for each meaningful step

1. Before acting, explain in clear Hebrew: goal, why it is needed, tools, where it runs, how success is checked. Define new terms with a project example. If Dor says he is lost, step back to the big picture in plain words before details.
2. Explain each command before presenting it: working directory and expected output.
3. Implement one small part, review files and behavior together, verify it (including a relevant failure case). Explain debugging reasoning, not just the fix.
4. Check understanding briefly (Dor's own words or a small variation). This is not an exam or a permission request.
5. Record in `docs/learning/development-learning-log.json`: goal, who did what, evidence, concepts, open questions, next step. Keep agent implementation, Dor's execution and demonstrated understanding separate; never infer understanding from a passing test.

Topics this covers: environment/Git, mobile UI/state/navigation/RTL/audio, backend request flow/validation/auth/authorization/errors/logging/tests, database schema/migrations/indexes/transactions/RLS, delivery (builds, signing, hosting, CI, monitoring) and interview-style debugging and tradeoff explanations.

## Stage chats

For a planned stage chat, read `work-plan.json`, the learning log and the previous handoff; verify prerequisites exist; work only on the named stage; end with the handoff fields defined in the plan. A planned list of chats is not permission to open or message them — Dor opens each stage. Work with one agent at a time in this folder; two agents editing in parallel leave half-written files. Do not restart stage 02 or discard stage 03 progress and its joint review.

## Product boundaries

- Name: ספרדית לטיול הגדול. Tagline: לומדים מה שצריך לטיול, בתרגולים קצרים וממוקדים.
- Stack (accepted): TypeScript, React Native/Expo, Node.js/NestJS (one small authored API), PostgreSQL/Auth/Storage on Supabase. Flat layout in this repo: `mobile/`, `content/`, `supabase/`, later `api/`; create each part only at its authorized stage.
- Vercel Hobby is the default for a personal non-commercial pilot; access and deployment preflight belong to stage 05. Public commercial use needs a hosting-terms check.
- iPhone first, Android later. Dor has an active Apple Developer membership, Windows only and roughly 4–5 variable hours/day. EAS cloud builds at stage 04 after native auth configuration, not before.
- Sign-in: Google **and** Apple are both mandatory. No guest/anonymous mode.
- Delivery order: complete unit 1A (engine proof) → all of chapter C01 (3 units) → all of C02 (4 units), as time allows. Do not compress foundations, sample units across chapters, or treat 10 units/week as a quota. The 16-chapter / 57-unit curriculum is an outline; later authoring follows learner feedback.
- Publish only whole chapters that passed human copy, audio, device, progress and changed-detail checks. `content/check:chapters` is a local preflight and publishes nothing.
- No purchases, paid upgrades or new infrastructure payments. Do not provision a service just because a document describes it. Full offline support and unrestricted live AI are out of scope for the first milestone.
- The old web prototype (`../prototype/`, its own repository) is exploratory; its content and voices are not automatically approved.

## Security and secrets

- Never request secrets in chat or put them in commands, logs, docs or learning notes. Dor enters credentials only through the provider's secure flow or local env files that Git ignores.
- Only public values (Supabase URL, publishable/anon key) may appear in the mobile app or `EXPO_PUBLIC_*` variables. Service-role/secret keys stay server-side.
- Every new database table enables RLS in its migration and states its grants explicitly. User-owned data is scoped to the verified user id from the auth token, never from the request body.
- Learner recordings stay on the device; persistent cloud audio retention is not selected.

## Content authoring

- Author Spanish lessons and Hebrew wording jointly, one lesson/stage at a time: present the inherited planned content first, mark proposed changes explicitly, incorporate Dor's corrections, verify before expanding. Do not silently replace or narrow planned content.
- Grammar and question words are taught explicitly inside the trip interactions, respecting per-unit skill prerequisites and the recommended chapter order.
- `docs/curriculum/curriculum-plan.json` is now edited directly with joint review; its old generator scripts stay in the legacy archive. `pilot-spec.json` is the previous content bank, not the active sequence; keep its source IDs. A curriculum update does not approve lesson copy.
- `content/` holds the editable lesson JSON, the Zod/TypeScript contract and local tests. A valid draft is not a publishable lesson. Keep stable unit/activity IDs and immutable published revisions; never import outlines as runnable lessons. Later publication imports validated data into Supabase — no hand-maintained second copy.
- Review/editorial metadata and developer explanations never appear in learner UI. Developer teaching belongs in docs and conversation.
- Recurring characters: `assets/characters/<id>/` (start from `index.json` and `character.json`). Juan v1 was approved 2026-10-15; use his saved reference as image input and compare each new appearance. Review new identities and story facts jointly; keep previous versions.
- Audition short Spanish-only voice samples with Dor before full audio production.

## Design (Figma)

Before designing, building or changing any screen or UI component, load the design and component skills without being asked (Dor, 2026-10-17): `vercel-react-native-skills` always, `vercel-composition-patterns` for shared lesson components, `ui-ux-pro-max` for layout, copy or accessibility decisions, and the Figma `figma-design-to-code` skill when implementing a Figma frame (selection and review: `docs/planning/toolchain.json#skill_review_2026_10_16`).

One reusable template per interaction type and meaningful state (hint, error, success), with representative content (Dor, 2026-10-16). Do not create frames/variants or Present checkpoints per phrase, answer list or audio change. Add Figma work only for a new interaction, layout or state, or a real usability issue. Shared React Native components render lesson data; verify the real flow in the app.

## Pronunciation assessment

Retained but deferred until after the working unit (plan approved 2026-10-16). The first flow, and the initial public App Store release, use recording and self-replay with no automated pass/fail. Plain transcription is not pronunciation assessment; no arbitrary threshold or invented phoneme diagnosis. Azure es-MX/F0 is an unvalidated candidate; keep the two human-trial results and research in `docs/research/pronunciation/` for later calibration against human judgment. Read `work-plan.json#delivery` before resuming provider experiments.

## Keeping documentation healthy

- One repository, one copy of each document. Record a decision once, in the file listed above, and link to it. Do not append the same paragraph to several documents.
- Git history is the archive: do not create snapshot copies or `archive/` folders. Commit small, topic-sized changes.
- READMEs answer what this is, how to run it and how it is organized. History belongs in Git and the learning log.
- Paths in docs are relative to the repository root unless written as a Markdown link.
