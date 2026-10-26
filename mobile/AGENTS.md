# Mobile app — technical notes

**All workflow and product rules are in [../AGENTS.md](../AGENTS.md)** and take precedence over the generic Expo guidance below. Plan and status: `../docs/LAUNCH_PLAN.md`. This file holds only Expo/React Native technical rules for `mobile/`.

## Local rules for this app

- The unit 1A opening preview (`src/lesson/`) is a development-only authoring checkpoint. Keep unpublished content behind `__DEV__`; it is not a guest mode, a full lesson or saved progress.
- Keep `src/audio-lab.tsx` and its tests (`tests/audio-flow.test.cjs`) working; they are the recording/playback proof.
- Navigation: Expo Router (chosen by Dor, 2026-10-16). Routes live in `src/app/`; non-route code stays outside it.
- Layout is native right-to-left: Hebrew is the only iOS language declared in `app.json`, so React Native mirrors the layout. Use `row`, `flex-start` and the natural alignment of Hebrew text (`writingDirection: 'rtl'`); never `row-reverse`, `flex-end` or `textAlign: 'right'` to fake RTL (tested in `tests/auth.test.cjs`).
- Fit layouts to the screen by computing positions from the measured width (`useWindowDimensions`), never by scaling a fixed-size canvas with `transform: scale`: in RTL a narrower child sits at the right edge and scaling pushes it off screen. Check custom layouts at several widths (320–440pt), not only the prototype's 390pt. Give absolutely positioned `Image`s an explicit width and height; sized only by their edges, iOS can draw them at pixel size (both found on Dor's iPhone, tested in `tests/journey.test.cjs`).
- Before reporting a change, run the type check, the linter (ESLint with `eslint-config-expo`, covering `src/` and the Node tests) and the tests:

```bash
npm run typecheck
npm run lint
npm test
```

A lint rule is disabled only on a single line with a comment that says why (for example the `__DEV__`-only `require` in `src/app/lesson.tsx`).

CI (`../.github/workflows/ci.yml`) runs the same commands on every push and pull request.

## Expo changes often — do not trust training data

Expo ships breaking changes every SDK release. Before writing code that touches an Expo, EAS or React Native API:

1. Read the `expo` major version in `package.json` (currently SDK 57).
2. Use the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`.
3. For anything else, start from https://docs.expo.dev/llms.txt and follow its links.

## Commands

```bash
npx expo install <package>  # always use instead of npm install — picks SDK-compatible versions
npx expo start              # dev server
npx expo-doctor             # diagnose dependency/config issues
npx expo install --fix      # fix incompatible versions
```

On Windows PowerShell use `npx.cmd` / `npm.cmd` if script execution policy blocks `npx`.

## Builds (EAS)

Use EAS to build, sign and submit in the cloud (`npx eas-cli@latest build`, `submit`, `update`); no local Xcode needed. Owned builds are scheduled for stage 04 — do not start one before then.

- `ios/` and `android/` are generated (Continuous Native Generation). Never create or edit them by hand; configure native behavior in `app.json` and config plugins.
- Expo Go contains only its bundled native modules. A library with native code (for example native Google sign-in) needs a development build.
- Prefer Expo modules over third-party libraries. Docs: https://docs.expo.dev/versions/latest/
