/**
 * Undo/redo wrapper (higher-order) reducer for bandReducer.
 *
 * Manages a three-part state: { past, present, future } where
 * `present` is the inner bandReducer state.  All existing action
 * types pass through transparently; only UNDO and REDO are handled
 * here and never reach the inner reducer.
 *
 * See docs/IMPROVEMENT_PLAN.md section 7, "2.1 Design: Undo/Redo
 * Architecture" for the full rationale.
 */

export const HISTORY_CAP = 50;

const COALESCE_TYPES = new Set(['MOVE_DIVIDER', 'NUDGE_DIVIDER']);
const COALESCE_MS = 500;

/** Action types that create a history entry before dispatching. */
const DESTRUCTIVE_TYPES = new Set([
  'PAINT_BAND',
  'SET_GRADIENT',
  'CLEAR_BAND',
  'ADD_DIVIDER',
  'REMOVE_DIVIDER',
  'MOVE_DIVIDER',
  'NUDGE_DIVIDER',
  'STAMP_PATTERN',
  'SET_DIVIDERS_FROM_AUTO',
  'SET_DIVIDER_AXIS',
  'RESET',
  'TOGGLE_LOCK',
  'PASTE_COLOR',
  'RENAME_BAND',
]);

/** Action types that clear all history (fresh start). */
const HISTORY_CLEARING_TYPES = new Set([
  'LOAD_IMAGE',
  'LOAD_PROJECT',
]);

/**
 * Capture the slices of state that represent user-visible editing
 * work. Explicitly excludes UI preferences and image metadata.
 */
export function takeSnapshot(state) {
  return {
    bands: state.bands,
    dividers: state.dividers,
    selectedBandId: state.selectedBandId,
    dividerAxis: state.dividerAxis,
  };
}

/**
 * Merge a snapshot back into the current state, preserving slices
 * that are not part of the snapshot (tool, activeColor, etc.).
 */
export function applySnapshot(currentState, snapshot) {
  return {
    ...currentState,
    bands: snapshot.bands,
    dividers: snapshot.dividers,
    selectedBandId: snapshot.selectedBandId,
    dividerAxis: snapshot.dividerAxis,
  };
}

/**
 * Push a snapshot onto the past stack, enforcing the cap.
 */
function pushHistory(past, snapshot) {
  const next = [...past, snapshot];
  if (next.length > HISTORY_CAP) next.shift();
  return next;
}

/**
 * Determine whether two consecutive actions should coalesce into
 * a single history entry (e.g. rapid MOVE_DIVIDER during a drag).
 */
function shouldCoalesce(prevType, prevMeta, prevTime, action) {
  if (!COALESCE_TYPES.has(action.type)) return false;
  if (prevType !== action.type) return false;
  if (prevMeta !== action.index) return false;
  return (Date.now() - prevTime) < COALESCE_MS;
}

/**
 * Create an initial undoable state wrapping an inner reducer's
 * initial state.
 */
export function createUndoableState(innerInitial) {
  return {
    past: [],
    present: innerInitial,
    future: [],
    lastActionType: null,
    lastActionMeta: null,
    lastActionTime: 0,
  };
}

/**
 * Create a wrapper reducer that adds undo/redo semantics around
 * the given inner reducer.
 *
 * @param {Function} innerReducer - The pure inner reducer (bandReducer).
 * @returns {Function} The wrapping reducer.
 */
export function createUndoableReducer(innerReducer) {
  return function undoableReducer(undoState, action) {
    const { past, present, future } = undoState;

    // -- Meta actions handled entirely here --

    if (action.type === 'UNDO') {
      if (past.length === 0) return undoState;
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

    if (action.type === 'REDO') {
      if (future.length === 0) return undoState;
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

    // -- History-clearing actions --

    if (HISTORY_CLEARING_TYPES.has(action.type)) {
      const newPresent = innerReducer(present, action);
      return {
        past: [],
        present: newPresent,
        future: [],
        lastActionType: null,
        lastActionMeta: null,
        lastActionTime: 0,
      };
    }

    // -- Destructive actions (create a history entry) --

    if (DESTRUCTIVE_TYPES.has(action.type)) {
      const newPresent = innerReducer(present, action);

      // If the inner reducer returned the same state (no-op), skip history.
      if (newPresent === present) return undoState;

      // Coalescing: skip pushing if this is a continuation of the
      // same drag/nudge on the same divider within the time window.
      const coalesce = shouldCoalesce(
        undoState.lastActionType,
        undoState.lastActionMeta,
        undoState.lastActionTime,
        action,
      );

      const newPast = coalesce ? past : pushHistory(past, takeSnapshot(present));

      return {
        past: newPast,
        present: newPresent,
        future: [],  // new branch clears redo
        lastActionType: action.type,
        lastActionMeta: action.index ?? null,
        lastActionTime: Date.now(),
      };
    }

    // -- Non-destructive actions (pass through, no history) --

    const newPresent = innerReducer(present, action);
    if (newPresent === present) return undoState;

    return {
      ...undoState,
      present: newPresent,
    };
  };
}
