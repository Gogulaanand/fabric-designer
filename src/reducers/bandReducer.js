import { DEFAULT_SWATCHES } from '../utils/colorUtils.js';

export const INITIAL_STATE = {
  // Image data (not serializable directly — stored as refs in the hook)
  originalDims: null,
  displayDims: null,
  displayScale: 1,

  // Divider direction: 'horizontal' (rows) | 'vertical' (columns)
  dividerAxis: 'horizontal',

  // Band structure
  dividers: [],   // sorted positions in display coords (Y when horizontal, X when vertical)
  bands: [],      // Band[], length === dividers.length + 1

  // UI state
  selectedBandId: null,
  tool: 'paint',  // 'addDiv' | 'paint' | 'dragDiv' | 'rmDiv'
  activeColor: DEFAULT_SWATCHES[0],
  swatches: DEFAULT_SWATCHES,

  // Clipboard
  copiedColor: null,
  copiedGradient: null,

  // View
  showOriginal: false,
};

function makeBand(name) {
  return { id: crypto.randomUUID(), name, color: null, gradient: null, locked: false };
}

function rebuildBandNames(bands) {
  return bands.map((b, i) => ({ ...b, name: b.name || `Band ${i + 1}` }));
}

export function bandReducer(state, action) {
  switch (action.type) {

    case 'LOAD_IMAGE': {
      const { originalDims, displayDims, displayScale } = action;
      return {
        ...INITIAL_STATE,
        originalDims,
        displayDims,
        displayScale,
        dividers: [],
        bands: [makeBand('Band 1')],
        swatches: state.swatches,
        activeColor: state.activeColor,
        dividerAxis: state.dividerAxis,
      };
    }

    case 'SET_DIVIDER_AXIS': {
      if (action.axis === state.dividerAxis) return state;
      return {
        ...state,
        dividerAxis: action.axis,
        dividers: [],
        bands: [makeBand('Band 1')],
        selectedBandId: null,
      };
    }

    case 'ADD_DIVIDER': {
      const { y } = action;
      const { dividers, bands, dividerAxis, displayDims } = state;

      // Clamp to image (x-axis when vertical, y-axis when horizontal)
      const limit = dividerAxis === 'vertical' ? displayDims.w : displayDims.h;
      const clampedY = Math.max(1, Math.min(y, limit - 1));

      // Don't add duplicate
      if (dividers.some(d => Math.abs(d - clampedY) < 2)) return state;

      // Find which band this divides (sorted insert position)
      const newDivs = [...dividers, clampedY].sort((a, b) => a - b);
      const insertPos = newDivs.indexOf(clampedY);

      // Split: bands[insertPos] becomes two bands; new band inserted after
      const newBand = makeBand(`Band ${bands.length + 1}`);
      const newBands = [
        ...bands.slice(0, insertPos + 1),
        newBand,
        ...bands.slice(insertPos + 1),
      ];

      return { ...state, dividers: newDivs, bands: rebuildBandNames(newBands) };
    }

    case 'REMOVE_DIVIDER': {
      const { index } = action;
      const { dividers, bands } = state;
      if (index < 0 || index >= dividers.length) return state;

      // Merge bands[index] and bands[index+1] — keep bands[index], drop bands[index+1]
      const newDivs = dividers.filter((_, i) => i !== index);
      const newBands = bands.filter((_, i) => i !== index + 1);

      return { ...state, dividers: newDivs, bands: rebuildBandNames(newBands) };
    }

    case 'MOVE_DIVIDER': {
      const { index, y } = action;
      const { dividers, displayDims, dividerAxis } = state;
      if (index < 0 || index >= dividers.length) return state;

      const limit = dividerAxis === 'vertical' ? displayDims.w : displayDims.h;
      const clampedY = Math.max(1, Math.min(y, limit - 1));
      const newDivs = [...dividers];
      newDivs[index] = clampedY;
      newDivs.sort((a, b) => a - b);

      return { ...state, dividers: newDivs };
    }

    case 'NUDGE_DIVIDER': {
      const { index, delta } = action;
      const { dividers, displayDims, dividerAxis } = state;
      if (index < 0 || index >= dividers.length) return state;
      const limit = dividerAxis === 'vertical' ? displayDims.w : displayDims.h;
      const newY = Math.max(1, Math.min(dividers[index] + delta, limit - 1));
      const newDivs = [...dividers];
      newDivs[index] = newY;
      newDivs.sort((a, b) => a - b);
      return { ...state, dividers: newDivs };
    }

    case 'PAINT_BAND': {
      const { bandId, color } = action;
      const band = state.bands.find(b => b.id === bandId);
      if (!band || band.locked) return state;
      return {
        ...state,
        bands: state.bands.map(b => b.id === bandId ? { ...b, color, gradient: null } : b),
      };
    }

    case 'SET_GRADIENT': {
      const { bandId, gradient } = action;
      const band = state.bands.find(b => b.id === bandId);
      if (!band || band.locked) return state;
      return {
        ...state,
        bands: state.bands.map(b => b.id === bandId ? { ...b, gradient, color: null } : b),
      };
    }

    case 'CLEAR_BAND': {
      const { bandId } = action;
      const band = state.bands.find(b => b.id === bandId);
      if (!band || band.locked) return state;
      return {
        ...state,
        bands: state.bands.map(b => b.id === bandId ? { ...b, color: null, gradient: null } : b),
      };
    }

    case 'TOGGLE_LOCK': {
      const { bandId } = action;
      return {
        ...state,
        bands: state.bands.map(b => b.id === bandId ? { ...b, locked: !b.locked } : b),
      };
    }

    case 'RENAME_BAND': {
      const { bandId, name } = action;
      return {
        ...state,
        bands: state.bands.map(b => b.id === bandId ? { ...b, name } : b),
      };
    }

    case 'SELECT_BAND': {
      return { ...state, selectedBandId: action.bandId };
    }

    case 'SET_TOOL': {
      return { ...state, tool: action.tool };
    }

    case 'SET_ACTIVE_COLOR': {
      return { ...state, activeColor: action.color };
    }

    case 'ADD_SWATCH': {
      const exists = state.swatches.some(s => s.hex === action.color.hex);
      if (exists) return state;
      return { ...state, swatches: [...state.swatches, action.color] };
    }

    case 'REMOVE_SWATCH': {
      return { ...state, swatches: state.swatches.filter((_, i) => i !== action.index) };
    }

    case 'COPY_COLOR': {
      const band = state.bands.find(b => b.id === action.bandId);
      if (!band) return state;
      // Copy whichever fill is active: solid color or gradient
      return { ...state, copiedColor: band.color ?? null, copiedGradient: band.gradient ?? null };
    }

    case 'PASTE_COLOR': {
      if (!state.copiedColor && !state.copiedGradient) return state;
      const band = state.bands.find(b => b.id === action.bandId);
      if (!band || band.locked) return state;
      return {
        ...state,
        bands: state.bands.map(b => b.id === action.bandId
          ? { ...b, color: state.copiedColor, gradient: state.copiedGradient }
          : b),
      };
    }

    case 'SET_DIVIDERS_FROM_AUTO': {
      // Replace all dividers/bands with auto-detected ones
      const newDivs = [...action.dividers].sort((a, b) => a - b);
      const newBands = Array.from({ length: newDivs.length + 1 }, (_, i) => makeBand(`Band ${i + 1}`));
      return { ...state, dividers: newDivs, bands: newBands };
    }

    case 'TOGGLE_ORIGINAL': {
      return { ...state, showOriginal: !state.showOriginal };
    }

    case 'LOAD_PROJECT': {
      return {
        ...state,
        dividers: action.dividers,
        bands: action.bands,
        swatches: action.swatches ?? state.swatches,
        originalDims: action.originalDims ?? state.originalDims,
        displayDims: action.displayDims ?? state.displayDims,
        displayScale: action.displayScale ?? state.displayScale,
        dividerAxis: action.dividerAxis ?? state.dividerAxis,
      };
    }

    case 'RESET': {
      return {
        ...state,
        dividers: [],
        bands: [makeBand('Band 1')],
        selectedBandId: null,
        // dividerAxis preserved intentionally
      };
    }

    default:
      return state;
  }
}
