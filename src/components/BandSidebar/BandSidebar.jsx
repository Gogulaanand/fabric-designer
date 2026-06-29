import { useState } from 'react';

export function BandSidebar({
  bands, dividers, selectedBandId,
  onSelect, onRename, onToggleLock, onClear, onCopy, onPaste, copiedColor,
}) {
  const sorted = [...dividers].sort((a, b) => a - b);

  const getBandRange = (idx) => {
    const yStart = idx === 0 ? 0 : sorted[idx - 1];
    const yEnd = idx < sorted.length ? sorted[idx] : '—';
    return `${yStart}–${yEnd}px`;
  };

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col gap-1 overflow-y-auto max-h-[calc(100vh-180px)]">
      <div className="text-xs text-[#555] font-semibold uppercase tracking-wider px-1 mb-1">
        Bands ({bands.length})
      </div>
      {bands.map((band, idx) => (
        <BandRow
          key={band.id}
          band={band}
          range={getBandRange(idx)}
          index={idx}
          selected={band.id === selectedBandId}
          onSelect={() => onSelect(band.id)}
          onRename={(name) => onRename(band.id, name)}
          onToggleLock={() => onToggleLock(band.id)}
          onClear={() => onClear(band.id)}
          onCopy={() => onCopy(band.id)}
          onPaste={() => onPaste(band.id)}
          canPaste={!!copiedColor}
        />
      ))}
    </aside>
  );
}

function BandRow({ band, range, index, selected, onSelect, onRename, onToggleLock, onClear, onCopy, onPaste, canPaste }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(band.name);

  const commitRename = () => {
    onRename(draftName.trim() || `Band ${index + 1}`);
    setEditing(false);
  };

  const colorDisplay = band.gradient
    ? `linear-gradient(to bottom, ${band.gradient.top?.hex ?? '#333'}, ${band.gradient.bottom?.hex ?? '#111'})`
    : band.color?.hex ?? 'transparent';

  const isSolid = !band.gradient;

  return (
    <div
      onClick={onSelect}
      className="rounded-lg border cursor-pointer transition-all duration-100 overflow-hidden"
      style={{
        borderColor: selected ? '#00ccff' : '#222',
        background: selected ? '#0d2233' : '#111',
        boxShadow: selected ? '0 0 0 1px #00ccff44' : 'none',
      }}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        {/* Color swatch */}
        <div
          className="w-5 h-5 rounded flex-shrink-0 border border-[#333]"
          style={{
            background: colorDisplay,
            backgroundImage: band.gradient ? colorDisplay : undefined,
          }}
        />

        {/* Name */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
              onClick={e => e.stopPropagation()}
              className="w-full bg-[#0a0a0a] text-white text-xs px-1 rounded outline-none border border-[#00ccff]"
            />
          ) : (
            <span
              className="text-xs font-medium truncate block"
              style={{ color: band.locked ? '#555' : '#ddd' }}
              onDoubleClick={e => { e.stopPropagation(); setEditing(true); setDraftName(band.name); }}
              title="Double-click to rename"
            >
              {band.name}
            </span>
          )}
          <span className="text-[10px] text-[#444] block">{range}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <IconBtn title="Copy color" onClick={onCopy} disabled={!band.color && !band.gradient}>⎘</IconBtn>
          <IconBtn title="Paste color" onClick={onPaste} disabled={!canPaste}>⎗</IconBtn>
          <IconBtn title="Clear color" onClick={onClear} disabled={!band.color && !band.gradient}>✕</IconBtn>
          <IconBtn
            title={band.locked ? 'Unlock band' : 'Lock band'}
            onClick={onToggleLock}
            active={band.locked}
          >
            {band.locked ? '🔒' : '🔓'}
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
      className="w-5 h-5 text-[10px] flex items-center justify-center rounded transition-colors"
      style={{
        color: disabled ? '#333' : active ? '#00ccff' : '#666',
        background: active ? '#0d1f2d' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: 'none',
      }}
    >
      {children}
    </button>
  );
}
