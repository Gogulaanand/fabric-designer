import { useRef, useEffect, useCallback, useState } from 'react';
import { useZoomPan } from '../../hooks/useZoomPan.js';

const DIVIDER_SNAP_PX = 12;

export function CanvasView({
  displayImageDataRef,
  state,
  getOffscreenCanvas,
  onAddDivider,
  onPaintBandByY,
  onRemoveDivider,
  onMoveDivider,
  onSelectBand,
  onNudgeDivider,
  getNearestDivider,
  getBandAtY,
}) {
  const containerRef = useRef(null);
  const displayCanvasRef = useRef(null);
  const overlayRef = useRef(null);
  const { scale, offset, zoom, startPan, continuePan, endPan, resetView, screenToImage } = useZoomPan();

  const [hoverY, setHoverY] = useState(null);
  const [dragDivIdx, setDragDivIdx] = useState(null);
  const [selectedDivIdx, setSelectedDivIdx] = useState(null);

  const { tool, dividers, bands, displayDims, showOriginal } = state;

  // Draw the colorized / original image layer
  useEffect(() => {
    const canvas = displayCanvasRef.current;
    if (!canvas || !displayDims) return;
    canvas.width = displayDims.w;
    canvas.height = displayDims.h;
    const ctx = canvas.getContext('2d');

    if (showOriginal) {
      if (displayImageDataRef.current) ctx.putImageData(displayImageDataRef.current, 0, 0);
    } else {
      const offscreen = getOffscreenCanvas();
      if (offscreen) ctx.drawImage(offscreen, 0, 0);
      else if (displayImageDataRef.current) ctx.putImageData(displayImageDataRef.current, 0, 0);
    }
  }, [displayDims, showOriginal, bands, dividers, getOffscreenCanvas]);

  // Draw the overlay layer (dividers, labels, hover guide)
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !displayDims) return;
    canvas.width = displayDims.w;
    canvas.height = displayDims.h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, displayDims.w, displayDims.h);

    if (showOriginal) return;

    const sorted = [...dividers].sort((a, b) => a - b);

    // Hover guide line
    if (hoverY !== null && (tool === 'addDiv' || tool === 'dragDiv')) {
      ctx.save();
      ctx.strokeStyle = tool === 'addDiv' ? 'rgba(0,200,255,0.55)' : 'rgba(255,200,0,0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, hoverY);
      ctx.lineTo(displayDims.w, hoverY);
      ctx.stroke();
      // Y label
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(4, hoverY - 16, 52, 14);
      ctx.fillStyle = '#0cf';
      ctx.font = '10px monospace';
      ctx.fillText(`y = ${hoverY}`, 6, hoverY - 4);
      ctx.restore();
    }

    // Divider lines + handles
    sorted.forEach((d, i) => {
      const isSelected = i === selectedDivIdx;
      ctx.save();
      ctx.strokeStyle = isSelected ? '#ffcc00' : 'rgba(255,60,60,0.9)';
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(0, d);
      ctx.lineTo(displayDims.w, d);
      ctx.stroke();

      // Grab handle dot
      ctx.setLineDash([]);
      ctx.fillStyle = isSelected ? '#ffcc00' : 'rgba(255,80,80,0.9)';
      ctx.beginPath();
      ctx.arc(displayDims.w / 2, d, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Band labels
    const bounds = [0, ...sorted, displayDims.h];
    for (let i = 0; i < bounds.length - 1; i++) {
      const mid = (bounds[i] + bounds[i + 1]) / 2;
      const band = bands[i];
      if (!band) continue;
      const hasColor = band.color || band.gradient;
      const colorHex = band.color?.hex ?? band.gradient?.top?.hex ?? 'rgba(255,255,255,0.25)';
      const label = `${band.name}${hasColor ? '' : ' · tap to paint'}`;

      ctx.save();
      ctx.font = 'bold 11px monospace';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 5;
      ctx.fillStyle = colorHex;
      ctx.fillText(label, 8, mid + 4);
      ctx.restore();
    }
  }, [dividers, bands, displayDims, hoverY, tool, selectedDivIdx, showOriginal]);

  const getImageY = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return screenToImage(e.clientX, e.clientY, rect).y;
  }, [screenToImage]);

  const handleMouseMove = useCallback((e) => {
    if (!displayDims) return;
    const y = getImageY(e);
    if (y === null || y < 0 || y >= displayDims.h) { setHoverY(null); return; }
    setHoverY(y);

    if (dragDivIdx !== null) {
      onMoveDivider(dragDivIdx, y);
    } else if (e.buttons === 1 && (e.altKey || e.button === 1)) {
      continuePan(e.clientX, e.clientY);
    }
  }, [displayDims, getImageY, dragDivIdx, onMoveDivider, continuePan]);

  const handleMouseDown = useCallback((e) => {
    if (!displayDims) return;
    const y = getImageY(e);
    if (y === null) return;

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;

    if (tool === 'addDiv') {
      onAddDivider(y);
    } else if (tool === 'rmDiv') {
      const idx = getNearestDivider(y, Math.round(DIVIDER_SNAP_PX / scale));
      if (idx !== null) onRemoveDivider(idx);
    } else if (tool === 'dragDiv') {
      const idx = getNearestDivider(y, Math.round(DIVIDER_SNAP_PX / scale));
      if (idx !== null) { setDragDivIdx(idx); setSelectedDivIdx(idx); }
    } else if (tool === 'paint') {
      onPaintBandByY(y);
      const band = getBandAtY(y);
      if (band) onSelectBand(band.id);
    }
  }, [displayDims, getImageY, tool, scale, onAddDivider, onRemoveDivider, onPaintBandByY, onSelectBand, getBandAtY, getNearestDivider, startPan]);

  const handleMouseUp = useCallback(() => {
    setDragDivIdx(null);
    endPan();
  }, [endPan]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoom(-e.deltaY, e.clientX, e.clientY, rect);
  }, [zoom]);

  const handleKeyDown = useCallback((e) => {
    if (selectedDivIdx === null) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); onNudgeDivider(selectedDivIdx, e.shiftKey ? -10 : -1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); onNudgeDivider(selectedDivIdx, e.shiftKey ? 10 : 1); }
    if (e.key === 'Escape') setSelectedDivIdx(null);
  }, [selectedDivIdx, onNudgeDivider]);

  const cursorMap = {
    addDiv: 'crosshair',
    paint: 'cell',
    dragDiv: dragDivIdx !== null ? 'ns-resize' : 'row-resize',
    rmDiv: 'pointer',
  };

  return (
    <div
      className="relative flex-1 overflow-hidden rounded-lg border border-[#222] bg-[#050505] select-none min-h-0"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ outline: 'none' }}
    >
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <ViewBtn onClick={() => { const r = containerRef.current?.getBoundingClientRect(); r && zoom(100, r.left + r.width/2, r.top + r.height/2, r); }} title="Zoom in">+</ViewBtn>
        <ViewBtn onClick={() => { const r = containerRef.current?.getBoundingClientRect(); r && zoom(-100, r.left + r.width/2, r.top + r.height/2, r); }} title="Zoom out">−</ViewBtn>
        <ViewBtn onClick={resetView} title="Reset view">⊡</ViewBtn>
        <span className="text-[10px] text-[#444] px-1">{Math.round(scale * 100)}%</span>
      </div>

      {/* Canvas container with transform */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setHoverY(null); endPan(); setDragDivIdx(null); }}
        onWheel={handleWheel}
        style={{ cursor: cursorMap[tool] ?? 'default', overflow: 'hidden' }}
      >
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            position: 'absolute',
            willChange: 'transform',
          }}
        >
          <canvas ref={displayCanvasRef} style={{ display: 'block' }} />
          <canvas
            ref={overlayRef}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', display: 'block' }}
          />
        </div>
      </div>

      {/* Empty state */}
      {!displayDims && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-[#2a2a2a] pointer-events-none">
          <div className="text-6xl mb-4">🧵</div>
          <p className="text-base">Upload your B&amp;W textile image to begin</p>
          <p className="text-xs mt-2 text-[#1e1e1e]">Works best with high-contrast images · JPG, PNG, WebP</p>
        </div>
      )}

      {/* Selected divider info bar */}
      {selectedDivIdx !== null && dividers[selectedDivIdx] !== undefined && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-[#111] border border-[#333] rounded px-3 py-1 text-xs text-[#ffcc00] font-mono z-10 whitespace-nowrap">
          Divider {selectedDivIdx + 1} · y = {dividers[selectedDivIdx]}px · ↑↓ nudge · Shift = ×10
        </div>
      )}
    </div>
  );
}

function ViewBtn({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 bg-[#111] border border-[#333] rounded text-[#888] hover:text-white hover:border-[#555] text-sm font-bold transition-colors"
    >
      {children}
    </button>
  );
}
