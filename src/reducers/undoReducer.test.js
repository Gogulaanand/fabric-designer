import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bandReducer, INITIAL_STATE } from './bandReducer.js';
import {
  createUndoableReducer,
  createUndoableState,
  HISTORY_CAP,
} from './undoReducer.js';

// ── helpers ──────────────────────────────────────────────────────────────────

const undoableReducer = createUndoableReducer(bandReducer);

function makeUndoState(overrides = {}) {
  const present = {
    ...INITIAL_STATE,
    displayDims: { w: 500, h: 1000 },
    originalDims: { w: 500, h: 1000 },
    dividers: [],
    bands: [makeBand('b1', 'Band 1')],
    ...overrides,
  };
  return createUndoableState(present);
}

function makeBand(id, name, extra = {}) {
  return { id, name, color: null, gradient: null, locked: false, ...extra };
}

function dispatch(state, action) {
  return undoableReducer(state, action);
}


// ── tests ────────────────────────────────────────────────────────────────────

describe('undoReducer', () => {

  // 1. Destructive action creates history entry
  it('creates a history entry for destructive actions (PAINT_BAND)', () => {
    const s0 = makeUndoState();
    const bandId = s0.present.bands[0].id;
    const s1 = dispatch(s0, {
      type: 'PAINT_BAND',
      bandId,
      color: { hex: '#ff0000', rgb: [255, 0, 0], name: 'Red' },
    });
    expect(s1.past.length).toBe(1);
    expect(s1.present.bands[0].color.hex).toBe('#ff0000');
  });

  // 2. Non-destructive action does not create history entry
  it('does not create a history entry for non-destructive actions (SELECT_BAND)', () => {
    const s0 = makeUndoState();
    const s1 = dispatch(s0, { type: 'SELECT_BAND', bandId: 'b1' });
    expect(s1.past.length).toBe(0);
    expect(s1.present.selectedBandId).toBe('b1');
  });

  // 3. UNDO restores previous state
  it('restores previous state on UNDO', () => {
    const s0 = makeUndoState();
    const bandId = s0.present.bands[0].id;
    const s1 = dispatch(s0, {
      type: 'PAINT_BAND',
      bandId,
      color: { hex: '#ff0000', rgb: [255, 0, 0], name: 'Red' },
    });
    expect(s1.present.bands[0].color.hex).toBe('#ff0000');
    const s2 = dispatch(s1, { type: 'UNDO' });
    expect(s2.present.bands[0].color).toBeNull();
    expect(s2.past.length).toBe(0);
    expect(s2.future.length).toBe(1);
  });

  // 4. REDO re-applies undone action
  it('re-applies the undone state on REDO', () => {
    const s0 = makeUndoState();
    const bandId = s0.present.bands[0].id;
    const s1 = dispatch(s0, {
      type: 'PAINT_BAND',
      bandId,
      color: { hex: '#ff0000', rgb: [255, 0, 0], name: 'Red' },
    });
    const s2 = dispatch(s1, { type: 'UNDO' });
    expect(s2.present.bands[0].color).toBeNull();
    const s3 = dispatch(s2, { type: 'REDO' });
    expect(s3.present.bands[0].color.hex).toBe('#ff0000');
    expect(s3.past.length).toBe(1);
    expect(s3.future.length).toBe(0);
  });

  // 5. UNDO with empty history is a no-op
  it('is a no-op when undoing with empty history', () => {
    const s0 = makeUndoState();
    const s1 = dispatch(s0, { type: 'UNDO' });
    expect(s1).toBe(s0);
  });

  // 6. REDO with empty future is a no-op
  it('is a no-op when redoing with empty future', () => {
    const s0 = makeUndoState();
    const s1 = dispatch(s0, { type: 'REDO' });
    expect(s1).toBe(s0);
  });

  // 7. New destructive action clears future
  it('clears future when a new destructive action is dispatched after undo', () => {
    const s0 = makeUndoState();
    const bandId = s0.present.bands[0].id;
    const s1 = dispatch(s0, {
      type: 'PAINT_BAND',
      bandId,
      color: { hex: '#ff0000', rgb: [255, 0, 0], name: 'Red' },
    });
    const s2 = dispatch(s1, { type: 'UNDO' });
    expect(s2.future.length).toBe(1);
    // New destructive action: add a divider
    const s3 = dispatch(s2, { type: 'ADD_DIVIDER', y: 500 });
    expect(s3.future.length).toBe(0);
    expect(s3.past.length).toBe(1); // the state before ADD_DIVIDER
  });

  // 8. History cap at 50
  it('caps history at HISTORY_CAP (50) entries', () => {
    let s = makeUndoState();
    const bandId = s.present.bands[0].id;
    for (let i = 0; i < 55; i++) {
      s = dispatch(s, {
        type: 'PAINT_BAND',
        bandId,
        color: { hex: `#${String(i).padStart(6, '0')}`, rgb: [i, 0, 0], name: `C${i}` },
      });
    }
    expect(s.past.length).toBe(HISTORY_CAP);
  });

  // 9. LOAD_IMAGE clears history
  it('clears history on LOAD_IMAGE', () => {
    let s = makeUndoState();
    const bandId = s.present.bands[0].id;
    // Build up some history
    s = dispatch(s, {
      type: 'PAINT_BAND',
      bandId,
      color: { hex: '#ff0000', rgb: [255, 0, 0], name: 'Red' },
    });
    s = dispatch(s, { type: 'ADD_DIVIDER', y: 500 });
    expect(s.past.length).toBe(2);
    // Load a new image
    s = dispatch(s, {
      type: 'LOAD_IMAGE',
      originalDims: { w: 800, h: 600 },
      displayDims: { w: 800, h: 600 },
      displayScale: 1,
    });
    expect(s.past.length).toBe(0);
    expect(s.future.length).toBe(0);
  });

  // 10. LOAD_PROJECT clears history
  it('clears history on LOAD_PROJECT', () => {
    let s = makeUndoState();
    const bandId = s.present.bands[0].id;
    s = dispatch(s, {
      type: 'PAINT_BAND',
      bandId,
      color: { hex: '#ff0000', rgb: [255, 0, 0], name: 'Red' },
    });
    expect(s.past.length).toBe(1);
    s = dispatch(s, {
      type: 'LOAD_PROJECT',
      dividers: [100, 200],
      bands: [
        makeBand('p1', 'P1'),
        makeBand('p2', 'P2'),
        makeBand('p3', 'P3'),
      ],
    });
    expect(s.past.length).toBe(0);
    expect(s.future.length).toBe(0);
    expect(s.present.dividers).toEqual([100, 200]);
  });

  // 11. MOVE_DIVIDER coalescing
  describe('MOVE_DIVIDER coalescing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('coalesces rapid MOVE_DIVIDER on same index into one history entry', () => {
      let s = makeUndoState({
        dividers: [500],
        bands: [makeBand('b1', 'B1'), makeBand('b2', 'B2')],
      });
      // First move: creates a history entry
      vi.setSystemTime(1000);
      s = dispatch(s, { type: 'MOVE_DIVIDER', index: 0, y: 510 });
      expect(s.past.length).toBe(1);
      // Second move within 500ms on same index: coalesces (no new entry)
      vi.setSystemTime(1200);
      s = dispatch(s, { type: 'MOVE_DIVIDER', index: 0, y: 520 });
      expect(s.past.length).toBe(1);
      expect(s.present.dividers[0]).toBe(520);
    });

    it('does not coalesce MOVE_DIVIDER after 500ms gap', () => {
      let s = makeUndoState({
        dividers: [500],
        bands: [makeBand('b1', 'B1'), makeBand('b2', 'B2')],
      });
      vi.setSystemTime(1000);
      s = dispatch(s, { type: 'MOVE_DIVIDER', index: 0, y: 510 });
      expect(s.past.length).toBe(1);
      // Move after 500ms gap: new history entry
      vi.setSystemTime(1600);
      s = dispatch(s, { type: 'MOVE_DIVIDER', index: 0, y: 520 });
      expect(s.past.length).toBe(2);
    });
  });

  // 12. Undo across SET_DIVIDER_AXIS
  it('undoes SET_DIVIDER_AXIS, restoring original axis and bands', () => {
    const s0 = makeUndoState({
      dividers: [300, 600],
      bands: [
        makeBand('b1', 'B1', { color: { hex: '#ff0000', rgb: [255, 0, 0], name: 'R' } }),
        makeBand('b2', 'B2', { color: { hex: '#00ff00', rgb: [0, 255, 0], name: 'G' } }),
        makeBand('b3', 'B3'),
      ],
      dividerAxis: 'horizontal',
    });
    // Switch axis (destructive)
    const s1 = dispatch(s0, { type: 'SET_DIVIDER_AXIS', axis: 'vertical' });
    expect(s1.present.dividerAxis).toBe('vertical');
    expect(s1.present.dividers.length).toBe(0);
    // Undo
    const s2 = dispatch(s1, { type: 'UNDO' });
    expect(s2.present.dividerAxis).toBe('horizontal');
    expect(s2.present.dividers).toEqual([300, 600]);
    expect(s2.present.bands[0].color.hex).toBe('#ff0000');
  });

  // 13. Undo RESET
  it('undoes RESET, restoring dividers and colors', () => {
    const s0 = makeUndoState({
      dividers: [200, 400],
      bands: [
        makeBand('b1', 'B1', { color: { hex: '#ff0000', rgb: [255, 0, 0], name: 'R' } }),
        makeBand('b2', 'B2'),
        makeBand('b3', 'B3'),
      ],
    });
    const s1 = dispatch(s0, { type: 'RESET' });
    expect(s1.present.dividers.length).toBe(0);
    expect(s1.present.bands.length).toBe(1);
    // Undo
    const s2 = dispatch(s1, { type: 'UNDO' });
    expect(s2.present.dividers).toEqual([200, 400]);
    expect(s2.present.bands.length).toBe(3);
    expect(s2.present.bands[0].color.hex).toBe('#ff0000');
  });

  // 14. Undo STAMP_PATTERN
  it('undoes STAMP_PATTERN, restoring original band structure', () => {
    const s0 = makeUndoState({
      dividers: [500],
      bands: [
        makeBand('b1', 'B1', { color: { hex: '#aaaaaa', rgb: [170, 170, 170], name: 'Gray' } }),
        makeBand('b2', 'B2'),
      ],
    });
    const tplBand = makeBand('t1', 'T1', { color: { hex: '#00ff00', rgb: [0, 255, 0], name: 'G' } });
    const s1 = dispatch(s0, {
      type: 'STAMP_PATTERN',
      startCoord: 200,
      period: 200,
      templateDividers: [100],
      templateBands: [tplBand, makeBand('t2', 'T2')],
    });
    expect(s1.present.dividers.length).toBeGreaterThan(1);
    expect(s1.past.length).toBe(1);
    // Undo
    const s2 = dispatch(s1, { type: 'UNDO' });
    expect(s2.present.dividers).toEqual([500]);
    expect(s2.present.bands.length).toBe(2);
    expect(s2.present.bands[0].color.hex).toBe('#aaaaaa');
  });

  // 15. Snapshot isolation
  it('snapshot is isolated from subsequent mutations', () => {
    const s0 = makeUndoState();
    const bandId = s0.present.bands[0].id;
    // Paint (creates snapshot of original null-color state)
    const s1 = dispatch(s0, {
      type: 'PAINT_BAND',
      bandId,
      color: { hex: '#ff0000', rgb: [255, 0, 0], name: 'Red' },
    });
    // The snapshot in past should have the original null color
    const snapshot = s1.past[0];
    expect(snapshot.bands[0].color).toBeNull();
    // Paint again with a different color
    const s2 = dispatch(s1, {
      type: 'PAINT_BAND',
      bandId,
      color: { hex: '#0000ff', rgb: [0, 0, 255], name: 'Blue' },
    });
    // The first snapshot should still have null (not mutated by the second paint)
    expect(s2.past[0].bands[0].color).toBeNull();
    // The second snapshot should have red
    expect(s2.past[1].bands[0].color.hex).toBe('#ff0000');
  });

  // Extra: no-op destructive actions do not create history entries
  it('does not create a history entry when a destructive action is a no-op', () => {
    // Paint a locked band is a no-op
    const lockedState = makeUndoState({
      bands: [makeBand('b1', 'B1', { locked: true })],
    });
    const s1 = dispatch(lockedState, {
      type: 'PAINT_BAND',
      bandId: 'b1',
      color: { hex: '#ff0000', rgb: [255, 0, 0], name: 'Red' },
    });
    expect(s1.past.length).toBe(0);
  });
});
