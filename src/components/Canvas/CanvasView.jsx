import { useRef, useEffect, useCallback, useState } from 'react';
import { Plus, Minus, Maximize } from 'lucide-react';
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
  onHoverBand,
  highlightBandId,
  onRepeatSelectClick,
  onStampPattern,
  onCancelRepeatPlace,
  repeatHighlightRange,
  repeatPeriod,
}) {
  const containerRef = useRef(null);
  const displayCanvasRef = useRef(null);
  const overlayRef = useRef(null);
  const { scale, offset, zoom, startPan, continuePan, endPan, resetView, fitView, screenToImage } = useZoomPan();

  const [hoverCoord, setHoverCoord] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragAnchorRef = useRef(null);
  const [selectedDivIdx, setSelectedDivIdx] = useState(null);
  const spacebarRef = useRef(false);
  const lastHoveredBandIdRef = useRef(null);

  const { tool, dividers, bands, displayDims, showOriginal, dividerAxis } = state;
  const isVertical = dividerAxis === 'vertical';

  useEffect(() => {
    setSelectedDivIdx(null);
  }, [dividerAxis]);

  // Draw colorized / original image layer
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayDims, showOriginal, bands, dividers, dividerAxis, getOffscreenCanvas]);

  // Draw overlay layer (dividers, labels, hover guide, band highlight)
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !displayDims) return;
    canvas.width = displayDims.w;
    canvas.height = displayDims.h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, displayDims.w, displayDims.h);

    if (showOriginal) return;

    const sorted = [...dividers].sort((a, b) => a - b);

    // Band highlight (from sidebar hover)
    if (highlightBandId) {
      const bandIdx = bands.findIndex(b => b.id === highlightBandId);
      if (bandIdx >= 0) {
        const limit = isVertical ? displayDims.w : displayDims.h;
        const start = bandIdx === 0 ? 0 : sorted[bandIdx - 1];
        const end = bandIdx < sorted.length ? sorted[bandIdx] : limit;
        ctx.save();
        ctx.fillStyle = 'rgba(59, 130, 246, 0.18)';
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        if (isVertical) {
          ctx.fillRect(start, 0, end - start, displayDims.h);
          ctx.strokeRect(start + 1, 1, end - start - 2, displayDims.h - 2);
        } else {
          ctx.fillRect(0, start, displayDims.w, end - start);
          ctx.strokeRect(1, start + 1, displayDims.w - 2, end - start - 2);
        }
        ctx.restore();
      }
    }

    // Repeat pattern range highlight (green) — shown during repeatSelect and repeatPlace
    if (repeatHighlightRange) {
      const { startBandIdx, endBandIdx } = repeatHighlightRange;
      const limit = isVertical ? displayDims.w : displayDims.h;
      const rangeStart = startBandIdx === 0 ? 0 : sorted[startBandIdx - 1];
      const rangeEnd = endBandIdx < sorted.length ? sorted[endBandIdx] : limit;
      ctx.save();
      ctx.fillStyle = 'rgba(5, 150, 105, 0.18)';
      ctx.strokeStyle = 'rgba(5, 150, 105, 0.75)';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      if (isVertical) {
        ctx.fillRect(rangeStart, 0, rangeEnd - rangeStart, displayDims.h);
        ctx.strokeRect(rangeStart + 1, 1, rangeEnd - rangeStart - 2, displayDims.h - 2);
      } else {
        ctx.fillRect(0, rangeStart, displayDims.w, rangeEnd - rangeStart);
        ctx.strokeRect(1, rangeStart + 1, displayDims.w - 2, rangeEnd - rangeStart - 2);
      }
      ctx.restore();
    }

    // Hover guide line (addDiv, dragDiv, repeatSelect)
    if (hoverCoord !== null && (tool === 'addDiv' || tool === 'dragDiv' || tool === 'repeatSelect')) {
      ctx.save();
      ctx.strokeStyle = tool === 'addDiv' ? 'rgba(0,200,255,0.55)' :
        tool === 'repeatSelect' ? 'rgba(5,150,105,0.7)' : 'rgba(255,200,0,0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (isVertical) {
        ctx.moveTo(hoverCoord, 0); ctx.lineTo(hoverCoord, displayDims.h);
      } else {
        ctx.moveTo(0, hoverCoord); ctx.lineTo(displayDims.w, hoverCoord);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      const labelText = isVertical ? `x = ${hoverCoord}` : `y = ${hoverCoord}`;
      if (isVertical) {
        ctx.fillRect(hoverCoord + 4, 4, 72, 18);
        ctx.fillStyle = tool === 'repeatSelect' ? '#0c9' : '#0cf';
        ctx.font = '14px monospace';
        ctx.fillText(labelText, hoverCoord + 6, 19);
      } else {
        ctx.fillRect(4, hoverCoord - 20, 72, 18);
        ctx.fillStyle = tool === 'repeatSelect' ? '#0c9' : '#0cf';
        ctx.font = '14px monospace';
        ctx.fillText(labelText, 6, hoverCoord - 5);
      }
      ctx.restore();
    }

    // Stamp footprint preview (repeatPlace)
    if (hoverCoord !== null && tool === 'repeatPlace' && repeatPeriod) {
      const footStart = hoverCoord;
      const footEnd = hoverCoord + repeatPeriod;
      ctx.save();
      ctx.fillStyle = 'rgba(5, 150, 105, 0.18)';
      ctx.strokeStyle = 'rgba(5, 150, 105, 0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      if (isVertical) {
        ctx.fillRect(footStart, 0, footEnd - footStart, displayDims.h);
        ctx.strokeRect(footStart, 0, footEnd - footStart, displayDims.h);
      } else {
        ctx.fillRect(0, footStart, displayDims.w, footEnd - footStart);
        ctx.strokeRect(0, footStart, displayDims.w, footEnd - footStart);
      }
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
      if (isVertical) {
        ctx.moveTo(d, 0); ctx.lineTo(d, displayDims.h);
      } else {
        ctx.moveTo(0, d); ctx.lineTo(displayDims.w, d);
      }
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = isSelected ? '#ffcc00' : 'rgba(255,80,80,0.9)';
      ctx.beginPath();
      if (isVertical) {
        ctx.arc(d, displayDims.h / 2, 5, 0, Math.PI * 2);
      } else {
        ctx.arc(displayDims.w / 2, d, 5, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    });

    // Band labels
    const limit = isVertical ? displayDims.w : displayDims.h;
    const bounds = [0, ...sorted, limit];
    for (let i = 0; i < bounds.length - 1; i++) {
      const mid = (bounds[i] + bounds[i + 1]) / 2;
      const band = bands[i];
      if (!band) continue;
      const hasColor = band.color || band.gradient;
      const colorHex = band.color?.hex ?? band.gradient?.top?.hex ?? 'rgba(255,255,255,0.25)';
      const label = `${band.name}${hasColor ? '' : ' · tap to paint'}`;

      ctx.save();
      ctx.font = 'bold 14px monospace';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 5;
      ctx.fillStyle = colorHex;
      if (isVertical) {
        ctx.fillText(label, mid - 20, 22);
      } else {
        ctx.fillText(label, 8, mid + 5);
      }
      ctx.restore();
    }
  }, [dividers, bands, displayDims, hoverCoord, tool, selectedDivIdx, showOriginal, isVertical, highlightBandId, repeatHighlightRange, repeatPeriod]);

  const getImageCoord = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const pt = screenToImage(e.clientX, e.clientY, rect);
    return isVertical ? pt.x : pt.y;
  }, [screenToImage, isVertical]);

  const handleMouseMove = useCallback((e) => {
    if (!displayDims) return;
    const coord = getImageCoord(e);
    const limit = isVertical ? displayDims.w : displayDims.h;
    if (coord === null || coord < 0 || coord >= limit) { setHoverCoord(null); return; }
    setHoverCoord(Math.round(coord));

    if (isDragging && dragAnchorRef.current !== null) {
      const currentIdx = getNearestDivider(dragAnchorRef.current, 9999);
      if (currentIdx !== null) {
        onMoveDivider(currentIdx, Math.round(coord));
        dragAnchorRef.current = Math.round(coord);
      }
    } else if ((e.buttons === 4) || (e.buttons === 1 && (e.altKey || spacebarRef.current))) {
      continuePan(e.clientX, e.clientY);
    }

    // Track hovered band (only fire when crossing band boundaries to avoid thrashing App state)
    if (onHoverBand && !isDragging) {
      const band = getBandAtY(Math.round(coord));
      const bandId = band?.id ?? null;
      if (bandId !== lastHoveredBandIdRef.current) {
        lastHoveredBandIdRef.current = bandId;
        onHoverBand(bandId);
      }
    }
  }, [displayDims, getImageCoord, isDragging, getNearestDivider, onMoveDivider, continuePan, isVertical, onHoverBand, getBandAtY]);

  const handleMouseDown = useCallback((e) => {
    if (!displayDims) return;
    const coord = getImageCoord(e);
    if (coord === null) return;
    const roundedCoord = Math.round(coord);

    if (e.button === 1 || (e.button === 0 && (e.altKey || spacebarRef.current))) {
      e.preventDefault();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;

    if (tool === 'addDiv') {
      onAddDivider(roundedCoord);
    } else if (tool === 'rmDiv') {
      const idx = getNearestDivider(roundedCoord, Math.round(DIVIDER_SNAP_PX / scale));
      if (idx !== null) onRemoveDivider(idx);
    } else if (tool === 'dragDiv') {
      const idx = getNearestDivider(roundedCoord, Math.round(DIVIDER_SNAP_PX / scale));
      if (idx !== null) {
        dragAnchorRef.current = dividers[idx];
        setIsDragging(true);
        setSelectedDivIdx(idx);
      }
    } else if (tool === 'paint') {
      onPaintBandByY(roundedCoord);
      const band = getBandAtY(roundedCoord);
      if (band) onSelectBand(band.id);
    } else if (tool === 'repeatSelect') {
      onRepeatSelectClick?.(roundedCoord);
    } else if (tool === 'repeatPlace') {
      onStampPattern?.(roundedCoord);
    }
  }, [displayDims, getImageCoord, tool, scale, dividers, onAddDivider, onRemoveDivider, onPaintBandByY, onSelectBand, getBandAtY, getNearestDivider, startPan, onRepeatSelectClick, onStampPattern]);

  const handleMouseUp = useCallback(() => {
    const lastAnchor = dragAnchorRef.current;
    setIsDragging(false);
    dragAnchorRef.current = null;
    // Re-resolve selected divider index by anchor position — survives sort reordering
    if (lastAnchor !== null) {
      setSelectedDivIdx(getNearestDivider(lastAnchor, Infinity));
    }
    endPan();
  }, [endPan, getNearestDivider]);

  const handleMouseLeave = useCallback(() => {
    setHoverCoord(null);
    endPan();
    setIsDragging(false);
    dragAnchorRef.current = null;
    lastHoveredBandIdRef.current = null;
    onHoverBand?.(null);
  }, [endPan, onHoverBand]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoom(-e.deltaY, e.clientX, e.clientY, rect);
  }, [zoom]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === ' ') { e.preventDefault(); spacebarRef.current = true; return; }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        const r = containerRef.current?.getBoundingClientRect();
        if (r) zoom(100, r.left + r.width / 2, r.top + r.height / 2, r);
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        const r = containerRef.current?.getBoundingClientRect();
        if (r) zoom(-100, r.left + r.width / 2, r.top + r.height / 2, r);
        return;
      }
    }

    if (e.key === 'Escape') {
      if (tool === 'repeatPlace' || tool === 'repeatSelect') onCancelRepeatPlace?.();
      setSelectedDivIdx(null);
      return;
    }

    if (selectedDivIdx === null) return;
    if (isVertical) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); onNudgeDivider(selectedDivIdx, e.shiftKey ? -10 : -1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onNudgeDivider(selectedDivIdx, e.shiftKey ? 10 : 1); }
    } else {
      if (e.key === 'ArrowUp') { e.preventDefault(); onNudgeDivider(selectedDivIdx, e.shiftKey ? -10 : -1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); onNudgeDivider(selectedDivIdx, e.shiftKey ? 10 : 1); }
    }
  }, [selectedDivIdx, onNudgeDivider, isVertical, zoom, tool, onCancelRepeatPlace]);

  const handleKeyUp = useCallback((e) => {
    if (e.key === ' ') spacebarRef.current = false;
  }, []);

  const handleFitView = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && displayDims) fitView(rect, displayDims);
  }, [fitView, displayDims]);

  const cursorMap = {
    addDiv: 'crosshair',
    paint: 'cell',
    dragDiv: isDragging
      ? (isVertical ? 'ew-resize' : 'ns-resize')
      : (isVertical ? 'col-resize' : 'row-resize'),
    rmDiv: 'pointer',
    repeatSelect: 'crosshair',
    repeatPlace: 'copy',
  };

  const dividerLabel = selectedDivIdx !== null && dividers[selectedDivIdx] !== undefined
    ? `Divider ${selectedDivIdx + 1} · ${isVertical ? 'x' : 'y'} = ${dividers[selectedDivIdx]}px · ${isVertical ? '←→' : '↑↓'} nudge · Shift = ×10`
    : null;

  return (
    <div
      className="relative flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-200 select-none min-h-0"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      style={{
        outline: 'none',
        backgroundImage: 'radial-gradient(circle, rgba(100,116,139,0.22) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
        boxShadow: 'inset 0 1px 4px rgba(15,23,42,0.06)',
      }}
    >
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <ViewBtn onClick={() => { const r = containerRef.current?.getBoundingClientRect(); if (r) zoom(100, r.left + r.width/2, r.top + r.height/2, r); }} title="Zoom in (Ctrl+=)"><Plus size={14} /></ViewBtn>
        <ViewBtn onClick={() => { const r = containerRef.current?.getBoundingClientRect(); if (r) zoom(-100, r.left + r.width/2, r.top + r.height/2, r); }} title="Zoom out (Ctrl+-)"><Minus size={14} /></ViewBtn>
        <ViewBtn onClick={handleFitView} title="Fit to window"><Maximize size={14} /></ViewBtn>
        <ViewBtn onClick={resetView} title="Reset to 100%">1:1</ViewBtn>
        <span className="text-sm text-slate-400 px-1 font-mono">{Math.round(scale * 100)}%</span>
      </div>

      {/* Ruler strip — screen-space, outside the transform so numbers stay readable at any zoom */}
      {displayDims && !showOriginal && dividers.length > 0 && (
        <RulerStrip
          dividers={dividers}
          bands={bands}
          displayDims={displayDims}
          scale={scale}
          offset={offset}
          isVertical={isVertical}
        />
      )}

      {/* Canvas container with zoom/pan transform */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
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
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 pointer-events-none">
          <div className="text-6xl mb-4">🧵</div>
          <p className="text-base font-medium text-slate-500">Upload your B&amp;W textile image to begin</p>
          <p className="text-sm mt-2 text-slate-400">Works best with high-contrast images · JPG, PNG, WebP</p>
        </div>
      )}

      {/* Selected divider info bar */}
      {dividerLabel && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-white border border-amber-300 rounded-lg px-3 py-1 text-sm text-amber-700 font-mono z-10 whitespace-nowrap shadow-sm">
          {dividerLabel}
        </div>
      )}
    </div>
  );
}

// Ruler rendered in screen space (outside the zoom transform) so numbers stay sharp at any zoom level.
// For horizontal axis: left-side vertical strip showing Y-position band numbers.
// For vertical axis: top horizontal strip showing X-position band numbers.
function RulerStrip({ dividers, bands, displayDims, scale, offset, isVertical }) {
  const sorted = [...dividers].sort((a, b) => a - b);
  const limit = isVertical ? displayDims.w : displayDims.h;
  const bounds = [0, ...sorted, limit];
  const RULER_SIZE = 28;

  // Convert image coordinate to screen coordinate within the container
  const toScreen = (imageCoord) =>
    imageCoord * scale + (isVertical ? offset.x : offset.y);

  if (isVertical) {
    return (
      <div
        className="absolute top-0 left-0 right-0 z-[5] pointer-events-none overflow-hidden"
        style={{ height: RULER_SIZE, background: 'rgba(255,255,255,0.9)', borderBottom: '1px solid #e2e8f0' }}
      >
        {sorted.map((d, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px"
            style={{ left: toScreen(d), background: '#f87171' }}
          />
        ))}
        {bounds.slice(0, -1).map((start, i) => {
          const end = bounds[i + 1];
          const screenMid = toScreen((start + end) / 2);
          const screenBandSize = (end - start) * scale;
          if (screenBandSize < 20) return null;
          const band = bands[i];
          const isPainted = !!(band?.color || band?.gradient);
          const color = band?.color?.hex ?? band?.gradient?.top?.hex ?? '#94a3b8';
          return (
            <div
              key={i}
              className="absolute top-0 flex items-center justify-center"
              style={{ left: screenMid - 14, width: 28, height: RULER_SIZE }}
            >
              <span className="text-sm font-bold leading-none select-none"
                style={{ color: isPainted ? color : '#94a3b8' }}>
                {i + 1}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="absolute top-0 left-0 bottom-0 z-[5] pointer-events-none overflow-hidden"
      style={{ width: RULER_SIZE, background: 'rgba(255,255,255,0.9)', borderRight: '1px solid #e2e8f0' }}
    >
      {sorted.map((d, i) => (
        <div
          key={i}
          className="absolute left-0 right-0 h-px"
          style={{ top: toScreen(d), background: '#f87171' }}
        />
      ))}
      {bounds.slice(0, -1).map((start, i) => {
        const end = bounds[i + 1];
        const screenMid = toScreen((start + end) / 2);
        const screenBandSize = (end - start) * scale;
        if (screenBandSize < 20) return null;
        const band = bands[i];
        const isPainted = !!(band?.color || band?.gradient);
        const color = band?.color?.hex ?? band?.gradient?.top?.hex ?? '#94a3b8';
        return (
          <div
            key={i}
            className="absolute left-0 flex items-center justify-center"
            style={{ top: screenMid - 11, height: 22, width: RULER_SIZE }}
          >
            <span className="text-sm font-bold leading-none select-none"
              style={{ color: isPainted ? color : '#94a3b8' }}>
              {i + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ViewBtn({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="min-w-7 h-7 px-1 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 hover:border-slate-400 text-xs font-bold transition-colors shadow-sm flex items-center justify-center"
    >
      {children}
    </button>
  );
}
