import { useState, useCallback, useRef } from 'react';

export function useZoomPan() {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const offsetAtPanStartRef = useRef({ x: 0, y: 0 });

  const zoom = useCallback((delta, clientX, clientY, containerRect) => {
    setScale(prev => {
      const newScale = Math.max(0.1, Math.min(20, prev * (delta > 0 ? 1.1 : 0.9)));
      // Zoom toward cursor
      const ratio = newScale / prev;
      setOffset(off => ({
        x: clientX - containerRect.left - (clientX - containerRect.left - off.x) * ratio,
        y: clientY - containerRect.top - (clientY - containerRect.top - off.y) * ratio,
      }));
      return newScale;
    });
  }, []);

  const startPan = useCallback((clientX, clientY) => {
    isPanningRef.current = true;
    panStartRef.current = { x: clientX, y: clientY };
    offsetAtPanStartRef.current = { ...offset };
  }, [offset]);

  const continuePan = useCallback((clientX, clientY) => {
    if (!isPanningRef.current) return;
    setOffset({
      x: offsetAtPanStartRef.current.x + (clientX - panStartRef.current.x),
      y: offsetAtPanStartRef.current.y + (clientY - panStartRef.current.y),
    });
  }, []);

  const endPan = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const fitView = useCallback((containerRect, imageDims) => {
    const sx = containerRect.width / imageDims.w;
    const sy = containerRect.height / imageDims.h;
    const newScale = Math.min(sx, sy) * 0.92;
    setScale(newScale);
    setOffset({
      x: (containerRect.width - imageDims.w * newScale) / 2,
      y: (containerRect.height - imageDims.h * newScale) / 2,
    });
  }, []);

  // Convert screen coords to image coords
  const screenToImage = useCallback((clientX, clientY, containerRect) => {
    return {
      x: Math.round((clientX - containerRect.left - offset.x) / scale),
      y: Math.round((clientY - containerRect.top - offset.y) / scale),
    };
  }, [scale, offset]);

  return {
    scale,
    offset,
    isPanning: isPanningRef,
    zoom,
    startPan,
    continuePan,
    endPan,
    resetView,
    fitView,
    screenToImage,
  };
}
