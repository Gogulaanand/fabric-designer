# Textile Band Colorizer — Technical Specification

Status: Draft v1 (authored by Architect for Autopilot pipeline)
Audience: planner, critic, executor
Scope: Production, client-side web app. No backend.

---

## 1. Product Overview

The Textile Band Colorizer turns a black-and-white handwoven textile scan into a
colorized preview using **strict horizontal band logic**:

- The image is divided into contiguous horizontal **bands** (full image width).
- Each band has exactly **one** color (or a top-to-bottom gradient).
- Within a band, **white/light pixels** take the band color; **black/dark pixels
  stay black**. There is no per-motif or per-region coloring — an entire row
  shares one band's color.

This mirrors how a weaver thinks: a horizontal pick/weft region uses a single
yarn color, so the entire horizontal slice recolors together.

### 1.1 Goals
- Fast, fluid editing of band boundaries and colors on large images.
- Pixel-accurate, full-resolution export with no UI overlays baked in.
- Self-contained projects (save/load) with no server dependency.
- Deploys as a static SPA to Vercel.

### 1.2 Non-Goals (v1)
- No freehand/region selection, no per-motif coloring, no vertical bands.
- No multi-image / layers / blend modes beyond band color + gradient.
- No collaborative or cloud features.
- No mobile-first design (desktop-first; must not break on tablet).

---

## 2. Tech Stack

| Concern        | Choice                                  | Notes |
|----------------|-----------------------------------------|-------|
| Framework      | React 19.2                              | From scaffold |
| Build          | Vite 8.1 + `@vitejs/plugin-react`       | From scaffold |
| Styling        | Tailwind CSS v4 via `@tailwindcss/vite` | MUST be added; not in scaffold |
| Lint           | oxlint 1.69 (`react`, `oxc` plugins)    | From scaffold (`.oxlintrc.json`) |
| IDs            | `crypto.randomUUID()`                   | No `uuid` dependency needed (HTTPS/secure context on Vercel) |
| Rendering      | Canvas 2D (`CanvasRenderingContext2D`) + offscreen canvas | No WebGL needed for v1 |
| State          | React `useReducer` + context           | No Redux |
| Deploy         | Vercel static (Vite preset)            | `vercel.json` SPA rewrite |

Rationale: the colorizer is a per-pixel transform over a downscaled buffer for
interaction and the full buffer for export. Canvas 2D + typed arrays are
sufficient and keep the dependency surface minimal. WebGL would add complexity
without a clear v1 payoff; revisit only if profiling shows the per-pixel pass is
a bottleneck at display resolution (it should not be at <= 1000px wide).

---

## 3. Project Initialization (resolves `_scaffold/` ambiguity)

The repo currently contains `_scaffold/` (a Vite 8 + React 19 starter with a demo
landing page) inside `/Users/gogulaanand/Documents/Projects/FabricDesigner/`.
The target structure in the brief is `fabric-designer/`. Phase 0 reconciles these:

1. Promote scaffold contents to the project working root (executor decision:
   either operate in place using `_scaffold/` as the app root, or copy
   `_scaffold/*` to a `fabric-designer/` subfolder and work there). Document the
   chosen root in the README. Recommended: copy to `fabric-designer/` to match
   the brief and keep `_scaffold/` pristine as a reference.
2. Remove the demo UI: delete `src/App.css`, the contents of `src/App.jsx`, and
   reset `src/index.css`. Remove unused demo assets (`react.svg`, `vite.svg`,
   `hero.png` references) — note `App.jsx` imports `./assets/*` that are not in
   the scaffold tree, so the demo will not run as-is and must be replaced.
3. Update `package.json` `name` to `fabric-designer`.
4. Add Tailwind v4:
   - `npm i -D tailwindcss @tailwindcss/vite`
   - `vite.config.js`: add the plugin.
     ```js
     import { defineConfig } from 'vite'
     import react from '@vitejs/plugin-react'
     import tailwindcss from '@tailwindcss/vite'
     export default defineConfig({ plugins: [react(), tailwindcss()] })
     ```
   - `src/index.css` (first line): `@import "tailwindcss";`
   - No `tailwind.config.js` required in v4. Theme tokens (colors, fonts) go in
     CSS via `@theme { ... }` if needed.
5. Keep oxlint (`npm run lint`). Add no ESLint.
6. Add `vercel.json` (see Section 18).

Acceptance: `npm run dev` shows a blank app shell (no demo content), Tailwind
utility classes apply, `npm run build` produces `dist/`, `npm run lint` passes.

---

## 4. High-Level Architecture

```
                          ┌──────────────────────────────────────────┐
                          │                  App.jsx                   │
                          │  - owns reducer state (bands, colors, ui)  │
                          │  - provides context + dispatch             │
                          └──────────────┬─────────────────────────────┘
              ┌──────────────────────────┼───────────────────────────┐
              ▼                          ▼                           ▼
       ┌────────────┐            ┌──────────────┐            ┌──────────────┐
       │  Toolbar    │           │    Canvas     │           │  BandSidebar  │
       │ (tools,     │           │ (zoom/pan,    │           │ (band list,   │
       │  B&W toggle,│           │  overlay,     │           │  select,      │
       │  export btn)│           │  interaction) │           │  reorder,     │
       └────────────┘            └──────┬───────┘            │  rename,lock) │
              │                         │                    └──────────────┘
              ▼                         │
       ┌────────────┐                   │
       │ColorControls│                  │
       │ picker,     │                  │
       │ swatches,   │                  │
       │ gradient,   │                  │
       │ eyedropper  │                  │
       └────────────┘                   │
                                        ▼
        Hooks layer:  useImageLoader · useBandEngine · useColorizer · useZoomPan
                                        │
                                        ▼
        Canvas layer:  colorizedCanvas (offscreen) → baseCanvas (visible)
                       overlayCanvas (visible, screen space)
```

Data flow: user input → dispatch action → reducer updates band/color/ui state →
hooks observe state → set dirty flags → rAF render loop recomputes the affected
canvas layer(s). Export and persistence read from the same canonical state.

---

## 5. Coordinate Systems (canonical = original image pixels)

There are four coordinate spaces. **The band model stores Y values in ORIGINAL
image pixel space** so that geometry is resolution-independent and export is exact.

1. **Original image space** — `originalImageData`, full resolution
   (`originalWidth × originalHeight`). Canonical for band `yStart/yEnd`, the
   Y-coordinate readout, and arrow-key nudges (±1 original px).
2. **Display space** — `displayImageData`, downscaled so width ≤ 1000px for
   fast interactive recompute. `displayRatio = displayHeight / originalHeight`
   (equal to `displayWidth / originalWidth`). If original width ≤ 1000, ratio = 1
   and display == original.
3. **Screen space** — pixels on the visible base canvas after zoom/pan
   (`scale`, `offset`).
4. **Client space** — mouse event coordinates relative to the viewport element.

### 5.1 Conversion formulas
Let `vp = viewportElement.getBoundingClientRect()`, transform-origin `(0,0)`,
container transform `translate(offset.x, offset.y) scale(scale)`.

```
client → displayCanvas:   dx = (clientX - vp.left - offset.x) / scale
                          dy = (clientY - vp.top  - offset.y) / scale
displayCanvas → original:  oy = dy / displayRatio      (ox analogous)
original → displayCanvas:   dy = oy * displayRatio
displayCanvas → screen:     sx = offset.x + dx * scale  (for overlay drawing)
```

The overlay is drawn directly in **screen space** (see Section 7.3), so it
projects each band's original `yStart/yEnd` → display → screen each frame.

---

## 6. Data Model (TypeScript-style; implemented in JS)

```ts
type UUID = string; // crypto.randomUUID()

// RGB 0-255 ints, plus optional alpha (reserved; v1 always 255)
type RGB = { r: number; g: number; b: number };

// A single solid color stop for a band
type ColorStop = {
  rgb: RGB;
  hex: string;     // "#rrggbb" (denormalized cache; rgb is source of truth)
};

// Top-to-bottom gradient for a band (vertical). Null when band is solid.
type GradientDef = {
  from: RGB;       // color at band yStart (top)
  to: RGB;         // color at band yEnd (bottom)
  // interpolation space; "rgb" default, "hsl" optional (Section 9.3)
  space: 'rgb' | 'hsl';
};

// A horizontal band. Bands tile the image top→bottom with no gaps/overlaps.
type Band = {
  id: UUID;
  name: string;              // user label; default "Band N"
  yStart: number;            // inclusive, ORIGINAL px
  yEnd: number;              // exclusive, ORIGINAL px (yEnd > yStart)
  color: ColorStop | null;   // null = not yet colored → render as B&W passthrough
  gradient: GradientDef | null; // when set, overrides `color`
  locked: boolean;           // see lock semantics, Section 13.4
};

type ColorMode = 'multiply' | 'threshold';

type Settings = {
  colorMode: ColorMode;      // default 'multiply'
  threshold: number;         // 0-255, used only when colorMode==='threshold' (default 128)
  showColorized: boolean;    // false = show original B&W
  // auto-detect tuning
  autoDetectSensitivity: number; // 0-1 (default 0.5)
};

type Viewport = {
  scale: number;             // clamp [0.1, 32]
  offset: { x: number; y: number }; // screen px
};

type ImageMeta = {
  name: string;              // original file name
  width: number;             // original px
  height: number;            // original px
  // base64 PNG data URL of the SOURCE B&W image (self-contained projects)
  dataUrl: string | null;    // null in lightweight projects
};

type UIState = {
  activeTool: Tool;          // see Section 12
  selectedBandId: UUID | null;
  selectedDividerIndex: number | null; // index into derived dividers, or null
  hoverDividerIndex: number | null;
  draggingDividerIndex: number | null;
  clipboardColor: ColorStop | null;    // for copy/paste color
  eyedropperActive: boolean;
};

// Full app state (single reducer)
type AppState = {
  image: ImageMeta | null;   // null until an image is loaded
  bands: Band[];             // invariant: sorted by yStart, contiguous, covers [0,height)
  settings: Settings;
  viewport: Viewport;
  ui: UIState;
};

// Undo/redo wrapper (Section 8.4) — ENHANCEMENT scope
type HistoryState = {
  past: AppStateCore[];
  present: AppStateCore;     // AppStateCore = AppState minus transient ui/hover fields
  future: AppStateCore[];
};
```

### 6.1 Derived: dividers
Dividers are **not stored**; they are derived from band boundaries:

```
dividers = bands.slice(0, -1).map(b => b.yEnd)  // length = bands.length - 1
```

A divider at index `i` separates `bands[i]` (above) and `bands[i+1]` (below).
The image top (y=0) and bottom (y=height) are implicit and never dividers.

### 6.2 Band invariants (must hold after every reducer action)
1. `bands.length >= 1`.
2. `bands[0].yStart === 0` and `bands[last].yEnd === image.height`.
3. For all i: `bands[i].yEnd === bands[i+1].yStart` (contiguous).
4. For all i: `bands[i].yEnd > bands[i].yStart` (each band ≥ 1px tall).
5. Sorted ascending by `yStart`.
6. IDs are stable across reorder/recolor/divider edits (only created on
   split/load, destroyed on merge/delete).

A pure `assertBandInvariants(bands, height)` helper SHOULD run in dev builds
after each reducer transition (no-op in production).

---

## 7. Rendering Pipeline

### 7.1 Canvas inventory
| Canvas            | Visibility | Resolution        | Redraw trigger |
|-------------------|------------|-------------------|----------------|
| `colorizedCanvas` | offscreen  | display res       | `colorizeDirty` (bands geometry, any color/gradient, colorMode, threshold, image load) |
| `baseCanvas`      | visible    | display res       | `baseDirty` (colorized recompute finished, or B&W/colorized toggle) |
| `overlayCanvas`   | visible    | viewport size     | `overlayDirty` (hover, selection, drag, zoom, pan, divider add/move/remove, label change) |

`colorizedCanvas` is an `OffscreenCanvas` when available, else a detached
`<canvas>`. The per-pixel colorize pass writes into its `ImageData`.

### 7.2 DOM layout & zoom/pan (reconciliation with brief)
The brief says "two canvas layers … Display canvas composites both" and also
allows "CSS transform on canvas container." This spec refines that into **two
visible stacked canvases** rather than one compositing canvas:

- **Why deviate:** a single compositing display canvas must re-blit the
  (expensive) colorized bitmap on every hover/drag frame just to repaint cheap
  overlay graphics. Two stacked canvases let the base stay untouched while only
  the overlay repaints. The "composite" still happens — via DOM stacking
  (`z-index`) instead of a third draw call.

Layout:
```
<div class="viewport"  // overflow:hidden, relative, fills available area
  >
  <div class="pan-zoom-layer"  // transform: translate(ox,oy) scale(s); origin 0 0
    >
    <canvas ref=baseCanvas />   // display-res; image pixels; CSS-scaled by parent
  </div>
  <canvas ref=overlayCanvas />  // absolute, fills viewport; NOT transformed
</div>
```

- **Base canvas** is CSS-transformed by `.pan-zoom-layer` → zoom/pan is handled
  by the GPU compositor; no JS redraw on pan. Image pixels scale (intended).
- **Overlay canvas** is the **full viewport size, never CSS-transformed**. It is
  redrawn in screen space each interaction frame. This keeps divider lines a
  crisp **1px regardless of zoom** — critical because the headline interaction is
  precise divider drag/nudge with a Y readout. (If the overlay were inside the
  transformed layer, a 1px line would blur to `scale`px.)

### 7.3 Overlay contents (drawn in screen space, projected from original Y)
- Divider lines (full width), default + hover + selected styles.
- Drag handle / hit zone visualization for the active divider.
- Band number + name labels (anchored at band left edge, vertically centered in
  the band's screen span; hidden if band screen-height < label height).
- Hover band highlight (subtle translucent fill) when relevant tool is active.
- Y-coordinate tooltip near cursor during divider drag (original px value).

### 7.4 Render loop & dirty flags
A single `requestAnimationFrame` loop coalesces work:
```
function frame() {
  if (colorizeDirty) { runColorize(); colorizeDirty=false; baseDirty=true; }
  if (baseDirty)     { blitBase();    baseDirty=false; }
  if (overlayDirty)  { drawOverlay(); overlayDirty=false; }
  raf = requestAnimationFrame(frame);
}
```
Reducer actions and pointer handlers only SET dirty flags; they never draw
synchronously. This dedupes bursts (e.g., dragging a divider sets `overlayDirty`
many times per frame but draws once). When `showColorized` is false, `blitBase`
draws the original (uncolorized) display bitmap instead of `colorizedCanvas`.

Zoom/pan only updates `viewport` + sets `overlayDirty` (base moves via CSS;
overlay must reproject). `colorizeDirty` is NOT set by zoom/pan.

---

## 8. State Management

### 8.1 Store shape
Single `useReducer(rootReducer, initialState)` in `App.jsx`, exposed via two
contexts: `StateContext` (value) and `DispatchContext` (dispatch) to avoid
re-rendering consumers that only dispatch. `bandReducer.js` holds the band/color
slice logic; `rootReducer` delegates band actions to it and handles
settings/viewport/ui.

### 8.2 Actions (representative; reducer is exhaustive)
```
// Image
{ type: 'IMAGE_LOADED', payload: { meta: ImageMeta } }   // resets bands to single full band

// Bands / dividers
{ type: 'ADD_DIVIDER', payload: { y: number } }          // original px; splits band, creates new id
{ type: 'REMOVE_DIVIDER', payload: { index: number } }   // merges bands[i],bands[i+1]; keeps upper band id
{ type: 'MOVE_DIVIDER', payload: { index: number, y: number } } // clamps to neighbor bounds (±1px min)
{ type: 'NUDGE_DIVIDER', payload: { index: number, delta: number } } // arrow keys
{ type: 'REORDER_BANDS', payload: { fromIndex, toIndex } } // see Section 13.3 semantics
{ type: 'RENAME_BAND', payload: { id, name } }
{ type: 'SET_BAND_LOCK', payload: { id, locked } }
{ type: 'AUTO_DETECT_BANDS', payload: { dividers: number[] } } // replaces dividers; preserves colors by overlap

// Colors
{ type: 'SET_BAND_COLOR', payload: { id, color: ColorStop } }
{ type: 'SET_BAND_GRADIENT', payload: { id, gradient: GradientDef | null } }
{ type: 'CLEAR_BAND_COLOR', payload: { id } }
{ type: 'COPY_COLOR', payload: { id } }                  // → ui.clipboardColor
{ type: 'PASTE_COLOR', payload: { id } }                 // ui.clipboardColor → band

// Settings / view / ui
{ type: 'SET_COLOR_MODE', payload: { mode } }
{ type: 'SET_THRESHOLD', payload: { value } }
{ type: 'TOGGLE_COLORIZED' }
{ type: 'SET_TOOL', payload: { tool } }
{ type: 'SELECT_BAND', payload: { id | null } }
{ type: 'SELECT_DIVIDER', payload: { index | null } }
{ type: 'SET_VIEWPORT', payload: { scale?, offset? } }

// Project
{ type: 'LOAD_PROJECT', payload: { project: ProjectFile } }
// (Save reads state; no action needed)

// History (ENHANCEMENT)
{ type: 'UNDO' } | { type: 'REDO' }
```

### 8.3 Dirty-flag bridging
The reducer is pure and does not touch canvases. A `useColorizer` effect diffs
the relevant slices (bands geometry signature, color signature, settings) and
sets `colorizeDirty`. A separate effect sets `overlayDirty` on ui/viewport
changes. Use stable signatures (e.g., a hash of `bands.map(b=>b.yEnd)` for
geometry vs a hash of colors) so a pure color change can later be optimized to a
partial recompute (ENHANCEMENT).

### 8.4 Undo/redo (ENHANCEMENT scope)
Wrap the core slice (`bands`, `settings`, `image`) in a `past/present/future`
history. Transient `ui` and `viewport` are excluded (don't pollute history with
hover/pan). Coalesce rapid `MOVE_DIVIDER`/`NUDGE_DIVIDER` into a single history
entry (debounce on action type + target id). Cap history depth (e.g., 50).

---

## 9. Colorization Algorithm

### 9.1 Per-pixel rule
For each pixel at original row `y`, with source grayscale luminance `L` in
[0,255], and the band covering `y` providing an effective color `C = {r,g,b}`
(solid, or gradient evaluated at `y`):

- **`multiply` mode (DEFAULT):** `out = C * (L / 255)` per channel.
  - A true-white pixel (L=255) → exactly `C` (honors "every white pixel gets the
    solid band color").
  - A true-black pixel (L=0) → black (honors "black pixels stay black").
  - Anti-aliased weave grays (0<L<255) → proportional shade of `C`, preserving
    thread-edge detail and the woven texture. This is why multiply is the default:
    threshold would discard that texture and alias the edges.
- **`threshold` mode (OPTIONAL):** `out = (L >= settings.threshold) ? C : black`.
  - Hard, flat fills. Useful for high-contrast graphic looks; user-selectable.

Bands with `color === null && gradient === null` pass through as grayscale
(`out = {L,L,L}`), so an untouched image renders as plain B&W.

Source luminance `L`: `L = 0.299*R + 0.587*G + 0.114*B` (Rec.601). For already
near-grayscale scans this is effectively the gray value; computing from RGB is
robust to slightly tinted scans. Precompute once per image into a `Float32`/
`Uint8` luminance array keyed by pixel to avoid recomputing on every recolor.

### 9.2 rowToBand index (per-row O(1) lookup)
Build `rowToBand: Int32Array(height)` mapping each original row → band index,
rebuilt only on geometry change. The colorize loop then resolves a row's band
without scanning the band list per pixel. For the display pass, map display row →
original row via `displayRatio` (or build a display-resolution `rowToBand`).

### 9.3 Gradient evaluation
For a band `[yStart,yEnd)` with `gradient {from,to,space}` at row `y`:
```
t = (y - yStart) / (yEnd - yStart)        // 0 at top → 1 at bottom
space==='rgb': C = lerpRGB(from, to, t)
space==='hsl': C = hslToRgb(lerpHSL(rgbToHsl(from), rgbToHsl(to), t))
```
Default `space='rgb'` (simple, fast). Offer `'hsl'` because RGB lerp between
distant hues can pass through muddy/gray midpoints; HSL lerp keeps saturation.
Tradeoff: HSL hue interpolation must choose shortest arc and costs conversions —
acceptable at display res, gated behind the per-band choice.

### 9.4 Recompute cost & coalescing
Display buffer is ≤ ~1000×(height·ratio) px. A single full pass is a tight loop
over a `Uint8ClampedArray`; expect low-tens-of-ms even for tall images. The rAF
coalescing (Section 7.4) ensures at most one recompute per frame.
ENHANCEMENT: partial recompute (only rows of the changed band) when a single
band's color/gradient changes and geometry is unchanged.

---

## 10. Band Engine (`useBandEngine` + `bandReducer`)

### 10.1 Divider operations
- **Add divider at original y:** find band B containing y; require
  `B.yStart < y < B.yEnd` (reject exact boundaries / sub-1px). Replace B with
  two bands: upper `[B.yStart, y)` keeps B.id, name, color/gradient, locked;
  lower `[y, B.yEnd)` gets a new id, default name, **no color** (or inherits
  upper color — choose inherit=false for clarity; document). Gradients on a split
  band are **clamped**: each half keeps the sub-range of the original gradient
  (re-evaluate from/to at the split point) so the visual is continuous.
- **Remove divider i:** merge `bands[i]` and `bands[i+1]` into
  `[bands[i].yStart, bands[i+1].yEnd)`. Keep `bands[i].id`/name/color; discard
  the lower band's id. Disallow if it would violate invariant 1 (can't remove
  when only one band).
- **Move/nudge divider i to y:** clamp `y` to
  `[bands[i].yStart + 1, bands[i+1].yEnd - 1]` so neither neighbor collapses.
  Update `bands[i].yEnd` and `bands[i+1].yStart` together.

### 10.2 Locked-band interaction (see 13.4 for full semantics)
- A locked band's color/gradient cannot change.
- The two dividers bordering a locked band cannot be moved/nudged/removed in a
  way that changes the locked band's span. (A divider shared with a locked band
  is treated as pinned on the locked side.)

### 10.3 Auto-detect from contrast (REQUIRED but optional feature)
Heuristic, best-effort assist; the user always refines manually.
Algorithm:
1. Compute the per-row mean luminance profile `P[y]` over original rows (reuse
   the luminance array).
2. Smooth `P` with a small moving average (window ~ height/200, min 3) → `S`.
3. Compute first-derivative magnitude `D[y] = |S[y] - S[y-1]|`.
4. Normalize `D` to [0,1]. Pick local maxima exceeding a threshold derived from
   `autoDetectSensitivity` (higher sensitivity → lower threshold → more bands).
5. Enforce a minimum band height (e.g., max(8px, height/200)) by suppressing
   peaks too close to a stronger neighbor (non-max suppression).
6. Emit candidate divider Y list → `AUTO_DETECT_BANDS`. The reducer rebuilds
   bands and re-maps existing colors by maximum vertical overlap so prior work is
   not fully lost.
Expose a sensitivity slider + "Apply" (non-destructive preview before commit is
an ENHANCEMENT).

---

## 11. Hooks

### 11.1 `useImageLoader.js`
- Accepts a `File` (drag-drop or file input) or a data URL (project load).
- Decodes via `createImageBitmap`/`Image`, draws to a canvas, reads
  `originalImageData` (full res).
- Produces `displayImageData` by drawing the bitmap into a canvas scaled so
  width ≤ 1000 (`imageSmoothingQuality='high'`), reading back ImageData.
- Computes and caches the original + display luminance arrays.
- Validates type (PNG/JPG/WEBP/BMP), guards very large images (warn/cap, see 16).
- Returns `{ originalImageData, displayImageData, displayRatio, meta, status }`.

### 11.2 `useBandEngine.js`
- Thin wrapper exposing band selectors (`getBandAt(y)`, `dividers`,
  `selectedBand`) and bound dispatchers for divider/band actions.
- Owns `rowToBand` memoization keyed by geometry signature + height.

### 11.3 `useColorizer.js`
- Owns `colorizedCanvas` (offscreen) and its `ImageData`.
- Runs the per-pixel pass (Section 9) on the **display** buffer for screen.
- Exposes `renderFullResolution(): Promise<HTMLCanvasElement>` that runs the same
  pass over `originalImageData` for export (Section 14).
- Sets/clears `colorizeDirty`/`baseDirty`; integrates with the rAF loop.

### 11.4 `useZoomPan.js`
- Owns `scale`/`offset` (or reads from `viewport` slice and dispatches).
- Wheel zoom centered on cursor (recompute offset so the image point under the
  cursor is invariant); clamp scale [0.1, 32].
- Pan via space+drag or middle-mouse-drag; "fit" and "100%" helpers.
- Exposes `clientToOriginal(point)` / `originalToScreen(y)` used by Canvas + overlay.

---

## 12. Tool & Interaction Model

`Tool = 'addDivider' | 'paint' | 'drag' | 'remove'` (+ transient eyedropper).

| Tool        | Click behavior | Hover | Cursor |
|-------------|----------------|-------|--------|
| addDivider  | Add divider at clicked original Y (within hovered band) | line preview at cursor Y | crosshair |
| paint       | Assign current ColorControls color/gradient to clicked band; selects it | band highlight | paint/bucket |
| drag        | Grab nearest divider within hit radius and drag (MOVE_DIVIDER); empty space = pan | divider hover highlight when near | move / grab |
| remove      | Remove nearest divider within hit radius | divider hover highlight | not-allowed off-divider |

- **Hit radius** for dividers: ~6 screen px (independent of zoom, since overlay
  is screen-space). Convert candidate divider screen-Y via `originalToScreen`.
- Pan (space+drag / middle mouse) and wheel-zoom are available under ALL tools.
- Clicking a band (any tool that selects) updates `ui.selectedBandId` and
  highlights the matching sidebar row, and vice versa.
- Eyedropper (toggled from ColorControls): next click samples the pixel under the
  cursor from the displayed bitmap (Section 13.3) and loads it into the picker;
  then deactivates.

---

## 13. UI Components

### 13.1 `Toolbar/`
- Tool buttons (addDivider, paint, drag, remove) — single active tool.
- B&W vs Colorized toggle (`TOGGLE_COLORIZED`).
- Zoom controls (in/out, fit, 100%, % readout).
- Undo/redo buttons (ENHANCEMENT).
- Open / Save project, Export buttons.
- Reflects keyboard shortcuts in tooltips (Section 15).

### 13.2 `Canvas/`
- Renders the viewport, `.pan-zoom-layer`, `baseCanvas`, `overlayCanvas`.
- Hosts the rAF render loop, pointer/keyboard handlers, and the drop target for
  image upload (drag-drop a file anywhere on the canvas).
- Empty state: upload prompt when `image === null`.
- Owns the overlay draw routine (dividers, labels, hover, drag tooltip).

### 13.3 `BandSidebar/`
- Scrollable list, **top band first** (matches image top→bottom). Each row:
  - Band number (1-based, top→bottom), color swatch (or gradient preview, or
    "B&W" chip if uncolored), pixel range `yStart–yEnd` (original px) + height.
  - Inline rename (double-click or edit affordance).
  - Lock toggle.
  - Selection highlight synced with `ui.selectedBandId`.
- **Reorder semantics:** because bands are positional, "reorder" swaps the
  **colors/names/lock** between bands (the geometry stays tied to position), OR
  is restricted to adjacent color-swap. Recommended v1: reordering moves a band's
  *appearance* (color/gradient/name/lock) to the target slot, leaving geometry
  fixed — document this clearly, since literal geometric reordering would violate
  contiguity. (Critic: confirm desired semantics with product.)
- Click row → select band + scroll/flash the corresponding canvas region.

### 13.4 Lock semantics (explicit)
A `locked` band:
- Cannot have its color/gradient changed (paint tool, paste, picker no-op with a
  toast).
- Cannot be renamed-cleared? (rename allowed; lock is about visual content +
  geometry, not the label — document choice). Recommended: lock blocks color +
  geometry, allows rename. 
- Its bordering dividers cannot move in a way that changes its span; remove of a
  bordering divider is blocked.
- Cannot be deleted/merged away.
- UI shows a lock badge; blocked actions surface a non-blocking toast.

### 13.5 `ColorControls/`
- **Picker:** HSL sliders + HEX input + RGB inputs, all bound to one color, kept
  in sync (edit any representation → others update). Use `colorUtils` conversions.
- **Named swatches:** a default palette (e.g., curated textile-friendly colors) +
  recently used. Click to apply to selected band; the palette is static config in
  v1 (custom saved swatches = ENHANCEMENT).
- **Gradient editor:** toggle solid/gradient for the selected band; pick `from`
  and `to` colors and interpolation space; live preview strip.
- **Eyedropper button:** activates sampling mode (Section 12). Implemented by
  reading `ImageData` at the cursor from the **base canvas / colorized buffer**
  (`ctx.getImageData(x,y,1,1)`), NOT the native `EyeDropper` API (which is
  Chromium-only and samples screen, not the image).
- **Copy/paste color:** copy selected band color → `ui.clipboardColor`; paste to
  another band.

---

## 14. Export (`ExportDialog/` + `useColorizer.renderFullResolution`)

- All exports run the colorize pass at **full original resolution** and include
  **no overlays** (dividers/labels/hover are overlay-only and never baked in).
- **PNG:** `canvas.toBlob(cb, 'image/png')` → download. Lossless, full res.
- **JPG:** quality slider [0.1, 1.0] (default 0.92); `toBlob(cb,'image/jpeg',q)`;
  live size estimate optional.
- **Clipboard:** `navigator.clipboard.write([new ClipboardItem({'image/png':
  blob})])`; gate behind a feature check + user gesture; fall back to download
  with a toast if unsupported/denied.
- Filename: `${projectName || imageName}-colorized.{png|jpg}`.
- Large-image note: a synchronous full-res pass can jank the main thread on very
  large scans. v1 may show a brief "Exporting…" state; ENHANCEMENT: run the pass
  in a Web Worker with `OffscreenCanvas` + progress, or process in row chunks
  yielding to the event loop.

---

## 15. Keyboard / Interaction Map

| Key | Action | Notes |
|-----|--------|-------|
| ↑ / ↓ | Nudge selected divider −1 / +1 original px | requires selected divider |
| Shift+↑ / ↓ | Nudge ±10px | coarse |
| Delete / Backspace | Remove selected divider | blocked if borders a locked band |
| V / B / D / R | Select tool drag / paint(?) … | finalize letters in impl; show in tooltips |
| Space (hold) + drag | Pan | works under any tool |
| Cmd/Ctrl + +/− | Zoom in/out | also wheel |
| Cmd/Ctrl + 0 | Reset zoom to 100% | |
| Cmd/Ctrl + 1 | Fit to viewport | |
| Cmd/Ctrl + S | Save project JSON | preventDefault |
| Cmd/Ctrl + O | Open project JSON | via hidden file input |
| Cmd/Ctrl + E | Open export dialog | |
| Cmd/Ctrl + C / V | Copy / paste band color | when a band is selected and focus is canvas |
| Cmd/Ctrl + Z / Shift+Z | Undo / redo | ENHANCEMENT |
| Esc | Cancel eyedropper / deselect | |

Implement a single keydown handler scoped to the app root; ignore when focus is
in a text input (rename/HEX field) except for global save/open/export.

---

## 16. Edge Cases & Error Handling

- **Unsupported / corrupt file:** reject with a clear message; keep prior state.
- **Huge images:** if `width*height` exceeds a cap (e.g., > 40 MP), warn and
  offer to proceed; display buffer still caps at 1000px wide. Memory for two full
  ImageData + luminance arrays must be considered.
- **1px / very thin bands:** enforce min 1px on add/move; label hidden if band
  screen height < label.
- **Image not loaded:** controls that require an image are disabled.
- **Project/image dimension mismatch on load:** if a lightweight project is
  loaded and the re-supplied image dimensions differ, either rescale band Y
  values by the height ratio or warn and abort (recommend: warn + offer rescale).
- **Clipboard API unavailable / permission denied:** fall back to file download.
- **Gradient on a 1px band:** degenerate `t`; treat as solid `from`.

---

## 17. Project File Format (`projectFile.js`)

JSON, versioned, self-contained by default.

```jsonc
{
  "format": "textile-band-colorizer",
  "version": 1,
  "createdAt": "ISO-8601",
  "appVersion": "x.y.z",
  "image": {
    "name": "scan.png",
    "width": 2400,
    "height": 3600,
    // Default: embedded base64 PNG of the SOURCE B&W image → project is
    // fully self-contained. Lightweight variant sets dataUrl:null + adds a
    // sha256 "hash" for re-supply matching.
    "dataUrl": "data:image/png;base64,....",
    "hash": "sha256-..."        // optional; present in lightweight mode
  },
  "settings": {
    "colorMode": "multiply",
    "threshold": 128,
    "showColorized": true,
    "autoDetectSensitivity": 0.5
  },
  "bands": [
    {
      "id": "uuid",
      "name": "Band 1",
      "yStart": 0,
      "yEnd": 420,
      "color": { "rgb": { "r": 200, "g": 30, "b": 40 }, "hex": "#c81e28" },
      "gradient": null,
      "locked": false
    }
    // ... contiguous to yEnd === image.height
  ],
  "viewport": { "scale": 1, "offset": { "x": 0, "y": 0 } }  // optional convenience
}
```

- **Save:** serialize current state (bands sorted, derived fields like `hex`
  included as cache). Trigger download `${name}.tbc.json`.
- **Load:** parse, validate `format`/`version`, run band invariants against
  `image.height`, then `LOAD_PROJECT`. Migrate older `version`s via a small
  migration map (none needed at v1; structure the loader for it).
- **Embed tradeoff:** embedding makes a 3–10 MB scan into a large JSON
  (base64 ≈ +33%), but guarantees the project reopens with zero friction
  (no re-upload). Lightweight mode keeps files tiny but requires re-supplying the
  exact source image. Default = embedded; expose a "Save lightweight" option.

---

## 18. Vercel Deployment

- Framework preset: **Vite** (auto-detected). Build: `vite build`, output: `dist`.
- The app is a single page with **no client-side router**; an SPA rewrite is
  precautionary (handles any future deep links / accidental subpaths and 404s).

`vercel.json`:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- Static asset caching is handled by Vercel defaults for hashed Vite assets.
- No environment variables, no serverless functions, no secrets (client-only).
- Confirm `dataUrl`/clipboard features work under HTTPS (Vercel is HTTPS, so
  `crypto.randomUUID()` and Clipboard API secure-context requirements are met).
- Pre-approved CLI (`.claude/settings.local.json`): `vercel --version`,
  `vercel whoami`. Deploy via `vercel` / `vercel --prod` in the project root.

---

## 19. Performance Notes

- Cap interactive buffer at 1000px wide (`displayImageData`); recompute is a
  single typed-array loop, rAF-coalesced.
- Precompute luminance arrays once per image (original + display).
- `rowToBand` Int32Array for O(1) per-row band resolution.
- Zoom/pan = CSS transform on base (GPU); no JS redraw of the base on pan.
- Overlay redraw is cheap (lines + a few labels) and screen-space.
- ENHANCEMENTS (only if profiling warrants): partial recompute on single-band
  color change; Web Worker + OffscreenCanvas for full-res export; memoized
  signatures to skip no-op recomputes.

---

## 20. Required vs Enhancement Scope

**Required (the six brief feature areas):**
1. Image handling: upload, zoom/pan, B&W/colorized toggle.
2. Band controls: add/remove/drag dividers, arrow nudge ±1px, Y readout,
   auto-detect from contrast (best-effort).
3. Color controls: HSL/HEX/RGB picker, named swatches, per-band gradient,
   copy/paste color, eyedropper.
4. Band sidebar: list with swatch/number/pixel-range, select, reorder, rename,
   lock.
5. Export: PNG full-res no overlays, JPG with quality slider, clipboard copy.
6. Project persistence: save/load JSON.

**Enhancements (deliver only after required scope is solid):**
- Undo/redo history.
- Partial recompute / Web Worker export.
- Custom saved swatch palette, non-destructive auto-detect preview.
- HSL gradient interpolation (ship RGB first).

---

## 21. Phased Build Order (with acceptance criteria)

**Phase 0 — Init (Section 3).** Promote scaffold → `fabric-designer/`, strip demo,
add Tailwind v4, add `vercel.json`. AC: blank styled shell builds, lints, runs.

**Phase 1 — Image + base render.** `useImageLoader`, dual ImageData, base canvas
draw, B&W/colorized toggle (toggle is trivial until colorize lands; show original
both ways initially). AC: upload a B&W image, see it; pan/zoom stub optional here.

**Phase 2 — Band engine + dividers + overlay.** `bandReducer`, invariants,
add/remove/move/nudge, overlay rendering (lines/labels/hover) in screen space,
keyboard nudge + Y readout, divider hit-testing. AC: add/move/remove dividers
with crisp 1px lines at any zoom; arrow keys nudge selected divider ±1px with
live Y value.

**Phase 3 — Colorizer.** `useColorizer`, offscreen colorize (multiply default,
threshold option), rowToBand, dirty-flag rAF loop, wire B&W/colorized toggle. AC:
assigning a color recolors that band's white pixels, black stays black, weave
texture preserved in multiply mode.

**Phase 4 — Color controls.** Picker (HSL/HEX/RGB synced), swatches, paint tool,
gradient editor, eyedropper (getImageData sampling), copy/paste. AC: full color
workflow per band including gradient.

**Phase 5 — Band sidebar.** List, select sync, rename, lock (semantics §13.4),
reorder (appearance-swap semantics §13.3), pixel ranges. AC: manage bands from
the panel; lock blocks color + geometry edits.

**Phase 6 — Zoom/pan.** `useZoomPan` finalize: cursor-centered wheel zoom, pan,
fit/100%, overlay reprojection. AC: smooth zoom/pan, overlay stays crisp + aligned.

**Phase 7 — Export.** PNG/JPG (quality), clipboard, full-res no-overlay pass. AC:
exported PNG matches on-screen colorization at full resolution with no lines.

**Phase 8 — Persistence.** Save/load JSON (embedded image default), validation +
invariants on load. AC: save, reload page, open project → identical state.

**Phase 9 — Auto-detect.** Contrast heuristic + sensitivity slider, color
re-map by overlap. AC: produces reasonable candidate dividers; user can refine.

**Phase 10 — Polish + deploy.** Empty states, toasts, disabled states, tooltips
with shortcuts, optional undo/redo, Vercel deploy. AC: deployed URL works end to
end; lint/build clean.

---

## 22. Open Questions / Risks (for critic & product)

1. **Reorder semantics** in the sidebar (geometry is positional) — confirm
   "appearance swap" vs disallow vs "swap adjacent colors". (§13.3)
2. **Split inheritance** — should a new lower band inherit the upper band's color
   or start uncolored? Spec defaults to uncolored. (§10.1)
3. **Lock scope** — does lock block rename? Spec allows rename, blocks color +
   geometry. (§13.4)
4. **Threshold vs multiply default** — spec defaults to multiply (texture
   preservation, still satisfies "white → solid color"). Confirm acceptable.
5. **Image embedding default** — spec embeds (self-contained). Confirm vs
   lightweight default given expected scan sizes.
6. **Tool letter bindings** — finalize the V/B/D/R-style mnemonics in impl.

