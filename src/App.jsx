import { useState, useCallback, useRef } from 'react';
import { useBandEngine } from './hooks/useBandEngine.js';
import { useColorizer } from './hooks/useColorizer.js';
import { useImageLoader } from './hooks/useImageLoader.js';
import { Toolbar } from './components/Toolbar/Toolbar.jsx';
import { CanvasView } from './components/Canvas/CanvasView.jsx';
import { BandSidebar } from './components/BandSidebar/BandSidebar.jsx';
import { ColorControls } from './components/ColorControls/ColorControls.jsx';
import { ExportDialog } from './components/ExportDialog/ExportDialog.jsx';
import { serializeProject, deserializeProject, downloadJSON, openJSONFile } from './utils/projectFile.js';
import { makeColor } from './utils/colorUtils.js';

const PANEL_TABS = ['Bands', 'Colors', 'Export'];

export default function App() {
  const engine = useBandEngine();
  const { state, originalImageDataRef, displayImageDataRef, loadImage } = engine;
  const { getOffscreenCanvas, buildFullResExport } = useColorizer(displayImageDataRef, state);

  const [activeTab, setActiveTab] = useState('Bands');
  const [gradientMode, setGradientMode] = useState(false);
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const { handleInputChange, handleDrop, handleDragOver, loading } = useImageLoader(loadImage);

  const hasImage = !!state.displayDims;

  // Export helpers
  const getExportCanvas = useCallback(() => {
    const imgData = buildFullResExport(originalImageDataRef, state.originalDims);
    if (!imgData || !state.originalDims) return null;
    const c = document.createElement('canvas');
    c.width = state.originalDims.w;
    c.height = state.originalDims.h;
    c.getContext('2d').putImageData(imgData, 0, 0);
    return c;
  }, [buildFullResExport, originalImageDataRef, state.originalDims]);

  const handleExportPng = useCallback(() => {
    const c = getExportCanvas();
    if (!c) return;
    const a = document.createElement('a');
    a.download = 'textile-colored.png';
    a.href = c.toDataURL('image/png');
    a.click();
  }, [getExportCanvas]);

  const handleExportJpg = useCallback((quality) => {
    const c = getExportCanvas();
    if (!c) return;
    const a = document.createElement('a');
    a.download = 'textile-colored.jpg';
    a.href = c.toDataURL('image/jpeg', quality);
    a.click();
  }, [getExportCanvas]);

  const handleCopyToClipboard = useCallback(async () => {
    const c = getExportCanvas();
    if (!c) return false;
    try {
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('Copied to clipboard!', 'success');
      return true;
    } catch {
      showToast('Copy failed — try PNG download instead', 'error');
      return false;
    }
  }, [getExportCanvas, showToast]);

  // Project save / load
  const handleSaveProject = useCallback(() => {
    if (!hasImage) return;
    const json = serializeProject(engine.getSerializableState());
    downloadJSON('textile-project.json', json);
    showToast('Project saved!', 'success');
  }, [engine, hasImage, showToast]);

  const handleLoadProject = useCallback(async () => {
    try {
      const text = await openJSONFile();
      const data = deserializeProject(text);
      engine.loadProject(data);
      showToast('Project loaded!', 'success');
    } catch (err) {
      showToast(`Failed to load: ${err.message}`, 'error');
    }
  }, [engine, showToast]);

  // Eyedropper (Chromium-only)
  const handleEyedropper = useCallback(async () => {
    if (typeof EyeDropper === 'undefined') {
      showToast('Eyedropper not supported in this browser', 'error');
      return;
    }
    try {
      const dropper = new EyeDropper();
      const result = await dropper.open();
      engine.setActiveColor(makeColor(result.sRGBHex, 'Picked'));
    } catch { /* user cancelled */ }
  }, [engine, showToast]);

  const handleSetGradient = useCallback((gradient) => {
    const bandId = state.selectedBandId;
    if (!bandId) { showToast('Select a band first', 'info'); return; }
    engine.setGradient(bandId, gradient);
  }, [state.selectedBandId, engine, showToast]);

  return (
    <div
      className="flex flex-col h-screen overflow-hidden bg-[#0a0a0a] text-[#eee]"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl">🧵</span>
          <div>
            <h1 className="text-sm font-bold tracking-tight leading-tight">Textile Band Colorizer</h1>
            <p className="text-[10px] text-[#444] leading-tight">Horizontal band coloring · white fills only · black stays black</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasImage && (
            <div className="flex gap-3 text-xs text-[#555] border border-[#1a1a1a] rounded px-3 py-1.5">
              <span><span className="text-white font-semibold">{state.bands.length}</span> bands</span>
              <span className="text-[#333]">·</span>
              <span><span className="text-white font-semibold">{state.bands.filter(b => b.color || b.gradient).length}</span> painted</span>
              <span className="text-[#333]">·</span>
              <span className="text-[#444]">{state.originalDims?.w}×{state.originalDims?.h}</span>
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg border border-[#333] text-sm text-[#ccc] hover:border-[#555] hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? '⏳ Loading…' : '📂 Upload Image'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
      </header>

      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-[#1a1a1a] flex-shrink-0">
        <Toolbar
          tool={state.tool}
          setTool={engine.setTool}
          hasImage={hasImage}
          onReset={engine.reset}
          onAutoDetect={engine.autoDetect}
          onToggleOriginal={engine.toggleOriginal}
          showOriginal={state.showOriginal}
          onSaveProject={handleSaveProject}
          onLoadProject={handleLoadProject}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 p-3 min-w-0 flex flex-col">
          <CanvasView
            displayImageDataRef={displayImageDataRef}
            state={state}
            getOffscreenCanvas={getOffscreenCanvas}
            onAddDivider={engine.addDivider}
            onPaintBandByY={engine.paintBandByY}
            onRemoveDivider={engine.removeDivider}
            onMoveDivider={engine.moveDivider}
            onSelectBand={engine.selectBand}
            onNudgeDivider={engine.nudgeDivider}
            getNearestDivider={engine.getNearestDivider}
            getBandAtY={engine.getBandAtY}
          />
        </div>

        {/* Right panel */}
        <div className="w-60 flex-shrink-0 flex flex-col border-l border-[#1a1a1a] overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[#1a1a1a] flex-shrink-0">
            {PANEL_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: activeTab === tab ? '#fff' : '#555',
                  borderBottom: activeTab === tab ? '2px solid #2471a3' : '2px solid transparent',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === tab ? '2px solid #2471a3' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'color 0.15s',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            {activeTab === 'Bands' && (
              <BandSidebar
                bands={state.bands}
                dividers={state.dividers}
                selectedBandId={state.selectedBandId}
                onSelect={engine.selectBand}
                onRename={engine.renameBand}
                onToggleLock={engine.toggleLock}
                onClear={engine.clearBand}
                onCopy={engine.copyColor}
                onPaste={engine.pasteColor}
                copiedColor={state.copiedColor}
              />
            )}
            {activeTab === 'Colors' && (
              <ColorControls
                activeColor={state.activeColor}
                swatches={state.swatches}
                onColorChange={engine.setActiveColor}
                onAddSwatch={engine.addSwatch}
                onRemoveSwatch={engine.removeSwatch}
                onEyedropper={handleEyedropper}
                selectedBand={state.bands.find(b => b.id === state.selectedBandId)}
                onSetGradient={handleSetGradient}
                gradientMode={gradientMode}
                onGradientModeChange={setGradientMode}
              />
            )}
            {activeTab === 'Export' && (
              <ExportDialog
                onExportPng={handleExportPng}
                onExportJpg={handleExportJpg}
                onCopyToClipboard={handleCopyToClipboard}
                hasImage={hasImage}
              />
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium z-50"
          style={{
            background: toast.type === 'success' ? '#1e4d32' : toast.type === 'error' ? '#4d1e1e' : '#1a1a2e',
            border: `1px solid ${toast.type === 'success' ? '#2a7a50' : toast.type === 'error' ? '#7a2a2a' : '#2a2a4e'}`,
            color: '#fff',
            whiteSpace: 'nowrap',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
