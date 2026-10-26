# ספרדית לטיול הגדול — agent instructions

This is the **only full instruction file** for the project. It applies to every agent (Codex, Claude or other) and every directory in this repository. Nested `AGENTS.md` files (for example `mobile/AGENTS.md`) add only directory-specific technical notes. The folder above this repository (`../.codex-review/`, `../output/`) is a legacy archive outside Git; read it only when a document cites a path there.

## Start here: the launch plan

**[`docs/LAUNCH_PLAN.md`](docs/LAUNCH_PLAN.md)** is the plan and the only place that states status (active card, next card). Work one card per chat and follow its chat protocol: read this file, the plan, the files the card lists and the previous card's handoff; nothing else unless the card points to it. When a card is done, after a context compaction, or when the topic moves to another card, write the handoff in the card and tell Dor explicitly to open a new chat. Work with one agent at a time in this folder.

## Where things live

| Need | File |
| --- | --- |
| Plan, cards, status | `docs/LAUNCH_PLAN.md` |
| Approved technology/product decisions | `docs/planning/approved-decisions.json` |
| Selected tools and installed skills | `docs/planning/toolchain.json` |
| Stage history 01–05 and their handoffs | `docs/planning/work-plan.json`, `docs/planning/stage-handoffs/` |
| Dor's learning record | `docs/learning/development-learning-log.json` |
| Joint workflow (Hebrew, for Dor) | `docs/DEVELOPMENT_GUIDE.md` |
| Curriculum (v4) and reviewed 1A copy | `docs/curriculum/curriculum-plan.json`, `docs/curriculum/unit1a-content.json` |
| Lesson JSON/Zod contract | `content/README.md` |
| Figma templates | `docs/design/interaction-catalog.json` |
| Evidence, research, audits | `docs/evidence/`, `docs/research/`, `docs/audits/` |

## Purpose and division of work

Dor and the agent build the app together. Dor wants hands-on understanding of every stage so he can explain it in job interviews; shipping code alone does not meet that goal.

- **Agent:** writes and edits code within the active card (standing authorization from Dor, 2026-10-15) and explains the meaningful parts. Do not ask Dor to type/paste code or re-approve routine coding unless he asks to type.
  After a step passes its automated checks, the agent makes the topic-sized commits and pushes to `main` itself, then reports the commit hashes (Dor, 2026-10-25). The push deploys the API to Vercel, where Dor runs the device check; the step counts as done only after that check, and a problem it finds is fixed with a new commit. Push before the device check only while Dor is the only learner; a migration or seed the change needs is applied first. Verify the state with `git status`/`git log` first, and the deployment through the Vercel MCP; never force-push or rewrite pushed history.
  The agent also runs development-database work itself through the linked Supabase CLI, only on `spanish-for-trip-dev` (Dor, 2026-10-26): draft seeds and SQL checks with `npx.cmd --no-install supabase db query --linked`, migrations with `db push --linked` after a `--dry-run`, and resets of Dor's own test progress. Before a delete it reads the rows it will remove; it reports what ran and the result. It never runs `db reset` in the cloud, never touches other learners' data or a production project, and anything that needs a secret or a new login stays with Dor.
- **Dor:** performs meaningful environment installation, account/settings work and device/API checks. When an action is assigned to Dor, leave it for him and wait for his result; do it yourself only if he delegates it.
- Explain and install one tool or dependency group at a time; place learning checkpoints around useful behavior, not after every small edit. Load only the installed skills relevant to the next action (`toolchain.json`) and keep the working Expo SDK.

## Workflow for each meaningful step

1. Before acting, explain in clear Hebrew: goal, why it is needed, tools, where it runs, how success is checked. Define new terms with a project example. If Dor says he is lost, step back to the big picture in plain words before details.
2. Explain each command before presenting it: working directory and expected output.
3. Implement one small part, review files and behavior together, verify it (including a relevant failure case). Explain debugging reasoning, not just the fix.
4. Check understanding briefly (Dor's own words or a small variation). This is not an exam or a permission request.
5. Record in `docs/learning/development-learning-log.json`: goal, who did what, evidence, concepts, open questions, next step. Keep agent implementation, Dor's execution and demonstrated understanding separate; never infer understanding from a passing test.

## Product boundaries

- Name: ספרדית לטיול הגדול. Tagline: לומדים מה שצריך לטיול, בתרגולים קצרים וממוקדים. MVP scope: `docs/LAUNCH_PLAN.md`.
- Stack (accepted): TypeScript, React Native/Expo, one small NestJS API on Vercel, PostgreSQL/Auth/Storage on Supabase. Flat layout: `mobile/`, `content/`, `supabase/`, `api/`.
- iPhone first, Android after launch. Sign-in: Google **and** Apple, no guest mode. Dor works on Windows with an active Apple Developer membership.
- Delivery order: unit 1A → all of C01 → all of C02. Do not sample units across chapters. Publish only whole chapters that passed the human copy, audio, device, progress and changed-detail checks.
- Money: free tiers only, except small one-time payments Dor approves first (Dor, 2026-10-26). Do not provision a service just because a document describes it.
- Pronunciation scoring is deferred until after launch; recording and self-replay only, no automated pass/fail.
- The old web prototype (`../prototype/`) is exploratory; its content and voices are not automatically approved.

## Security and secrets

- Never request secrets in chat or put them in commands, logs, docs or learning notes. Dor enters credentials only through the provider's secure flow or local env files that Git ignores.
- Only public values (Supabase URL, publishable/anon key) may appear in the mobile app or `EXPO_PUBLIC_*` variables. Service-role/secret keys stay server-side.
- Every new database table enables RLS in its migration and states its grants explicitly. User-owned data is scoped to the verified user id from the auth token, never from the request body.
- Learner recordings stay on the device.

## Content authoring

- Author Spanish lessons and Hebrew wording jointly, one unit at a time: present the planned content first, mark proposed changes explicitly, incorporate Dor's corrections, verify before expanding. Do not silently replace or narrow planned content.
- Grammar and question words are taught explicitly inside the trip interactions, respecting per-unit prerequisites.
- `content/` holds the editable lesson JSON, the Zod contract and tests; a valid draft is not a publishable lesson. Keep stable unit/activity IDs and immutable published revisions. Publication imports validated data into Supabase — no hand-maintained second copy.
- Review metadata and developer explanations never appear in learner UI.
- Recurring characters live in `assets/characters/<id>/`; use the approved reference image as input and compare each new appearance. Audition short Spanish-only voice samples with Dor before full audio production.

## Design (Figma)

Before designing, building or changing any screen or UI component, load the design and component skills without being asked (Dor, 2026-10-17): `vercel-react-native-skills` always, `vercel-composition-patterns` for shared lesson components, `ui-ux-pro-max` for layout, copy or accessibility decisions, and the Figma `figma-design-to-code` skill when implementing a Figma frame.

One reusable template per interaction type and meaningful state (hint, error, success), with representative content (Dor, 2026-10-16). Add Figma work only for a new interaction, layout or state, or a real usability issue — not per phrase or audio change. Shared React Native components render lesson data; verify the real flow in the app.

## Keeping documentation healthy

- One copy of each document. Record a decision once, in the file listed above, and link to it. Status lives only in `docs/LAUNCH_PLAN.md`.
- Git history is the archive: no snapshot copies or `archive/` folders. Commit small, topic-sized changes.
- READMEs answer what this is, how to run it and how it is organized. Paths in docs are relative to the repository root.
