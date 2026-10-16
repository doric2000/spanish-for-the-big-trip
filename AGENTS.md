# Agent instructions — product repository

This is the product Git root for "ספרדית לטיול הגדול".

**All rules are in [../AGENTS.md](../AGENTS.md).** Read it first; it applies to this repository and every subdirectory. This file adds nothing that contradicts it and repeats none of it.

If this repository is checked out without the surrounding workspace (so `../AGENTS.md` and `../.codex-review/` are missing):

- Follow [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) for the joint learning workflow and [README.md](README.md) for the recorded baseline.
- Ask Dor for the current stage and decisions before extending scope.
- Never request or write secrets in chat, commands, logs or docs.

Directory notes:

- `mobile/AGENTS.md` — Expo/React Native technical rules.
- `content/README.md` — lesson JSON/Zod contract and local checks.
- `supabase/README.md` — migrations and SQL checks.
- `assets/characters/` — recurring character references (start from `index.json`).
