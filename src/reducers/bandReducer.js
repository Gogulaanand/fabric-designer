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
  tool: 'paint',  // 'addDiv' | 'paint' | 'dragDiv' | 'rmDiv' | 'repeatPlace'
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

    case 'REPEAT_PATTERN': {
      const { dividers, bands, dividerAxis, displayDims } = state;
      if (dividers.length === 0 || !displayDims) return state;

      const sorted = [...dividers].sort((a, b) => a - b);
      const period = sorted[sorted.length - 1];
      if (period <= 0) return state;

      const limit = dividerAxis === 'vertical' ? displayDims.w : displayDims.h;

      // Template = bands in [0, period): bands[0..M-1] where M = sorted.length.
      // Excludes the tail band that starts at period — it becomes band[0] of the next unit.
      // Unpainted (white) bands are preserved in the cycle as null, keeping stripe geometry intact.
      const templateBands = bands.slice(0, sorted.length);
      const N = templateBands.length; // always >= 1 since sorted.length > 0
      if (templateBands.every(b => !b.color && !b.gradient)) return state;

      // Tile divider positions: offset by period * k until we exceed the image
      const MAX_TILED_DIVIDERS = 10000;
      const allDividers = [...sorted];
      let k = 1;
      let offset = period;
      while (offset < limit && allDividers.length < MAX_TILED_DIVIDERS) {
        for (const d of sorted) {
          const newD = d + offset;
          if (newD < limit) allDividers.push(newD);
        }
        k++;
        offset = period * k;
      }
      allDividers.sort((a, b) => a - b);

      // Build bands, cycling colors (including nulls) from template
      const newBands = Array.from({ length: allDividers.length + 1 }, (_, i) => {
        const template = templateBands[i % N];
        return {
          id: crypto.randomUUID(),
          name: `Band ${i + 1}`,
          color: template?.color ?? null,
          gradient: template?.gradient ?? null,
          locked: false,
        };
      });

      return { ...state, dividers: allDividers, bands: newBands, selectedBandId: null };
    }

    case 'STAMP_PATTERN': {
      const { startCoord, templateDividers, templateBands } = action;
      const { dividers: curDividers, bands: curBands, dividerAxis, displayDims } = state;

      if (!templateDividers || !templateDividers.length || !displayDims) return state;

      const limit = dividerAxis === 'vertical' ? displayDims.w : displayDims.h;
      const period = templateDividers[templateDividers.length - 1];
      if (period <= 0 || startCoord < 0 || startCoord >= limit) return state;

      // New dividers: leading boundary at startCoord + each template divider shifted.
      // startCoord itself is included so the first template band has a proper left boundary.
      const newDividers = [startCoord, ...templateDividers.map(d => d + startCoord)]
        .filter(d => d > 0 && d < limit);

      if (newDividers.length === 0) return state;

      // Merge with existing, skipping near-duplicates (within 2px)
      const sortedCur = [...curDividers].sort((a, b) => a - b);
      const mergedDividers = [...sortedCur];
      for (const nd of newDividers) {
        if (!mergedDividers.some(d => Math.abs(d - nd) < 2)) {
          mergedDividers.push(nd);
        }
      }
      mergedDividers.sort((a, b) => a - b);

      // Build bands: stamp range gets template colors, rest preserves existing
      const newBands = Array.from({ length: mergedDividers.length + 1 }, (_, i) => {
        const bStart = i === 0 ? 0 : mergedDividers[i - 1];
        const bEnd = i < mergedDividers.length ? mergedDividers[i] : limit;
        const mid = (bStart + bEnd) / 2;

        if (mid >= startCoord && mid < startCoord + period) {
          const relMid = mid - startCoord;
          let tplIdx = templateBands.length - 1;
          for (let j = 0; j < templateDividers.length; j++) {
            if (relMid < templateDividers[j]) { tplIdx = j; break; }
          }
          const tpl = templateBands[tplIdx];
          return {
            id: crypto.randomUUID(),
            name: `Band ${i + 1}`,
            color: tpl?.color ?? null,
            gradient: tpl?.gradient ?? null,
            locked: false,
          };
        }

        // Preserve color from existing band covering this midpoint
        let existBandIdx = curBands.length - 1;
        for (let j = 0; j < sortedCur.length; j++) {
          if (mid < sortedCur[j]) { existBandIdx = j; break; }
        }
        const existBand = curBands[existBandIdx] ?? null;
        return {
          id: crypto.randomUUID(),
          name: `Band ${i + 1}`,
          color: existBand?.color ?? null,
          gradient: existBand?.gradient ?? null,
          locked: false,
        };
      });

      return { ...state, dividers: mergedDividers, bands: newBands, selectedBandId: null };
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
