import { useRef, useEffect, useCallback } from 'react';
import { buildColorizedSync } from '../utils/imageUtils.js';

export function useColorizer(displayImageDataRef, state) {
  const offscreenRef = useRef(null);
  const dirtyRef = useRef(true);

  // Mark dirty whenever bands or dividers change
  useEffect(() => {
    dirtyRef.current = true;
  }, [state.bands, state.dividers, state.displayDims]);

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
        state.bands
      );
      canvas.getContext('2d').putImageData(imgData, 0, 0);
      dirtyRef.current = false;
    }

    return canvas;
  }, [displayImageDataRef, state.bands, state.dividers, state.displayDims]);

  const buildFullResExport = useCallback((originalImageDataRef, originalDims) => {
    if (!originalImageDataRef.current || !originalDims) return null;

    const scale = state.displayScale || 1;
    const sortedDisplayDivs = [...state.dividers].sort((a, b) => a - b);

    // Scale dividers to original resolution
    const sortedOrigDivs = sortedDisplayDivs.map(d => Math.round(d / scale));

    return buildColorizedSync(
      originalImageDataRef.current,
      originalDims,
      sortedOrigDivs,
      state.bands
    );
  }, [state.dividers, state.bands, state.displayScale]);

  return { getOffscreenCanvas, buildFullResExport };
}
