import { useCallback } from 'react';

const TOOLS = [
  { id: 'addDiv', label: '+ Band Line', icon: '➕', color: '#c0392b', hint: 'Click image to add a horizontal divider' },
  { id: 'paint',  label: 'Paint Band', icon: '🎨', color: '#2471a3', hint: 'Click a band to fill white pixels with active color' },
  { id: 'dragDiv',label: 'Drag Line',  icon: '↕',  color: '#7d6608', hint: 'Drag a red line to reposition it' },
  { id: 'rmDiv',  label: 'Remove Line',icon: '✂️', color: '#6c3483', hint: 'Click near a red line to remove it' },
];

export function Toolbar({ tool, setTool, hasImage, onReset, onAutoDetect, onToggleOriginal, showOriginal, onSaveProject, onLoadProject }) {
  const hint = TOOLS.find(t => t.id === tool)?.hint ?? '';

  return (
    <div className="flex flex-col gap-2">
      {/* Tool buttons */}
      <div className="flex gap-2 flex-wrap items-center justify-center">
        {TOOLS.map(t => (
          <ToolBtn
            key={t.id}
            active={tool === t.id}
            disabled={!hasImage}
            color={t.color}
            onClick={() => setTool(t.id)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </ToolBtn>
        ))}

        <div className="w-px h-6 bg-[#333] mx-1" />

        <ToolBtn disabled={!hasImage} color="#1e5e38" onClick={onToggleOriginal} active={showOriginal}>
          <span>👁</span>
          <span>{showOriginal ? 'Colorized' : 'Original'}</span>
        </ToolBtn>

        <ToolBtn disabled={!hasImage} color="#444" onClick={onAutoDetect}>
          <span>✨</span>
          <span>Auto Detect</span>
        </ToolBtn>

        <ToolBtn disabled={!hasImage} color="#333" onClick={onReset}>
          <span>🔄</span>
          <span>Reset</span>
        </ToolBtn>

        <div className="w-px h-6 bg-[#333] mx-1" />

        <ToolBtn disabled={!hasImage} color="#2c3e50" onClick={onSaveProject}>
          <span>💾</span>
          <span>Save</span>
        </ToolBtn>

        <ToolBtn color="#2c3e50" onClick={onLoadProject}>
          <span>📂</span>
          <span>Load</span>
        </ToolBtn>
      </div>

      {/* Hint */}
      {hasImage && (
        <p className="text-center text-xs text-[#555] min-h-4">{hint}</p>
      )}
    </div>
  );
}

function ToolBtn({ children, active, disabled, color, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? color : '#1a1a1a',
        outline: active ? `2px solid ${color}` : '2px solid transparent',
        color: disabled ? '#444' : active ? '#fff' : '#999',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-none text-sm font-semibold transition-all duration-150 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
