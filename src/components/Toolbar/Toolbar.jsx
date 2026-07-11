import {
  Plus, Paintbrush, Move, Scissors,
  Undo2, Redo2, Eye, EyeOff, Sparkles, RotateCcw, Repeat,
  Download, FolderOpen, Save, Rows3, Columns3,
} from 'lucide-react';

const TOOLS = [
  { id: 'addDiv', label: 'Add Line',    Icon: Plus,       hint: 'Click image to add a divider line' },
  { id: 'paint',  label: 'Paint',       Icon: Paintbrush, hint: 'Click a band to fill with active color' },
  { id: 'dragDiv',label: 'Drag Line',   Icon: Move,       hint: 'Drag a divider line to reposition it' },
  { id: 'rmDiv',  label: 'Remove Line', Icon: Scissors,   hint: 'Click near a divider line to remove it' },
];

function getRepeatHint(tool, repeatFirstSelected) {
  if (tool === 'repeatSelect') {
    return repeatFirstSelected
      ? 'Click the last band of the pattern · Esc to cancel'
      : 'Click the first band of the pattern · Esc to cancel';
  }
  if (tool === 'repeatPlace') return 'Click to stamp · multiple placements allowed · Esc to cancel';
  return null;
}

export function Toolbar({
  tool, setTool, hasImage,
  onReset, onAutoDetect, onToggleOriginal, showOriginal,
  onDownloadPng, onLoadProject, onSaveProject,
  dividerAxis, onSetDividerAxis,
  onRepeatPattern, canRepeat,
  repeatFirstSelected,
  replaceAllNonBlack, onToggleReplaceAllNonBlack,
  onUndo, onRedo, canUndo, canRedo,
}) {
  const hint = getRepeatHint(tool, repeatFirstSelected) ?? TOOLS.find(t => t.id === tool)?.hint ?? '';
  const isRepeatMode = tool === 'repeatSelect' || tool === 'repeatPlace';
  const repeatLabel = tool === 'repeatSelect' ? 'Select Pattern' : tool === 'repeatPlace' ? 'Cancel Stamp' : 'Repeat Pattern';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {/* Direction toggle */}
        <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden mr-1">
          <AxisBtn
            active={dividerAxis === 'horizontal'}
            disabled={!hasImage}
            onClick={() => onSetDividerAxis('horizontal')}
            title="Horizontal bands (rows)"
          >
            <Rows3 size={14} />
            Horizontal
          </AxisBtn>
          <div className="w-px h-6 bg-slate-200" />
          <AxisBtn
            active={dividerAxis === 'vertical'}
            disabled={!hasImage}
            onClick={() => onSetDividerAxis('vertical')}
            title="Vertical bands (columns)"
          >
            <Columns3 size={14} />
            Vertical
          </AxisBtn>
        </div>

        <Sep />

        {/* Undo / Redo */}
        <ToolBtn disabled={!canUndo} onClick={onUndo} title="Undo (Ctrl+Z)">
          <Undo2 size={15} />
          <span>Undo</span>
        </ToolBtn>
        <ToolBtn disabled={!canRedo} onClick={onRedo} title="Redo (Ctrl+Shift+Z)">
          <Redo2 size={15} />
          <span>Redo</span>
        </ToolBtn>

        <Sep />

        {/* Tool buttons */}
        {TOOLS.map(t => (
          <ToolBtn
            key={t.id}
            active={tool === t.id}
            disabled={!hasImage}
            onClick={() => setTool(t.id)}
          >
            <t.Icon size={15} />
            <span>{t.label}</span>
          </ToolBtn>
        ))}

        <Sep />

        <ToolBtn disabled={!hasImage} onClick={onToggleOriginal} active={showOriginal}>
          {showOriginal ? <EyeOff size={15} /> : <Eye size={15} />}
          <span>{showOriginal ? 'Colorized' : 'Original'}</span>
        </ToolBtn>

        <ToolBtn disabled={!hasImage} onClick={onAutoDetect}>
          <Sparkles size={15} />
          <span>Auto Detect</span>
        </ToolBtn>

        <ToolBtn disabled={!hasImage} onClick={onReset}>
          <RotateCcw size={15} />
          <span>Reset</span>
        </ToolBtn>

        <Sep />

        {/* Repeat Pattern — two-click select then stamp */}
        <ToolBtn
          disabled={!hasImage || (!canRepeat && !isRepeatMode)}
          onClick={onRepeatPattern}
          active={isRepeatMode}
          title={isRepeatMode ? 'Click again or press Esc to cancel' : 'Select a band range, then stamp copies at any position'}
        >
          <Repeat size={15} />
          <span>{repeatLabel}</span>
        </ToolBtn>

        {/* File operations — pushed to the right edge */}
        <div className="flex items-center gap-1 ml-auto pl-2">
          <ToolBtn disabled={!hasImage} onClick={onDownloadPng} title="Download the colored image as PNG (more formats in the Export tab)">
            <Download size={15} />
            <span>Download Image</span>
          </ToolBtn>

          <ToolBtn onClick={onLoadProject}>
            <FolderOpen size={15} />
            <span>Load</span>
          </ToolBtn>

          <ToolBtn disabled={!hasImage} onClick={onSaveProject} title="Save project as JSON (includes image)">
            <Save size={15} />
            <span>Save</span>
          </ToolBtn>
        </div>
      </div>

      {/* Paint mode toggle */}
      {hasImage && (
        <div className="flex items-center gap-4 pl-1">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={replaceAllNonBlack}
              onChange={(e) => onToggleReplaceAllNonBlack(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-blue-600"
            />
            Replace all non-black colors
          </label>
          {hint && <span className="text-sm text-slate-400">{hint}</span>}
        </div>
      )}
    </div>
  );
}

function Sep() {
  return <div className="w-px h-6 bg-slate-200 mx-1" />;
}

function ToolBtn({ children, active, disabled, onClick, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: active ? '#2563eb' : 'transparent',
        color: disabled ? '#cbd5e1' : active ? '#fff' : '#475569',
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
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors disabled:opacity-40"
    >
      {children}
    </button>
  );
}
