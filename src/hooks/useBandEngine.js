import { useReducer, useCallback, useRef } from 'react';
import { bandReducer, INITIAL_STATE } from '../reducers/bandReducer.js';
import { createUndoableReducer, createUndoableState } from '../reducers/undoReducer.js';
import { makeColor } from '../utils/colorUtils.js';
import { autoDetectDividers } from '../utils/imageUtils.js';

const undoableReducer = createUndoableReducer(bandReducer);
const UNDO_INITIAL = createUndoableState(INITIAL_STATE);

export function useBandEngine() {
  const [undoState, dispatch] = useReducer(undoableReducer, UNDO_INITIAL);
  const state = undoState.present;

  // Undo / redo derived state and callbacks
  const canUndo = undoState.past.length > 0;
  const canRedo = undoState.future.length > 0;
  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);

  // Image data refs (not in reducer - too large for state)
  const originalImageDataRef = useRef(null);
  const displayImageDataRef = useRef(null);
  // Source image data URL for project serialization
  const imageDataURLRef = useRef(null);

  const loadImage = useCallback((result) => {
    originalImageDataRef.current = result.originalImageData;
    displayImageDataRef.current = result.displayImageData;
    if (result.imageDataURL) {
      imageDataURLRef.current = result.imageDataURL;
    }
    dispatch({
      type: 'LOAD_IMAGE',
      originalDims: result.originalDims,
      displayDims: result.displayDims,
      displayScale: result.displayScale,
    });
  }, []);

  const addDivider = useCallback((y) => dispatch({ type: 'ADD_DIVIDER', y }), []);
  const removeDivider = useCallback((index) => dispatch({ type: 'REMOVE_DIVIDER', index }), []);
  const moveDivider = useCallback((index, y) => dispatch({ type: 'MOVE_DIVIDER', index, y }), []);
  const nudgeDivider = useCallback((index, delta) => dispatch({ type: 'NUDGE_DIVIDER', index, delta }), []);

  const paintBand = useCallback((bandId, color) => dispatch({ type: 'PAINT_BAND', bandId, color }), []);
  const setGradient = useCallback((bandId, gradient) => dispatch({ type: 'SET_GRADIENT', bandId, gradient }), []);
  const clearBand = useCallback((bandId) => dispatch({ type: 'CLEAR_BAND', bandId }), []);
  const toggleLock = useCallback((bandId) => dispatch({ type: 'TOGGLE_LOCK', bandId }), []);
  const renameBand = useCallback((bandId, name) => dispatch({ type: 'RENAME_BAND', bandId, name }), []);
  const selectBand = useCallback((bandId) => dispatch({ type: 'SELECT_BAND', bandId }), []);

  const setTool = useCallback((tool) => dispatch({ type: 'SET_TOOL', tool }), []);
  const setActiveColor = useCallback((color) => dispatch({ type: 'SET_ACTIVE_COLOR', color }), []);
  const addSwatch = useCallback((color) => dispatch({ type: 'ADD_SWATCH', color }), []);
  const removeSwatch = useCallback((index) => dispatch({ type: 'REMOVE_SWATCH', index }), []);

  const copyColor = useCallback((bandId) => dispatch({ type: 'COPY_COLOR', bandId }), []);
  const pasteColor = useCallback((bandId) => dispatch({ type: 'PASTE_COLOR', bandId }), []);

  const toggleOriginal = useCallback(() => dispatch({ type: 'TOGGLE_ORIGINAL' }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);
  const stampPattern = useCallback((startCoord, period, templateDividers, templateBands) =>
    dispatch({ type: 'STAMP_PATTERN', startCoord, period, templateDividers, templateBands }), []);

  const setDividerAxis = useCallback((axis) => dispatch({ type: 'SET_DIVIDER_AXIS', axis }), []);

  const autoDetect = useCallback(() => {
    const imgData = displayImageDataRef.current;
    if (!imgData || !state.displayDims) return;
    const dividers = autoDetectDividers(imgData, state.displayDims, 8, state.dividerAxis);
    dispatch({ type: 'SET_DIVIDERS_FROM_AUTO', dividers });
  }, [state.displayDims, state.dividerAxis]);

  // Works for both horizontal (coord = y) and vertical (coord = x) - CanvasView passes the right axis coordinate
  const paintBandByY = useCallback((coord) => {
    const { dividers, bands, activeColor } = state;
    const sorted = [...dividers].sort((a, b) => a - b);
    let bandIdx = bands.length - 1;
    for (let i = 0; i < sorted.length; i++) {
      if (coord < sorted[i]) { bandIdx = i; break; }
    }
    const band = bands[bandIdx];
    if (band) paintBand(band.id, activeColor);
  }, [state, paintBand]);

  const getBandAtY = useCallback((coord) => {
    const { dividers, bands } = state;
    const sorted = [...dividers].sort((a, b) => a - b);
    let bandIdx = bands.length - 1;
    for (let i = 0; i < sorted.length; i++) {
      if (coord < sorted[i]) { bandIdx = i; break; }
    }
    return bands[bandIdx] ?? null;
  }, [state]);

  const getNearestDivider = useCallback((coord, threshold = 12) => {
    const { dividers } = state;
    let nearest = null, minDist = Infinity;
    dividers.forEach((d, i) => {
      const dist = Math.abs(d - coord);
      if (dist < minDist) { minDist = dist; nearest = i; }
    });
    return minDist <= threshold ? nearest : null;
  }, [state]);

  const pickColorFromCanvas = useCallback((x, y) => {
    const imgData = displayImageDataRef.current;
    if (!imgData) return null;
    const idx = (y * imgData.width + x) * 4;
    const r = imgData.data[idx];
    const g = imgData.data[idx + 1];
    const b = imgData.data[idx + 2];
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    return makeColor(hex, 'Picked');
  }, []);

  const loadProject = useCallback((projectData) => {
    dispatch({ type: 'LOAD_PROJECT', ...projectData });
  }, []);

  const getSerializableState = useCallback(() => ({
    dividers: state.dividers,
    bands: state.bands,
    swatches: state.swatches,
    displayDims: state.displayDims,
    originalDims: state.originalDims,
    displayScale: state.displayScale,
    dividerAxis: state.dividerAxis,
  }), [state]);

  return {
    state,
    originalImageDataRef,
    displayImageDataRef,
    imageDataURLRef,
    // Undo / redo
    undo,
    redo,
    canUndo,
    canRedo,
    // Actions
    loadImage,
    addDivider,
    removeDivider,
    moveDivider,
    nudgeDivider,
    paintBand,
    paintBandByY,
    setGradient,
    clearBand,
    toggleLock,
    renameBand,
    selectBand,
    setTool,
    setActiveColor,
    addSwatch,
    removeSwatch,
    copyColor,
    pasteColor,
    toggleOriginal,
    reset,
    autoDetect,
    getBandAtY,
    getNearestDivider,
    pickColorFromCanvas,
    loadProject,
    getSerializableState,
    setDividerAxis,
    stampPattern,
  };
}
