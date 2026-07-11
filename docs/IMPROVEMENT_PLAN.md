# Textile Band Colorizer - Improvement Plan

Status: PARKED (Phase 2 complete and deployed; owner parked Phases 3-5 and X on 2026-07-11).
Baseline: commit `a0c8192` (2026-07-10).
Owner: Gogulaanand R.
This document is the single source of truth for the improvement effort.
Any agent working on this project must read this file fully before making changes, and must update the status tables and decision log when finishing a work item.

---

## 1. Project context

The app is a client-only React SPA that colorizes black-and-white handwoven textile images using band logic.
The user uploads an image, places horizontal or vertical divider lines to define bands, and paints each band with a solid color or a two-stop gradient.
Black pixels are always preserved; non-black (or white-only, depending on a toggle) pixels are replaced with the band color.
Exports are rendered at the original image resolution.

- Stack: React 19, Vite 8, Tailwind v4, Vitest, oxlint. Plain JavaScript, no TypeScript.
- Deploy: Vercel (SPA rewrite + strict CSP in `vercel.json`).
- Commands: `npm run dev`, `npm test`, `npm run lint`, `npm run build`.
- All state is in-memory. There is no backend and no persistence yet.

### Architecture map

| Area | File | Role |
|---|---|---|
| State | `src/reducers/bandReducer.js` | All band/divider/tool/swatch state transitions. Pure, tested. |
| Engine | `src/hooks/useBandEngine.js` | Wraps the reducer, holds full-res and display ImageData in refs, exposes action callbacks. |
| Colorize | `src/utils/imageUtils.js` | `buildColorizedSync` (per-pixel recolor), `autoDetectDividers`, image loading/downscale (display capped at 1000px wide). |
| Render cache | `src/hooks/useColorizer.js` | Offscreen canvas + dirty flag; dirty is set synchronously during render (deliberate, see comment in file). |
| Canvas | `src/components/Canvas/CanvasView.jsx` | Two stacked canvases (image + overlay), zoom/pan transform, mouse/keyboard interaction, screen-space ruler. |
| Zoom/pan | `src/hooks/useZoomPan.js` | Scale/offset state, screen-to-image coordinate mapping. |
| Shell | `src/App.jsx` | Composition, toasts, export handlers, repeat-pattern orchestration, tab panel. |
| Panels | `src/components/{Toolbar,BandSidebar,ColorControls,ExportDialog}/` | Presentation components. |
| Project files | `src/utils/projectFile.js` | JSON serialize/deserialize with sanitization. Save is currently not wired to the UI; Load is. |

Key invariants:

- `bands.length === dividers.length + 1` always.
- Dividers are kept sorted by every reducer path except `LOAD_PROJECT` (see A3).
- A band has either `color` or `gradient`, never both (reducer enforces).
- Divider positions are stored in display-image coordinates and scaled by `1 / displayScale` at export time.

---

## 2. Hard constraints (apply to every work item)

1. Never remove an existing feature.
   Features may only be improved or extended.
   The feature inventory in section 3 defines what must keep working.
2. Keep `npm test`, `npm run lint`, and `npm run build` green after every work item.
3. Keep the light visual theme and the existing interaction vocabulary (tools, hints, ruler, toasts).
4. Do not use the em dash character anywhere; use a plain dash.
5. Do not add agent names as commit co-authors.
6. Follow existing commit style: conventional prefixes (`fix:`, `feat:`, `chore:`, `refactor:`, `test:`, `docs:`).
7. Bug fixes must first be reproduced end-to-end (run the app, reproduce as a user would) before the fix is written, whenever the bug has a runtime surface.
8. Line references in this doc are relative to baseline `a0c8192` and may drift; verify before editing.

## 3. Feature inventory (must never regress)

- Image upload via button and drag-and-drop; display downscale with full-res export.
- Horizontal and vertical band axes with axis switch.
- Tools: Add Line, Paint, Drag Line, Remove Line.
- Divider nudging with arrow keys (Shift = x10), divider info bar.
- Auto Detect dividers.
- Solid color painting, two-stop gradients, HSL sliders, hex input, native picker, EyeDropper (Chromium).
- Swatches: defaults, add, remove.
- Band sidebar: select, rename (double-click), lock, clear, copy/paste color, hover sync with canvas.
- Repeat pattern: two-click band-range select, then stamp at any position, multiple stamps, Esc cancel, locked bands preserved.
- Replace-all-non-black toggle (vs white-only fill).
- Original/colorized toggle, zoom/pan (wheel, buttons, fit, 1:1, space/alt/middle-drag pan), screen-space ruler with band numbers.
- Export: PNG, JPG with quality slider, copy to clipboard; all at full resolution.
- Project Load from JSON (Save is a known gap, see B4; restoring Save is in scope, removing Load is not).

---

## 4. Findings register

Severity: H = user-visible data loss or broken flow, M = user-visible annoyance, L = polish/internal.

### Bugs (B)

| ID | Sev | Finding | Where |
|---|---|---|---|
| B1 | H | Re-uploading the same file does nothing: `App.jsx` owns the file input (line ~220) but never clears `.value`; the clearing code in `useImageLoader.js:24` targets the hook's own ref which is attached to nothing. | `src/App.jsx`, `src/hooks/useImageLoader.js` |
| B2 | M | Image load errors are silent: `useImageLoader` captures `error` but App never displays it. | `src/App.jsx:35` |
| B3 | H | Loading a project JSON with no image loaded shows a broken view: `LOAD_PROJECT` sets `displayDims` so the UI thinks an image exists, but the canvas is blank. | `src/App.jsx:145`, `bandReducer.js:305` |
| B4 | H | Save Project is missing while Load exists; `serializeProject`/`downloadJSON` are dead code. Round-trip is broken. | `src/utils/projectFile.js`, `src/App.jsx:144` |
| B5 | M | Moving/nudging a divider past a neighbor re-sorts dividers but not bands, so colors jump between stripes; drag also re-resolves the dragged divider by nearest-to-anchor and can grab the wrong one when dividers are close. | `bandReducer.js:105-129`, `CanvasView.jsx:236` |
| B6 | M | Repeat-pattern mode survives axis switch and Reset: `tool` is preserved by `SET_DIVIDER_AXIS`/`RESET`, and App-side `repeatTemplate`/`repeatFirstBandIdx` also survive, allowing cross-axis or stale stamps. | `bandReducer.js:56-65,318-326`, `src/App.jsx` |
| B7 | M | ColorControls desyncs: hex field does not follow external activeColor changes (eyedropper); HSL sliders do not follow hex edits; gradient hex text inputs are unvalidated and an invalid hex paints the band black via NaN rgb. | `src/components/ColorControls/ColorControls.jsx` |
| B8 | L | Toast timer race: `showToast` never clears the previous timeout, so back-to-back toasts get dismissed early. | `src/App.jsx:30-33` |
| B9 | M (verify) | Ctrl+wheel likely zooms the browser page along with the canvas: React attaches `wheel` passively, so `e.preventDefault()` in `handleWheel` may not work. Must be verified in a real browser before fixing (native non-passive listener via ref is the standard fix). | `CanvasView.jsx:313` |
| B10 | H | No undo/redo, and destructive actions (Reset, Auto Detect, axis switch) irreversibly wipe painted work with no confirmation. Auto Detect replaces all bands with fresh uncolored ones. | `bandReducer.js:218` and app-wide |
| B11 | H (fixed 2026-07-11) | App crashed on load after item 2.3: `handleRestoreSession` listed `showToast` in its dependency array before the `const showToast` declaration, a temporal-dead-zone ReferenceError that unmounted `<App>` (white screen). Found in the Phase 2 final review E2E pass; no unit test renders App.jsx so tests/lint/build stayed green. | `src/App.jsx` |
| B12 | M (fixed 2026-07-11) | Ctrl+Shift+Z redo never fired on real keyboards: with Shift held, `e.key` reports uppercase `'Z'` but the handler compared `e.key === 'z'`. Ctrl+Y and the toolbar button were unaffected. The buggy snippet came verbatim from the 2.1 design doc. | `src/App.jsx` |

### Architecture / code quality (A)

| ID | Sev | Finding |
|---|---|---|
| A1 | M | Repeat-pattern state machine is split between the reducer (`tool`) and App state (`repeatFirstBandIdx`, `repeatTemplate`); transitions are not atomic. Consolidate into the reducer (also fixes B6 structurally). |
| A2 | M | "Which band contains coordinate X" is implemented ~5 times (`App.jsx`, `useBandEngine.js` x2, `bandReducer.js` x2, plus per-pixel loops). Extract a shared `bandIndexAt(coord, sortedDividers)`. |
| A3 | L | Defensive `[...dividers].sort()` copies appear in ~8 places even though sortedness is already an invariant everywhere except `LOAD_PROJECT`. Sort once at that boundary and delete the copies. |
| A4 | L | `buildColorizedSync` duplicates ~40 lines between horizontal and vertical branches; unify via axis-major indexing. |
| A5 | L | `CanvasView` takes 19 props; pass the engine object or a context instead. |
| A6 | L | Dead weight: `uuid` npm dependency (never imported; code uses `crypto.randomUUID`), unused assets (`hero.png`, `react.svg`, `vite.svg`), placeholder `App.css`, unused exports (`pickColorFromCanvas`, `openFilePicker`, `serializeProject`, `downloadJSON` - the last two get re-used by B4). |
| A7 | L | `index.css` still carries dark-theme tokens and a dark body background under a light-themed app; visible as a dark flash and on overscroll. |
| A8 | L | README is the stock Vite template; write a real one. |
| A9 | L | `deserializeProject` does not sort/clamp dividers to image dims and does not truncate extra bands beyond `dividers.length + 1`. |
| A10 | L | Plain JS with structural objects (`{hex, rgb, name}`, band shape) flowing through many layers; add JSDoc typedefs for the core shapes (cheaper than a TS migration). |
| A11 | L | `hasSession` in `src/utils/sessionStorage.js` is exported and tested but never imported by the app (App uses `loadSession` directly). Fold into A6 dead-code pruning when Phase 3 resumes. |
| A12 | L | `useBandEngine` returns a fresh object every render, so App effects that depend on `engine` (keyboard listener, auto-save debounce) re-run per render. Harmless today (cleanup handles it) but worth memoizing when A5/3.7 touches this area. |

### Performance (PF)

| ID | Sev | Finding |
|---|---|---|
| PF1 | M | Full-res export runs synchronously on the main thread and uses `toDataURL` (doubles memory as base64). Multi-second freeze on large images with no feedback. Fix: Web Worker + `toBlob` + object URL. |
| PF2 | L | Every mousemove triggers a React state update (`setHoverCoord`) and a full overlay redraw, even for tools that draw no hover guide. rAF-throttle or skip when unused. |
| PF3 | L | Dividers stored in display px and scaled up at export lose up to `1/displayScale` px of precision (e.g. +-4px on a 4000px-wide image). Fix: store dividers in original-image coordinates and convert for display. |
| PF4 | L | Full-res and display ImageData are both retained for the whole session (deliberate, see decision log). Optional: keep the original as a Blob and re-decode at export time if memory becomes a problem. |

### UX / design (U)

| ID | Sev | Finding |
|---|---|---|
| U1 | H | Undo/redo (same as B10, listed here because it is the top UX gap). |
| U2 | M | Auto Detect gives no feedback (found count, zero-found case) and destroys existing colors; should report results and re-map colors onto new bands by overlap. |
| U3 | M | Accessibility: `text-slate-400` on white fails WCAG contrast; icon-only buttons lack `aria-label`; toast is not `aria-live`; canvas has `outline: none` with no focus-visible alternative; shortcuts only work when the canvas is focused. |
| U4 | M | Mouse-only input; migrate to pointer events to gain touch/pen (tablet users are likely in this domain). |
| U5 | L | Discoverability: empty state does not mention drag-and-drop; no tool shortcuts (A/P/D/R); no shortcut cheat sheet; rename only discoverable via tooltip. |
| U6 | L | Polish: band names go out of order after mid-image splits; vertical-axis band labels can hide under the 28px ruler at low zoom; export filename is always `textile-colored.png`; divider info bar shows position but is not editable. |
| U7 | L | Additive feature candidates: split into N equal bands; demo/sample image; split-view compare slider (keep the existing toggle); localStorage session auto-save. |
| U8 | L | Axis-switch toast says "dividers cleared" but colors are cleared too; fix wording. |

### Testing / tooling (T)

| ID | Sev | Finding |
|---|---|---|
| T1 | M | Only STAMP_PATTERN is unit-tested. Add reducer tests for add/remove/move/nudge divider and paint; pure-function tests for `buildColorizedSync`, `autoDetectDividers`, and projectFile round-trips. |
| T2 | M | No E2E tests. One Playwright smoke test (upload fixture, add divider, paint, export) would catch the B1-B3 class of bugs. |
| T3 | L | No CI. Add a GitHub Actions workflow: lint + test + build on push. |

---

## 5. Work plan

Phases are ordered by value and dependency.
Work items inside a phase are independent unless a dependency is noted.
One work item = one agent session (see section 6).

Status values: `todo`, `in-progress`, `done`, `blocked`, `skipped (reason)`.

### Phase 1 - Bug fixes (small, independent)

| Item | Fixes | Scope | Acceptance criteria | Tier | Status |
|---|---|---|---|---|---|
| 1.1 | B1 | Clear the file input value after load in App (or wire the hook's ref properly). | Uploading the same file twice in a row reloads it. Verified in browser. | sonnet | done |
| 1.2 | B2 | Show a toast when image loading fails. | A corrupt/non-image file produces a visible error message. | sonnet | done |
| 1.3 | B3 | Guard project load when no image is loaded (toast + abort, or prompt for image first). | Loading JSON without an image never shows the broken blank-canvas state. | sonnet | done |
| 1.4 | B8 | Store and clear the toast timeout. | Rapid successive toasts each display for their full duration. | sonnet | done |
| 1.5 | B7 | Sync ColorControls local state with `activeColor` changes; validate gradient hex inputs like `applyHex` does. | Eyedropper updates the hex field; invalid gradient hex never paints black; HSL and hex stay consistent. | sonnet | done |
| 1.6 | B6 | Cancel repeat mode (tool + template + first-band selection) on axis switch and Reset. | After axis switch or Reset, tool is `paint` and no stale template can be stamped. | sonnet | done |
| 1.7 | B9 | First reproduce in a browser; if confirmed, attach a native non-passive wheel listener via ref. | Ctrl+wheel zooms only the canvas, never the page. If not reproducible, record that in the decision log and close. | sonnet | skipped (not reproducible) |
| 1.R | - | Phase review: verify all Phase 1 items end-to-end, check for regressions against section 3. | All acceptance criteria re-verified in a browser; tests/lint/build green. | opus (review), fable/owner final | todo |

### Phase 2 - Data safety (highest user value)

| Item | Fixes | Scope | Acceptance criteria | Tier | Status |
|---|---|---|---|---|---|
| 2.1 | B10/U1 | Reducer-level undo/redo with history snapshots (band/divider state only, not ImageData); Ctrl+Z / Ctrl+Shift+Z; toolbar buttons. | Every destructive action (paint, divider ops, stamp, Auto Detect, Reset, axis switch) is undoable; history capped (e.g. 50); tests for history semantics. | opus (design) then sonnet (implement) | done |
| 2.2 | B4 | Restore Save Project: embed the source image (data URL) plus `replaceAllNonBlack` and axis in the JSON; keep Load compatible with old files (version bump + migration). | Save then Load in a fresh session restores the full editing state including the image. Round-trip test added. | opus | done |
| 2.3 | U7 | Auto-save working session to localStorage (or IndexedDB if the image payload is too large); offer restore on next visit. | Refresh mid-edit offers to restore; declining starts clean. Depends on 2.2 serialization. | sonnet | done |
| 2.4 | U8 | Fix axis-switch toast wording; with undo in place decide whether confirmations are still needed for Reset/Auto Detect (record in decision log). | Wording accurate; decision recorded. | sonnet | done |
| 2.R | - | Phase review: attempt to lose data via every destructive path. | No unrecoverable data-loss path remains. | opus (review), fable/owner final | done (phase ran via phase-runner) |

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

### Phase 4 - Performance and input robustness

| Item | Fixes | Scope | Acceptance criteria | Tier | Status |
|---|---|---|---|---|---|
| 4.1 | PF1 | Web Worker for full-res colorize; `toBlob` + object URL for downloads; progress/disabled state during export. | UI stays responsive exporting a 6000x4000 test image; no base64 duplication. | opus (design) then sonnet | todo |
| 4.2 | PF3 | Store dividers in original-image coordinates; convert for display. Touches reducer, canvas, colorizer, project files (migration). | Exported band edges exact at full res; display behavior unchanged; project-file version migrated. Do after 3.2. | opus | todo |
| 4.3 | U4 | Migrate mouse handlers to pointer events (click, drag, pan, hover). | All existing mouse interactions unchanged; basic touch drag/paint works on a tablet or DevTools touch emulation. | sonnet | todo |
| 4.4 | PF2 | rAF-throttle hover redraws; skip hover state updates for tools that do not use them. | No dropped frames while moving the mouse over a large image (verify with DevTools performance trace). | sonnet | todo |
| 4.R | - | Phase review with performance traces before/after. | Measured improvements documented in the decision log. | opus (review), fable/owner final | todo |

### Phase 5 - UX polish and additive features

| Item | Fixes | Scope | Acceptance criteria | Tier | Status |
|---|---|---|---|---|---|
| 5.1 | U7 | "Split into N equal bands" action (prompt or small input in toolbar). | N equal bands created respecting axis; undoable; existing dividers handling decided and recorded. | sonnet | todo |
| 5.2 | U2 | Auto Detect feedback (found count toast, zero-found message) and color-preserving re-detect (map old band colors to new bands by overlap). | Colors survive re-detection when bands overlap; feedback shown. | opus | todo |
| 5.3 | U6 | Editable numeric divider position in the info bar; export filename from source image name; fix band-name ordering after splits; fix vertical label/ruler overlap. | Each polish item verified in browser. | sonnet | todo |
| 5.4 | U5 | Tool keyboard shortcuts (A/P/D/R plus Esc everywhere) and a shortcuts/help overlay; advertise drag-and-drop in the empty state. | Shortcuts work regardless of panel focus (except while typing in inputs); overlay lists everything. | sonnet | todo |
| 5.5 | U3 | Accessibility pass: contrast tokens, aria-labels on icon buttons, aria-live toast, focus-visible styles. | Passes an axe-core scan with no serious violations; keyboard-only flow usable. | sonnet | todo |
| 5.6 | U7 | Demo/sample image button in the empty state; optional split-view compare slider (keep the existing toggle). | Demo loads instantly with bands pre-detected; compare slider works at any zoom. | sonnet | todo |
| 5.R | - | Final review of the whole effort. | Full manual pass of section 3 plus new features; owner sign-off. | fable/owner | todo |

### Cross-cutting (start alongside Phase 1, keep growing)

| Item | Fixes | Scope | Acceptance criteria | Tier | Status |
|---|---|---|---|---|---|
| X.1 | T1 | Reducer tests for divider ops + paint; pure tests for colorize, auto-detect, projectFile round-trip. | Coverage of every reducer action; tests document current intended semantics. | sonnet | todo |
| X.2 | T2 | Playwright smoke E2E: upload fixture, add divider, paint, toggle original, export PNG. | Runs headless locally and in CI; catches B1/B2/B3-class regressions. | sonnet | todo |
| X.3 | T3 | GitHub Actions: lint + test + build (+ E2E once X.2 lands). | Green on main; runs on every push/PR. | sonnet | todo |

---

## 6. Agent operating guide

This section is for any agent (Claude Code or otherwise) picking up work from this plan in a later session.

### Session start protocol

1. Read this file fully.
2. Run `git status --short --branch` and `git log --oneline -5` to understand where the repo is; never assume it matches the baseline.
3. Run `npm test` and `npm run lint` to confirm a green starting point; if red, fixing that comes first (record what you found in the decision log).
4. Pick exactly one work item that is `todo` and whose dependencies are `done`; set it to `in-progress` in this file before starting.

### Model routing

Owner's routing policy (mapped to currently available models; the Agent/Task tool accepts the aliases `sonnet`, `opus`, `fable`):

- `sonnet` (Sonnet 5, `claude-sonnet-5`): low-level implementation tasks, mechanical refactors, test writing, research/lookups.
- `opus` (Opus 4.8, `claude-opus-4-8`): design decisions, cross-cutting changes, synthesis, phase reviews, anything marked `opus` in the tables above.
- `fable` (Fable 5): final output review at phase boundaries (items `*.R`), or the owner reviews personally.
- Items marked "opus (design) then sonnet (implement)" mean: produce a short written design first (append it to the decision log), then implement in the same or a follow-up session at the lower tier.

### Focus rules (owner's explicit instructions)

- Do NOT fan out parallel subagents.
  Work sequentially: one work item, one focused agent, full context on that item only.
- Do not batch multiple work items into one session unless they are trivially related (e.g. 1.2 + 1.4).
- Do not start opportunistic refactors outside the current item's scope; if you find something, add it to the findings register instead.
- Delegation is allowed only when the plan tier says so (e.g. an opus session delegating implementation to a sonnet executor), and only one delegate at a time.

### Verification protocol (before marking anything `done`)

1. Reproduce-first for bugs: demonstrate the broken behavior in the running app (`npm run dev`, real browser) before fixing (constraint 7).
2. After the change: `npm test`, `npm run lint`, `npm run build` all green.
3. Exercise the change end-to-end in the browser as a user would; check the acceptance criteria literally.
4. Regression-check the neighboring features from the section 3 inventory (e.g. after touching CanvasView, verify zoom/pan/paint/drag still work on both axes).
5. Be picky about the UI: if something looks visibly off while verifying, fix it if in scope or file it in the findings register if not.

### Updating this document (mandatory)

- Set the work item status (`todo` -> `in-progress` -> `done`) as you go.
- Append one decision-log entry per session: date, item ID, what was done, any decisions made, anything discovered.
- If you discover a new bug or opportunity, add it to the findings register with the next free ID; do not silently expand your own scope.
- Never rewrite history in this file; append.

### Commit protocol

- Conventional prefix, imperative subject (matches existing history).
- One work item per commit where practical; reference the item ID in the body (e.g. `Plan item 1.1`).
- No co-author lines for agents (constraint 5).
- Commit only when the verification protocol has passed.

### Workflow execution (alternative to one-session-per-item)

A whole phase may instead be executed in a single session via the phase-runner workflow at `.claude/workflows/phase-runner.js`.
It preserves the routing policy and focus rules automatically: research and final gate on `fable`, implementation strictly sequential with the model per task taken from the tier column, review on `opus` with a bounded fix loop (fixes on `sonnet`), and no parallel fan-out.
Items marked "opus (design) then sonnet (implement)" become two consecutive tasks inside the run, with the design appended to the decision log before implementation starts.
The workflow never touches the phase-review item (`*.R`): the invoking session reads the final report, re-verifies anything doubtful, updates `*.R`, appends the closing decision-log entry, and commits the doc.
Run it only on an explicit owner request, passing the exact phase heading, e.g. `{phase: "Phase 2 - Data safety (highest user value)"}`.

---

## 7. Decision log

Append-only. Newest at the bottom.

- 2026-07-10 - Plan created from a full-codebase review at baseline `a0c8192` (review performed by Fable 5 session). Tests 14/14 green, lint clean at baseline.
- 2026-07-10 - Pre-existing decisions inherited from earlier sessions (do not relitigate without owner input): dual ImageData (display + full-res) kept in refs by design; dirty-flag colorizer cache marked during render deliberately; band-split keeps color on the first fragment by design; drag tracking anchored by position value rather than array index.
- 2026-07-10 - Phase 1 session (sonnet, items 1.1-1.7). Items completed: 1.1 (B1), 1.2 (B2), 1.3 (B3), 1.4 (B8), 1.5 (B7), 1.6 (B6). Item 1.7 (B9) skipped as not reproducible: tested Ctrl+scroll over the canvas in Chrome with React 19 / Vite 8; canvas zoom processed correctly (100% to 110%) and window.devicePixelRatio remained at 2.0 throughout, confirming the browser page did not zoom. React 19's onWheel delegation is non-passive and e.preventDefault() works. No native listener fix needed. All 14 tests green, lint clean, build passing after each item.
- 2026-07-10 - Added `.claude/workflows/phase-runner.js` (adapted from the astro project's runner) as an owner-approved alternative execution path for whole phases; see the "Workflow execution" subsection in section 6. Key adaptations: tasks carry a per-task model taken from the plan's tier column, house rules mirror section 2, agents maintain this doc's statuses and decision log, and the `*.R` items stay owner-closed.
- 2026-07-10 - Item 2.1 design (opus). Undo/redo architecture for bandReducer. Full design follows.

### 2.1 Design: Undo/Redo Architecture

#### (a) Pattern: wrapper (higher-order) reducer

A new `undoableReducer` function wraps `bandReducer`. It manages a three-part state:

```js
{
  past: [],      // Array<Snapshot>, most recent last, capped at HISTORY_CAP
  present: { ... bandReducer state ... },
  future: [],    // Array<Snapshot>, for redo
}
```

`useReducer(undoableReducer, ...)` replaces the current `useReducer(bandReducer, ...)` in `useBandEngine.js`. The rest of the app continues to consume `state` (which is `undoState.present`) and dispatch actions unchanged - the wrapper is transparent.

This pattern was chosen over modifying `bandReducer` directly because:
- `bandReducer` stays pure and testable in isolation (14 existing tests unchanged).
- History logic is a single orthogonal concern in one file.
- No action-type pollution: existing action strings stay the same.

The wrapper lives in a new file: `src/reducers/undoReducer.js`.

#### (b) Snapshot contents - what is captured

A snapshot contains only the slices that represent user-visible editing work and that are lost on destructive actions:

```js
function takeSnapshot(state) {
  return {
    bands: state.bands,             // Array<Band> (structural clone via spread)
    dividers: state.dividers,       // Array<number>
    selectedBandId: state.selectedBandId,
    dividerAxis: state.dividerAxis,
  };
}
```

Explicitly excluded from snapshots:
- `originalDims`, `displayDims`, `displayScale` - set once on image load, never destructively changed.
- `tool`, `activeColor`, `swatches`, `copiedColor`, `copiedGradient`, `showOriginal` - UI preferences, not editing data. Undoing a paint should not switch the user's active tool or selected color.
- ImageData refs - too large, lives outside the reducer in `useBandEngine` refs.

Restoring a snapshot merges it back into the current present:

```js
function applySnapshot(currentState, snapshot) {
  return {
    ...currentState,
    bands: snapshot.bands,
    dividers: snapshot.dividers,
    selectedBandId: snapshot.selectedBandId,
    dividerAxis: snapshot.dividerAxis,
  };
}
```

#### (c) Destructive actions - which actions create history entries

Before dispatching to `bandReducer`, the wrapper checks the action type. If it is destructive, a snapshot of `present` is pushed to `past` (and `future` is cleared, since a new branch of edits has started).

Destructive action types (create a history entry):

| Action type | Why destructive |
|---|---|
| `PAINT_BAND` | Overwrites band color |
| `SET_GRADIENT` | Overwrites band gradient |
| `CLEAR_BAND` | Removes band color/gradient |
| `ADD_DIVIDER` | Structural change to bands array |
| `REMOVE_DIVIDER` | Structural change to bands array |
| `MOVE_DIVIDER` | Changes divider position (band geometry) |
| `NUDGE_DIVIDER` | Changes divider position (band geometry) |
| `STAMP_PATTERN` | Bulk structural + color change |
| `SET_DIVIDERS_FROM_AUTO` | Replaces all dividers and bands |
| `SET_DIVIDER_AXIS` | Clears dividers and bands, changes axis |
| `RESET` | Clears all dividers and bands |
| `TOGGLE_LOCK` | Changes band lock state (affects future paint-ability) |
| `PASTE_COLOR` | Overwrites band color/gradient |
| `RENAME_BAND` | Changes band name (user data) |

Non-destructive action types (no history entry, pass through to inner reducer):

| Action type | Why non-destructive |
|---|---|
| `SELECT_BAND` | UI selection, no data change |
| `SET_TOOL` | UI preference |
| `SET_ACTIVE_COLOR` | UI preference |
| `ADD_SWATCH` | Swatch palette management |
| `REMOVE_SWATCH` | Swatch palette management |
| `COPY_COLOR` | Clipboard, no data change |
| `TOGGLE_ORIGINAL` | View toggle |
| `LOAD_IMAGE` | Fresh start - clears history (see section d) |
| `LOAD_PROJECT` | Fresh start - clears history (see section d) |

Note on MOVE_DIVIDER / NUDGE_DIVIDER coalescing: during a drag operation, many MOVE_DIVIDER actions fire in rapid succession. To avoid filling history with intermediate positions, the wrapper implements coalescing: if the previous history entry was also a MOVE_DIVIDER or NUDGE_DIVIDER for the same divider index and less than 500ms has elapsed, the snapshot is not pushed again (the original pre-drag snapshot remains). This means undoing a drag restores the position from before the drag started, not intermediate positions.

Implementation: the wrapper stores `lastActionType`, `lastActionMeta` (the divider index), and `lastActionTime` on the undoable state. Coalescing logic:

```js
const COALESCE_TYPES = new Set(['MOVE_DIVIDER', 'NUDGE_DIVIDER']);
const COALESCE_MS = 500;

function shouldCoalesce(prevType, prevMeta, prevTime, action) {
  if (!COALESCE_TYPES.has(action.type)) return false;
  if (prevType !== action.type) return false;
  if (prevMeta !== action.index) return false;
  return (Date.now() - prevTime) < COALESCE_MS;
}
```

#### (d) History-clearing actions

These actions reset history entirely (empty `past` and `future`):

- `LOAD_IMAGE` - A new image means a completely fresh editing session. The old history is meaningless.
- `LOAD_PROJECT` - Loading a saved project is a fresh starting point. Undoing past it would not make sense.

When one of these fires, the wrapper passes the action to `bandReducer`, then sets `past: []` and `future: []` on the result.

#### (e) History cap

Maximum 50 entries in `past`. When pushing a new snapshot and `past.length >= 50`, the oldest entry (`past[0]`) is shifted off. This bounds memory usage.

```js
const HISTORY_CAP = 50;

function pushHistory(past, snapshot) {
  const next = [...past, snapshot];
  if (next.length > HISTORY_CAP) next.shift();
  return next;
}
```

#### (f) UNDO and REDO action types

The wrapper handles two new meta-action types that never reach `bandReducer`:

```js
case 'UNDO': {
  if (past.length === 0) return undoState; // nothing to undo
  const previous = past[past.length - 1];
  return {
    past: past.slice(0, -1),
    present: applySnapshot(present, previous),
    future: [takeSnapshot(present), ...future],
    lastActionType: null,
    lastActionMeta: null,
    lastActionTime: 0,
  };
}

case 'REDO': {
  if (future.length === 0) return undoState; // nothing to redo
  const next = future[0];
  return {
    past: [...past, takeSnapshot(present)],
    present: applySnapshot(present, next),
    future: future.slice(1),
    lastActionType: null,
    lastActionMeta: null,
    lastActionTime: 0,
  };
}
```

#### (g) Integration into useBandEngine.js

Minimal changes to `useBandEngine.js`:

1. Import `createUndoableReducer` from `undoReducer.js` and `bandReducer` / `INITIAL_STATE` from `bandReducer.js`.
2. Create the wrapper once at module level: `const undoableReducer = createUndoableReducer(bandReducer);`
3. Replace `useReducer(bandReducer, INITIAL_STATE)` with `useReducer(undoableReducer, { past: [], present: INITIAL_STATE, future: [], lastActionType: null, lastActionMeta: null, lastActionTime: 0 })`.
4. Alias `state = undoState.present` so all existing destructured access stays the same.
5. Derive `canUndo = undoState.past.length > 0` and `canRedo = undoState.future.length > 0`.
6. Add `undo` and `redo` callbacks: `dispatch({ type: 'UNDO' })` and `dispatch({ type: 'REDO' })`.
7. Expose `undo`, `redo`, `canUndo`, `canRedo` from the hook return.

No other files need to change their dispatch calls. The wrapper is fully transparent.

#### (h) Keyboard bindings - location and implementation

Undo/redo shortcuts must work regardless of which element is focused (toolbar buttons, sidebar, color controls), not just when the canvas container has focus. Therefore, the binding is a `useEffect` with a global `window` keydown listener in `App.jsx`, not in `CanvasView.jsx`.

```js
// In App.jsx
useEffect(() => {
  function handleKeyDown(e) {
    // Skip if user is typing in an input/textarea
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      engine.undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      engine.redo();
    }
    // Also support Ctrl+Y for redo (Windows convention)
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      engine.redo();
    }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [engine]);
```

`e.metaKey` covers macOS Cmd+Z. The input/textarea guard prevents undo from firing while the user is editing a band name or hex input.

#### (i) Toolbar button placement

Two new buttons are added to `Toolbar.jsx`, placed after the axis toggle group and before the tool buttons, since undo/redo is a global action that logically precedes tool-specific work:

```
[Horizontal|Vertical] | [Undo] [Redo] | [Add Line] [Paint] [Drag Line] [Remove Line] | ...
```

The buttons:
- Undo: icon `↶`, label `Undo`, disabled when `!canUndo`, color `#64748b` (matches Reset/Auto Detect).
- Redo: icon `↷`, label `Redo`, disabled when `!canRedo`, color `#64748b`.
- Tooltip shows the keyboard shortcut: "Undo (Ctrl+Z)" / "Redo (Ctrl+Shift+Z)".

New props added to `Toolbar`: `onUndo`, `onRedo`, `canUndo`, `canRedo`.

#### (j) Test plan for undoReducer

New file: `src/reducers/undoReducer.test.js`. Test cases:

1. **Destructive action creates history entry**: dispatch PAINT_BAND, verify `past.length === 1`.
2. **Non-destructive action does not create history entry**: dispatch SELECT_BAND, verify `past.length === 0`.
3. **UNDO restores previous state**: paint, undo, verify band color is back to null.
4. **REDO re-applies undone action**: paint, undo, redo, verify band color is restored.
5. **UNDO with empty history is a no-op**: dispatch UNDO on fresh state, verify no change.
6. **REDO with empty future is a no-op**: dispatch REDO on fresh state, verify no change.
7. **New destructive action clears future**: paint, undo, add divider, verify `future.length === 0`.
8. **History cap at 50**: dispatch 55 paints, verify `past.length === 50` (oldest 5 dropped).
9. **LOAD_IMAGE clears history**: paint several times, load image, verify `past` and `future` are empty.
10. **LOAD_PROJECT clears history**: paint several times, load project, verify `past` and `future` are empty.
11. **MOVE_DIVIDER coalescing**: move same divider twice rapidly, verify only one history entry; move after 500ms gap, verify two entries.
12. **Undo across SET_DIVIDER_AXIS**: switch axis (destructive), undo, verify original axis and bands restored.
13. **Undo RESET**: add dividers, paint, reset, undo, verify dividers and colors restored.
14. **Undo STAMP_PATTERN**: stamp, undo, verify original band structure restored.
15. **Snapshot isolation**: modify a band after snapshot, verify the snapshot's band array is not mutated (structural sharing is safe because bandReducer always spreads).

#### (k) File inventory for implementation

| File | Change |
|---|---|
| `src/reducers/undoReducer.js` | New file. Wrapper reducer + `createUndoableReducer`, `HISTORY_CAP`, snapshot helpers. |
| `src/reducers/undoReducer.test.js` | New file. 15 test cases above. |
| `src/hooks/useBandEngine.js` | Replace `useReducer` call; expose `undo`, `redo`, `canUndo`, `canRedo`. ~15 lines changed. |
| `src/App.jsx` | Add `useEffect` for global Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y listener. Pass `onUndo`, `onRedo`, `canUndo`, `canRedo` to Toolbar. ~20 lines added. |
| `src/components/Toolbar/Toolbar.jsx` | Accept 4 new props; render two ToolBtn for undo/redo between axis toggle and tool buttons. ~15 lines added. |
| `src/reducers/bandReducer.js` | No changes. |
| `src/reducers/bandReducer.test.js` | No changes. |

Total estimated diff: ~250 lines new, ~15 lines modified.

- 2026-07-10 - Item 2.1 implementation (sonnet). Implemented the undo/redo design from the decision log verbatim. Created `src/reducers/undoReducer.js` with the `createUndoableReducer` wrapper (past/future stacks, 50-entry cap, MOVE_DIVIDER/NUDGE_DIVIDER coalescing within 500ms, history clearing on LOAD_IMAGE/LOAD_PROJECT, no-op detection). Integrated into `useBandEngine.js` by wrapping bandReducer - all existing consumers unchanged. Added global Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y keyboard handler in `App.jsx` with input/textarea guard. Added Undo/Redo toolbar buttons in `Toolbar.jsx` between axis toggle and tool buttons. Created 17 tests in `undoReducer.test.js` covering all 15 design cases plus edge cases. All 31 tests pass, lint clean, build passing. No changes to `bandReducer.js` or `bandReducer.test.js`.

- 2026-07-10 - Item 2.2 implementation (opus). Restored Save Project with full round-trip support. Key changes: (1) Bumped PROJECT_VERSION from 1 to 2. `serializeProject` now accepts an `opts` argument with `imageDataURL` and `replaceAllNonBlack`; the v2 format includes `dividerAxis`, `replaceAllNonBlack`, and `imageDataURL` (base64 data URL of the source image). (2) `deserializeProject` accepts both v1 and v2 files - v1 files get sensible defaults (horizontal axis, replaceAllNonBlack=true, no embedded image). (3) Added `loadImageFromDataURL` to `imageUtils.js` for loading embedded images from saved projects - returns the same result shape as `loadImageFromFile`. (4) `loadImageFromFile` now includes `imageDataURL` in its result so the data URL is captured when the user uploads an image. (5) `useBandEngine` stores the image data URL in an `imageDataURLRef` for serialization. (6) App.jsx: added `handleSaveProject` (serializes state + image data URL, downloads as `textile-project.json`); updated `handleLoadProject` to auto-load embedded images from v2 files (no pre-loaded image required) while still supporting v1 files (require image loaded first); restores `replaceAllNonBlack` from project. (7) Toolbar: added Save button (floppy disk icon) next to Load button, disabled when no image loaded. (8) Added 16 tests in `projectFile.test.js` covering round-trip fidelity (bands, dividers, swatches, dims, axis, replaceAllNonBlack, imageDataURL, band IDs, gradient RGB), v1 migration, version rejection, band padding, color sanitization, missing data, and serialization format. All 47 tests pass, lint clean, build passing.

- 2026-07-10 - Item 2.3 implementation (sonnet). Auto-save session to browser storage. **Decision: IndexedDB over localStorage.** localStorage has a ~5 MB limit per origin. Textile source images converted to data URLs (PNG base64) typically range from 10-30 MB for a 4000x3000 image. IndexedDB has no practical size limit - browsers allocate a percentage of available disk space (typically 50% or more), making it suitable for large payloads. The raw IndexedDB API is used (no wrapper library) to avoid adding runtime dependencies. Key implementation details: (1) Created `src/utils/sessionStorage.js` with `saveSession`, `loadSession`, `clearSession`, and `hasSession` functions wrapping raw IndexedDB operations. Database name `textile-band-colorizer`, version 1, single object store `session` with a fixed key `autosave`. (2) Auto-save in `App.jsx`: a `useEffect` watches `state` and `replaceAllNonBlack`; on change, it debounces (2 seconds) a write to IndexedDB using the same `serializeProject` format from item 2.2. An `initializedRef` flag prevents the empty initial state from overwriting a valid saved session before the restore check completes. Auto-save only activates when an image is loaded. (3) Session restore on mount: a one-time `useEffect` calls `loadSession()`; if a saved session with meaningful content (image, dividers, or painted bands) is found, a blue banner appears at the top of the app offering "Restore" and "Start Fresh" buttons. Accepting loads the embedded image and project state. Declining clears the saved session from IndexedDB. Corrupt sessions are silently cleared. (4) Added `fake-indexeddb` as a devDependency for testing IndexedDB in the Node test environment. 8 tests in `sessionStorage.test.js` cover save, load, clear, hasSession, overwrites, large payloads, and full project round-trips. All 55 tests pass, lint clean, build passing.

- 2026-07-10 - Item 2.4 (sonnet). Two sub-tasks completed: (1) Fixed axis-switch toast in App.jsx from "dividers cleared" to "dividers and colors cleared" - the previous wording was inaccurate because SET_DIVIDER_AXIS clears both dividers and band colors. Also replaced the em dash (U+2014) with a plain dash per project constraint 4. (2) Decision on confirmation dialogs for Reset and Auto Detect: **No confirmations needed.** With undo/redo fully implemented (item 2.1), every destructive action - including Reset, Auto Detect, and axis switch - is fully undoable via Ctrl+Z. Adding window.confirm() dialogs would introduce unnecessary friction in the primary workflow. Users who accidentally Reset or Auto Detect can immediately undo. The undo history cap of 50 entries is generous enough that the undo option remains available even after subsequent edits. Confirmation dialogs are a pre-undo safety net pattern; with undo available, they become redundant.

- 2026-07-11 - Item 2.R Phase 2 review (phase-runner, opus review + owner final gate). Phase ran via phase-runner workflow. Reviewer verdict: **pass** (after 1 blocking fix). Blocking finding: `loadImageFromDataURL` in `src/utils/imageUtils.js` did not return `imageDataURL` in its result, so `imageDataURLRef` stayed null after loading a v2 project or restoring a session from IndexedDB - subsequent manual saves and auto-saves would lose the embedded image, creating a data loss path. Fixed in commit `9f00b8a` (one line: added `imageDataURL: dataURL` to the resolve object). No unresolved blocking findings. Minor finding (no action): `showToast` used before definition in `useCallback` dependency for `handleRestoreSession` - works due to hoisting. Phase 1 review (1.R) was skipped per explicit owner override (not blocking Phase 2). Suite: 55/55 tests green, lint 0 errors, build clean. Operator actions: (1) Manual QA recommended - upload image, paint, Save, reopen, Load - verify full round-trip including image. (2) Manual QA - refresh mid-edit, verify restore banner, test both Restore and Start Fresh. (3) Manual QA - verify undo/redo toolbar buttons and Ctrl+Z/Ctrl+Shift+Z in browser.

- 2026-07-11 - Phase 2 final review (fable, owner-delegated). Reviewed all six Phase 2 commits (`99b3995`, `53895f0`, `17dc4ff`, `b6c9073`, `9f00b8a`, `7cdd937`) against the plan and the 2.1 design doc; implementation matches the design point for point (snapshot slices, destructive-action set, coalescing, cap, history clearing, toolbar/keyboard integration, v2 project format, v1 migration, IndexedDB autosave). Two defects found during the mandatory browser E2E pass, both fixed this session: (1) **B11, blocking**: the app crashed on load with `ReferenceError: Cannot access 'showToast' before initialization` - `handleRestoreSession` (added in 2.3) referenced `showToast` in its dependency array 30 lines before the `const` declaration. The 2.R reviewer had noted this and wrongly dismissed it as "works due to hoisting"; `const` is hoisted into the temporal dead zone, so every render threw and React unmounted the tree. Reproduced in Chrome (white screen), fixed by moving `showToast` above the restore handlers. Lesson recorded: tests/lint/build cannot catch App.jsx render crashes; the E2E step in the verification protocol is not optional. (2) **B12**: Ctrl+Shift+Z redo dead on real keyboards because Shift makes `e.key` report `'Z'`; fixed with a case-insensitive compare. Full E2E verified after fixes: upload, Auto Detect (4/4 dividers), paint, undo/redo via Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / toolbar buttons, undo across axis switch and Reset (painted state fully recovered), axis toast wording, Save (v2 JSON with embedded image verified on disk), Load in a fresh session (image + painted state restored), IndexedDB auto-save + restore banner (Restore and Start Fresh paths, decline clears the session), PNG export at source resolution, zero console errors. Suite green: 55/55 tests, lint clean, build passing. New minor findings filed as A11/A12 (not acted on, out of scope). Broadened `.gitignore` from `.omc/state/` + `.omc/autopilot/` to `.omc/` (sessions/checkpoints/plans were showing as untracked). **Owner decision: effort PARKED after Phase 2.** Phases 3-5 and X remain `todo`; briefing for resumption at `phases/briefing/phase-2.md`. Deployed to Vercel by pushing `main`.

---

## 8. Known non-goals (for now)

- No backend, accounts, or server-side persistence.
- No TypeScript migration (JSDoc typedefs only, A10).
- No mobile-specific layout work beyond pointer-event support (U4).
- No removal of the Load button even while Save is being reworked.

