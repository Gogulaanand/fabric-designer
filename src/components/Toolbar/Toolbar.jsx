
const TOOLS = [
  { id: 'addDiv', label: 'Add Line',   icon: '╋', color: '#2563eb', hint: 'Click image to add a divider line' },
  { id: 'paint',  label: 'Paint',      icon: '🎨', color: '#7c3aed', hint: 'Click a band to fill white pixels with active color' },
  { id: 'dragDiv',label: 'Drag Line',  icon: '⇔',  color: '#d97706', hint: 'Drag a divider line to reposition it' },
  { id: 'rmDiv',  label: 'Remove Line',icon: '✂',  color: '#dc2626', hint: 'Click near a divider line to remove it' },
];

export function Toolbar({
  tool, setTool, hasImage,
  onReset, onAutoDetect, onToggleOriginal, showOriginal,
  onSaveProject, onLoadProject,
  dividerAxis, onSetDividerAxis,
}) {
  const hint = TOOLS.find(t => t.id === tool)?.hint ?? '';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Direction toggle */}
        <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden mr-1">
          <AxisBtn
            active={dividerAxis === 'horizontal'}
            disabled={!hasImage}
            onClick={() => onSetDividerAxis('horizontal')}
            title="Horizontal bands (rows)"
          >
            ═ Horizontal
          </AxisBtn>
          <div className="w-px h-6 bg-slate-200" />
          <AxisBtn
            active={dividerAxis === 'vertical'}
            disabled={!hasImage}
            onClick={() => onSetDividerAxis('vertical')}
            title="Vertical bands (columns)"
          >
            ║ Vertical
          </AxisBtn>
        </div>

        <div className="w-px h-6 bg-slate-200 mx-0.5" />

        {/* Tool buttons */}
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

        <div className="w-px h-6 bg-slate-200 mx-0.5" />

        <ToolBtn disabled={!hasImage} color={showOriginal ? '#0ea5e9' : '#64748b'} onClick={onToggleOriginal} active={showOriginal}>
          <span>👁</span>
          <span>{showOriginal ? 'Colorized' : 'Original'}</span>
        </ToolBtn>

        <ToolBtn disabled={!hasImage} color="#64748b" onClick={onAutoDetect}>
          <span>✨</span>
          <span>Auto Detect</span>
        </ToolBtn>

        <ToolBtn disabled={!hasImage} color="#64748b" onClick={onReset}>
          <span>↺</span>
          <span>Reset</span>
        </ToolBtn>

        <div className="w-px h-6 bg-slate-200 mx-0.5" />

        <ToolBtn disabled={!hasImage} color="#64748b" onClick={onSaveProject}>
          <span>💾</span>
          <span>Save</span>
        </ToolBtn>

        <ToolBtn color="#64748b" onClick={onLoadProject}>
          <span>📂</span>
          <span>Load</span>
        </ToolBtn>
      </div>

      {/* Hint */}
      {hasImage && hint && (
        <p className="text-xs text-slate-400 min-h-4 pl-1">{hint}</p>
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
        background: active ? color : 'transparent',
        color: disabled ? '#cbd5e1' : active ? '#fff' : '#475569',
        outline: active ? `2px solid ${color}` : '2px solid transparent',
        outlineOffset: '1px',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-100 hover:bg-slate-100 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function AxisBtn({ children, active, disabled, onClick, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: active ? '#eff6ff' : 'transparent',
        color: active ? '#1d4ed8' : '#64748b',
        fontWeight: active ? 600 : 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      className="px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
    >
      {children}
    </button>
  );
}
