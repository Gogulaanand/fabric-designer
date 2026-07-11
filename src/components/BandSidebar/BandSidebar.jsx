import { useState } from 'react';
import { Copy, ClipboardPaste, X, Lock, LockOpen } from 'lucide-react';

export function BandSidebar({
  bands, dividers, selectedBandId, dividerAxis,
  onSelect, onRename, onToggleLock, onClear, onCopy, onPaste, copiedColor,
  hoveredBandId, onHoverBand,
}) {
  const sorted = [...dividers].sort((a, b) => a - b);
  const axisLabel = dividerAxis === 'vertical' ? 'x' : 'y';

  const getBandRange = (idx) => {
    const start = idx === 0 ? 0 : sorted[idx - 1];
    const end = idx < sorted.length ? sorted[idx] : '—';
    return `${axisLabel}:${start}–${end}px`;
  };

  return (
    <aside className="flex flex-col gap-1">
      <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider px-1 mb-2 flex items-center justify-between">
        <span>Bands</span>
        <span className="font-normal text-slate-400">{bands.length}</span>
      </div>
      {bands.map((band, idx) => (
        <BandRow
          key={band.id}
          band={band}
          range={getBandRange(idx)}
          index={idx}
          selected={band.id === selectedBandId}
          hovered={band.id === hoveredBandId && band.id !== selectedBandId}
          onSelect={() => onSelect(band.id)}
          onRename={(name) => onRename(band.id, name)}
          onToggleLock={() => onToggleLock(band.id)}
          onClear={() => onClear(band.id)}
          onCopy={() => onCopy(band.id)}
          onPaste={() => onPaste(band.id)}
          canPaste={!!copiedColor}
          onMouseEnter={() => onHoverBand?.(band.id)}
          onMouseLeave={() => onHoverBand?.(null)}
        />
      ))}
    </aside>
  );
}

function BandRow({ band, range, index, selected, hovered, onSelect, onRename, onToggleLock, onClear, onCopy, onPaste, canPaste, onMouseEnter, onMouseLeave }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(band.name);

  const commitRename = () => {
    onRename(draftName.trim() || `Band ${index + 1}`);
    setEditing(false);
  };

  const colorDisplay = band.gradient
    ? `linear-gradient(to right, ${band.gradient.top?.hex ?? '#e2e8f0'}, ${band.gradient.bottom?.hex ?? '#94a3b8'})`
    : band.color?.hex ?? null;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="rounded-lg border cursor-pointer transition-all duration-100 overflow-hidden"
      style={{
        borderColor: selected ? '#3b82f6' : hovered ? '#93c5fd' : '#e2e8f0',
        background: selected ? '#eff6ff' : hovered ? '#f0f7ff' : '#fff',
        boxShadow: selected ? '0 0 0 1px #93c5fd' : hovered ? '0 0 0 1px #bfdbfe' : '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        {/* Color swatch */}
        <div
          className="w-5 h-5 rounded flex-shrink-0 border border-slate-200"
          style={{
            background: colorDisplay ?? 'repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 2px,#e2e8f0 2px,#e2e8f0 4px)',
          }}
        />

        {/* Name + range */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
              onClick={e => e.stopPropagation()}
              className="w-full bg-white text-slate-900 text-sm px-1 rounded outline-none border border-blue-400"
            />
          ) : (
            <span
              className="text-sm font-medium truncate block"
              style={{ color: band.locked ? '#94a3b8' : '#1e293b' }}
              onDoubleClick={e => { e.stopPropagation(); setEditing(true); setDraftName(band.name); }}
              title="Double-click to rename"
            >
              {band.name}
            </span>
          )}
          <span className="text-sm text-slate-400 block font-mono">{range}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <IconBtn title="Copy color" onClick={onCopy} disabled={!band.color && !band.gradient}><Copy size={13} /></IconBtn>
          <IconBtn title="Paste color" onClick={onPaste} disabled={!canPaste}><ClipboardPaste size={13} /></IconBtn>
          <IconBtn title="Clear color" onClick={onClear} disabled={!band.color && !band.gradient}><X size={13} /></IconBtn>
          <IconBtn
            title={band.locked ? 'Unlock band' : 'Lock band'}
            onClick={onToggleLock}
            active={band.locked}
          >
            {band.locked ? <Lock size={13} /> : <LockOpen size={13} />}
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, disabled, active, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-6 h-6 text-sm flex items-center justify-center rounded transition-colors"
      style={{
        color: disabled ? '#cbd5e1' : active ? '#2563eb' : '#94a3b8',
        background: active ? '#dbeafe' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: 'none',
      }}
    >
      {children}
    </button>
  );
}
