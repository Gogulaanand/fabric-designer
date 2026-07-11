# Phase 2 briefing - Data safety (highest user value)

Written 2026-07-11 at the close of Phase 2.
The improvement effort is PARKED after this phase; read this file first when resuming with Phase 3.
The authoritative plan is `docs/IMPROVEMENT_PLAN.md` (section 5 for the work plan, section 7 for the decision log including the full 2.1 undo/redo design).

## What was built

- **2.1 Undo/redo (B10/U1)** - `src/reducers/undoReducer.js` (new): higher-order wrapper around `bandReducer` with past/present/future stacks, 50-entry cap, MOVE_DIVIDER/NUDGE_DIVIDER coalescing (500ms window), history cleared on LOAD_IMAGE/LOAD_PROJECT.
  Integrated in `src/hooks/useBandEngine.js` (exposes `undo`, `redo`, `canUndo`, `canRedo`).
  Global Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y handler in `src/App.jsx`; Undo/Redo buttons in `src/components/Toolbar/Toolbar.jsx`.
  17 tests in `src/reducers/undoReducer.test.js`.
- **2.2 Save Project (B4)** - `src/utils/projectFile.js`: PROJECT_VERSION 2; format now embeds the source image as a data URL plus `dividerAxis` and `replaceAllNonBlack`; v1 files still load with defaults.
  `loadImageFromDataURL` added to `src/utils/imageUtils.js` (must return `imageDataURL` - see commit `9f00b8a`).
  Save button in the toolbar; `handleSaveProject`/`handleLoadProject` in `src/App.jsx`; v2 files auto-load their embedded image in a fresh session.
  16 tests in `src/utils/projectFile.test.js`.
- **2.3 Auto-save (U7)** - `src/utils/sessionStorage.js` (new): raw IndexedDB (db `textile-band-colorizer`, store `session`, key `autosave`); chosen over localStorage for 10-30 MB image payloads.
  App.jsx: 2s-debounced auto-save of the serialized project; restore banner on revisit with Restore / Start Fresh (decline clears the session).
  8 tests in `src/utils/sessionStorage.test.js`; `fake-indexeddb` added as devDependency.
- **2.4 Toast wording + confirmation decision (U8)** - axis-switch toast now says "dividers and colors cleared"; decision: no confirmation dialogs for Reset/Auto Detect since undo covers them.
- **Final-review fixes (this session)** - B11: `showToast` was referenced in `handleRestoreSession`'s dependency array before its `const` declaration (TDZ ReferenceError, app white-screened on load); moved above the restore handlers. B12: redo shortcut compared `e.key === 'z'` which misses the uppercase `'Z'` that Shift produces; now case-insensitive.

## Files touched (union)

- `src/App.jsx`
- `src/hooks/useBandEngine.js`
- `src/reducers/undoReducer.js` (new)
- `src/reducers/undoReducer.test.js` (new)
- `src/components/Toolbar/Toolbar.jsx`
- `src/utils/projectFile.js`
- `src/utils/projectFile.test.js` (new)
- `src/utils/imageUtils.js`
- `src/utils/sessionStorage.js` (new)
- `src/utils/sessionStorage.test.js` (new)
- `package.json`, `package-lock.json` (fake-indexeddb devDependency)
- `docs/IMPROVEMENT_PLAN.md`
- `.claude/workflows/phase-runner.js` (new, execution tooling)
- `.gitignore`

State at close: 55/55 tests, lint clean, build passing, full browser E2E pass (see the 2026-07-11 decision-log entry for the checklist).

## Next phase (copied verbatim from the plan)

### Phase 3 - Architecture hygiene (enables later phases)

| Item | Fixes | Scope | Acceptance criteria | Tier | Status |
|---|---|---|---|---|---|
| 3.1 | A1 | Move the repeat-pattern state machine fully into the reducer. | All repeat transitions atomic; App no longer holds repeat state; existing repeat tests still pass plus new transition tests. | opus | todo |
| 3.2 | A2/A3 | Extract `bandIndexAt`; enforce sorted-dividers invariant at `LOAD_PROJECT`; remove defensive sort copies. | One implementation of band lookup; no behavioral change; tests green. | sonnet | todo |
| 3.3 | B5 | Decide and implement divider-crossing semantics (recommended: clamp drag/nudge between neighbors, which is also what users expect); fix drag tracking to hold a stable divider identity. | Dragging a divider can no longer swap band colors; test added. Decision recorded. | opus (decide) then sonnet | todo |
| 3.4 | A4 | Merge the horizontal/vertical branches of `buildColorizedSync`. | Pixel-identical output on both axes (add a pure-function test comparing before/after fixtures). | sonnet | todo |
| 3.5 | A6/A7/A8 | Prune dead code (uuid dep, unused assets/exports, App.css), align `index.css` tokens with the light theme, write a real README. Do not remove `serializeProject`/`downloadJSON` (used by 2.2). | No dead code per `knip`-style manual check; no dark flash on load; README describes the actual product. | sonnet | todo |
| 3.6 | A9/A10 | Harden `deserializeProject` (sort/clamp/truncate) and add JSDoc typedefs for Color, Band, Gradient, Dims, ProjectFile. | Malformed files cannot produce invariant-violating state; typedefs referenced in hooks and reducer. | sonnet | todo |
| 3.7 | A5 | Reduce CanvasView prop drilling (pass engine object or context). | CanvasView props materially reduced with no behavior change. | sonnet | todo |
| 3.R | - | Phase review: full regression pass against section 3 inventory. | All features verified working; tests/lint/build green. | opus (review), fable/owner final | todo |

Notes for the resuming session: A11 (unused `hasSession` export) folds into 3.5's dead-code pass; A12 (engine object identity re-runs App effects each render) folds into 3.7.
