import { useRef, useCallback } from 'react';
import { buildColorizedSync } from '../utils/imageUtils.js';

export function useColorizer(displayImageDataRef, state) {
  const offscreenRef = useRef(null);
  const dirtyRef = useRef(true);
  const prevBandsRef = useRef(state.bands);
  const prevDividersRef = useRef(state.dividers);
  const prevDimsRef = useRef(state.displayDims);
  const prevAxisRef = useRef(state.dividerAxis);

  // Mark dirty synchronously during render (not in an effect) so it's set before any
  // child effects fire — avoids child-before-parent passive-effect race with CanvasView.
  if (
    prevBandsRef.current !== state.bands ||
    prevDividersRef.current !== state.dividers ||
    prevDimsRef.current !== state.displayDims ||
    prevAxisRef.current !== state.dividerAxis
  ) {
    dirtyRef.current = true;
    prevBandsRef.current = state.bands;
    prevDividersRef.current = state.dividers;
    prevDimsRef.current = state.displayDims;
    prevAxisRef.current = state.dividerAxis;
  }

  const getOffscreenCanvas = useCallback(() => {
    if (!displayImageDataRef.current || !state.displayDims) return null;

    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
    }
    const canvas = offscreenRef.current;
    const { w, h } = state.displayDims;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      dirtyRef.current = true;
    }

    if (dirtyRef.current) {
      const sortedDivs = [...state.dividers].sort((a, b) => a - b);
      const imgData = buildColorizedSync(
        displayImageDataRef.current,
        state.displayDims,
        sortedDivs,
        state.bands,
        state.dividerAxis,
      );
      canvas.getContext('2d').putImageData(imgData, 0, 0);
      dirtyRef.current = false;
    }

    return canvas;
  }, [displayImageDataRef, state.bands, state.dividers, state.displayDims, state.dividerAxis]);

  const buildFullResExport = useCallback((originalImageDataRef, originalDims) => {
    if (!originalImageDataRef.current || !originalDims) return null;

    const scale = state.displayScale || 1;
    const sortedDisplayDivs = [...state.dividers].sort((a, b) => a - b);

    // Scale dividers to original resolution (scale is uniform width-based, works for both axes)
    const sortedOrigDivs = sortedDisplayDivs.map(d => Math.round(d / scale));

    return buildColorizedSync(
      originalImageDataRef.current,
      originalDims,
      sortedOrigDivs,
      state.bands,
      state.dividerAxis,
    );
  }, [state.dividers, state.bands, state.displayScale, state.dividerAxis]);

  return { getOffscreenCanvas, buildFullResExport };
}
