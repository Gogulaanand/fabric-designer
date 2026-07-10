import { useState, useCallback, useRef, useEffect } from 'react';
import { useBandEngine } from './hooks/useBandEngine.js';
import { useColorizer } from './hooks/useColorizer.js';
import { useImageLoader } from './hooks/useImageLoader.js';
import { Toolbar } from './components/Toolbar/Toolbar.jsx';
import { CanvasView } from './components/Canvas/CanvasView.jsx';
import { BandSidebar } from './components/BandSidebar/BandSidebar.jsx';
import { ColorControls } from './components/ColorControls/ColorControls.jsx';
import { ExportDialog } from './components/ExportDialog/ExportDialog.jsx';
import { deserializeProject, serializeProject, downloadJSON, openJSONFile } from './utils/projectFile.js';
import { loadImageFromDataURL } from './utils/imageUtils.js';
import { makeColor } from './utils/colorUtils.js';
import { saveSession, loadSession, clearSession } from './utils/sessionStorage.js';

const PANEL_TABS = ['Bands', 'Colors', 'Export'];
const AUTO_SAVE_DELAY_MS = 2000;

export default function App() {
  const engine = useBandEngine();
  const { state, originalImageDataRef, displayImageDataRef, imageDataURLRef, loadImage } = engine;
  const [replaceAllNonBlack, setReplaceAllNonBlack] = useState(true);
  const [repeatFirstBandIdx, setRepeatFirstBandIdx] = useState(null);
  const [repeatTemplate, setRepeatTemplate] = useState(null);
  const [restoreBanner, setRestoreBanner] = useState(null); // { data, json } or null

  const { getOffscreenCanvas, buildFullResExport } = useColorizer(displayImageDataRef, state, replaceAllNonBlack);

  const [activeTab, setActiveTab] = useState('Bands');
  const [gradientMode, setGradientMode] = useState(false);
  const [toast, setToast] = useState(null);
  const [hoveredBandId, setHoveredBandId] = useState(null);
  const toastTimerRef = useRef(null);

  // Global undo/redo keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      // Skip if user is typing in an input/textarea
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        engine.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        engine.redo();
      }
      // Also support Ctrl+Y for redo (Windows convention)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        engine.redo();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [engine]);

  // --- Auto-save: debounce writes to IndexedDB 2s after last state change ---
  const autoSaveTimerRef = useRef(null);
  // Track whether app initialization / session restore is in progress to avoid
  // overwriting the saved session with an empty initial state.
  const initializedRef = useRef(false);

  useEffect(() => {
    // Do not auto-save until the user has either restored a session, declined,
    // or the initial check found nothing to restore. This prevents the empty
    // initial state from overwriting a valid saved session on first render.
    if (!initializedRef.current) return;
    // Only auto-save when an image is loaded (otherwise there is nothing useful to persist)
    if (!state.displayDims) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const engineState = engine.getSerializableState();
      const json = serializeProject(engineState, {
        imageDataURL: imageDataURLRef.current,
        replaceAllNonBlack,
      });
      saveSession(json).catch(() => {
        // Silently ignore save errors (quota, private browsing, etc.)
      });
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [state, replaceAllNonBlack, engine, imageDataURLRef]);

  // --- On mount: check for a saved session and show restore banner ---
  useEffect(() => {
    let cancelled = false;
    loadSession()
      .then((json) => {
        if (cancelled) return;
        if (!json) {
          // No saved session - mark as initialized so auto-save can begin
          initializedRef.current = true;
          return;
        }
        try {
          const data = deserializeProject(json);
          // Only offer restore if the saved session has meaningful content
          // (an embedded image or at least some dividers/painted bands)
          const hasMeaningfulContent = data.imageDataURL ||
            data.dividers.length > 0 ||
            data.bands.some(b => b.color || b.gradient);
          if (hasMeaningfulContent) {
            setRestoreBanner({ data, json });
          } else {
            initializedRef.current = true;
          }
        } catch {
          // Corrupt saved session - clear it and proceed
          clearSession().catch(() => {});
          initializedRef.current = true;
        }
      })
      .catch(() => {
        // IndexedDB unavailable - proceed without restore
        initializedRef.current = true;
      });
    return () => { cancelled = true; };
  }, []);

  // --- Restore / decline handlers ---
  const handleRestoreSession = useCallback(async () => {
    if (!restoreBanner) return;
    const { data } = restoreBanner;
    try {
      // Load the embedded image if present
      if (data.imageDataURL) {
        const imgResult = await loadImageFromDataURL(data.imageDataURL);
        loadImage(imgResult);
      }
      // Restore replaceAllNonBlack
      if (typeof data.replaceAllNonBlack === 'boolean') {
        setReplaceAllNonBlack(data.replaceAllNonBlack);
      }
      // Restore project state
      engine.loadProject(data);
      showToast('Session restored!', 'success');
    } catch {
      showToast('Failed to restore session', 'error');
      clearSession().catch(() => {});
    }
    setRestoreBanner(null);
    initializedRef.current = true;
  }, [restoreBanner, engine, loadImage, showToast]);

  const handleDeclineRestore = useCallback(() => {
    setRestoreBanner(null);
    clearSession().catch(() => {});
    initializedRef.current = true;
  }, []);

  const showToast = useCallback((msg, type = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const { handleInputChange, handleDrop, handleDragOver, loading, fileInputRef } = useImageLoader(
    loadImage,
    (msg) => showToast(msg, 'error'),
  );

  const hasImage = !!state.displayDims;

  const handleSetDividerAxis = useCallback((axis) => {
    if (axis === state.dividerAxis) return;
    engine.setTool('paint');
    setRepeatFirstBandIdx(null);
    setRepeatTemplate(null);
    engine.setDividerAxis(axis);
    showToast(`Switched to ${axis} bands — dividers cleared`, 'info');
  }, [engine, state.dividerAxis, showToast]);

  const handleReset = useCallback(() => {
    engine.setTool('paint');
    setRepeatFirstBandIdx(null);
    setRepeatTemplate(null);
    engine.reset();
  }, [engine]);

  const handleRepeatPattern = useCallback(() => {
    if (state.tool === 'repeatSelect' || state.tool === 'repeatPlace') {
      engine.setTool('paint');
      setRepeatFirstBandIdx(null);
      setRepeatTemplate(null);
      return;
    }
    if (state.dividers.length === 0) return;
    engine.setTool('repeatSelect');
    showToast('Click the first band of the pattern', 'info');
  }, [engine, state.tool, state.dividers.length, showToast]);

  const handleRepeatSelectClick = useCallback((coord) => {
    if (!state.displayDims) return;
    const sorted = [...state.dividers].sort((a, b) => a - b);
    const limit = state.dividerAxis === 'vertical' ? state.displayDims.w : state.displayDims.h;

    let bandIdx = state.bands.length - 1;
    for (let i = 0; i < sorted.length; i++) {
      if (coord < sorted[i]) { bandIdx = i; break; }
    }

    if (repeatFirstBandIdx === null) {
      setRepeatFirstBandIdx(bandIdx);
      showToast('Click the last band of the pattern · Esc to cancel', 'info');
    } else {
      const lo = Math.min(repeatFirstBandIdx, bandIdx);
      const hi = Math.max(repeatFirstBandIdx, bandIdx);
      const patternStart = lo === 0 ? 0 : sorted[lo - 1];
      const patternEnd = hi < sorted.length ? sorted[hi] : limit;
      const period = patternEnd - patternStart;
      if (period <= 0) return;

      const templateDividers = sorted
        .filter(d => d > patternStart && d < patternEnd)
        .map(d => d - patternStart);
      const templateBands = state.bands.slice(lo, hi + 1);

      setRepeatTemplate({ period, templateDividers, templateBands, patternStartBandIdx: lo, patternEndBandIdx: hi });
      setRepeatFirstBandIdx(null);
      engine.setTool('repeatPlace');
      showToast('Click to stamp · multiple placements allowed · Esc to cancel', 'info');
    }
  }, [engine, state.dividers, state.bands, state.dividerAxis, state.displayDims, repeatFirstBandIdx, showToast]);

  const handleStampPattern = useCallback((coord) => {
    if (!repeatTemplate) return;
    engine.stampPattern(coord, repeatTemplate.period, repeatTemplate.templateDividers, repeatTemplate.templateBands);
  }, [engine, repeatTemplate]);

  const handleCancelRepeatPlace = useCallback(() => {
    engine.setTool('paint');
    setRepeatFirstBandIdx(null);
    setRepeatTemplate(null);
  }, [engine]);

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

  // Project save
  const handleSaveProject = useCallback(() => {
    const engineState = engine.getSerializableState();
    const json = serializeProject(engineState, {
      imageDataURL: imageDataURLRef.current,
      replaceAllNonBlack,
    });
    downloadJSON('textile-project.json', json);
    showToast('Project saved!', 'success');
  }, [engine, imageDataURLRef, replaceAllNonBlack, showToast]);

  // Project load (supports v1 files requiring pre-loaded image and v2 files with embedded image)
  const handleLoadProject = useCallback(async () => {
    try {
      const text = await openJSONFile();
      const data = deserializeProject(text);

      // If the project file has an embedded image (v2), auto-load it
      if (data.imageDataURL) {
        try {
          const imgResult = await loadImageFromDataURL(data.imageDataURL);
          loadImage(imgResult);
        } catch (imgErr) {
          showToast(`Failed to load embedded image: ${imgErr.message}`, 'error');
          return;
        }
      } else if (!hasImage) {
        // v1 file with no embedded image and no image loaded
        showToast('Load an image first, then load the project file', 'info');
        return;
      }

      // Restore replaceAllNonBlack from the project if available
      if (typeof data.replaceAllNonBlack === 'boolean') {
        setReplaceAllNonBlack(data.replaceAllNonBlack);
      }

      engine.loadProject(data);
      showToast('Project loaded!', 'success');
    } catch (err) {
      showToast(`Failed to load: ${err.message}`, 'error');
    }
  }, [engine, showToast, hasImage, loadImage]);

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

  const repeatHighlightRange =
    state.tool === 'repeatSelect' && repeatFirstBandIdx !== null
      ? { startBandIdx: repeatFirstBandIdx, endBandIdx: repeatFirstBandIdx }
      : state.tool === 'repeatPlace' && repeatTemplate
      ? { startBandIdx: repeatTemplate.patternStartBandIdx, endBandIdx: repeatTemplate.patternEndBandIdx }
      : null;

  const repeatPeriod = state.tool === 'repeatPlace' ? (repeatTemplate?.period ?? null) : null;

  const axisLabel = state.dividerAxis === 'vertical' ? 'Vertical band coloring' : 'Horizontal band coloring';

  return (
    <div
      className="flex flex-col h-screen overflow-hidden bg-slate-50 text-slate-900"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Restore session banner */}
      {restoreBanner && (
        <div
          className="flex items-center justify-between px-5 py-2.5 text-sm font-medium flex-shrink-0"
          style={{
            background: '#eff6ff',
            borderBottom: '1px solid #93c5fd',
            color: '#1d4ed8',
          }}
        >
          <span>A previous editing session was found. Would you like to restore it?</span>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={handleRestoreSession}
              className="px-3 py-1 rounded-md text-sm font-medium text-white cursor-pointer"
              style={{ background: '#3b82f6' }}
            >
              Restore
            </button>
            <button
              onClick={handleDeclineRestore}
              className="px-3 py-1 rounded-md text-sm font-medium cursor-pointer"
              style={{ background: '#e2e8f0', color: '#475569' }}
            >
              Start Fresh
            </button>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow">
            🧵
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900 leading-tight">Textile Band Colorizer</h1>
            <p className="text-sm text-slate-400 leading-tight">{axisLabel} · {replaceAllNonBlack ? 'all non-black replaced' : 'white fills only'} · black stays black</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasImage && (
            <div className="flex gap-3 text-sm text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 bg-white shadow-sm">
              <span><span className="text-slate-900 font-semibold">{state.bands.length}</span> bands</span>
              <span className="text-slate-300">·</span>
              <span><span className="text-slate-900 font-semibold">{state.bands.filter(b => b.color || b.gradient).length}</span> painted</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-400 font-mono">{state.originalDims?.w}×{state.originalDims?.h}</span>
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg border border-slate-200 bg-white text-base text-slate-700 font-medium hover:border-blue-400 hover:text-blue-700 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
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
      <div className="px-5 py-2.5 border-b border-slate-200 bg-white flex-shrink-0">
        <Toolbar
          tool={state.tool}
          setTool={engine.setTool}
          hasImage={hasImage}
          onReset={handleReset}
          onAutoDetect={engine.autoDetect}
          onToggleOriginal={engine.toggleOriginal}
          showOriginal={state.showOriginal}
          onDownloadPng={handleExportPng}
          onLoadProject={handleLoadProject}
          onSaveProject={handleSaveProject}
          dividerAxis={state.dividerAxis}
          onSetDividerAxis={handleSetDividerAxis}
          onRepeatPattern={handleRepeatPattern}
          canRepeat={state.dividers.length > 0 && state.bands.some(b => b.color || b.gradient)}
          repeatFirstSelected={repeatFirstBandIdx !== null}
          replaceAllNonBlack={replaceAllNonBlack}
          onToggleReplaceAllNonBlack={setReplaceAllNonBlack}
          onUndo={engine.undo}
          onRedo={engine.redo}
          canUndo={engine.canUndo}
          canRedo={engine.canRedo}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Canvas area */}
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
            onHoverBand={setHoveredBandId}
            highlightBandId={hoveredBandId}
            onRepeatSelectClick={handleRepeatSelectClick}
            onStampPattern={handleStampPattern}
            onCancelRepeatPlace={handleCancelRepeatPlace}
            repeatHighlightRange={repeatHighlightRange}
            repeatPeriod={repeatPeriod}
          />
        </div>

        {/* Right panel */}
        <div className="w-72 flex-shrink-0 flex flex-col border-l border-slate-200 bg-white overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 flex-shrink-0">
            {PANEL_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 py-2.5 text-base font-medium transition-colors"
                style={{
                  color: activeTab === tab ? '#1d4ed8' : '#94a3b8',
                  borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                  background: 'transparent',
                  cursor: 'pointer',
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
                dividerAxis={state.dividerAxis}
                onSelect={engine.selectBand}
                onRename={engine.renameBand}
                onToggleLock={engine.toggleLock}
                onClear={engine.clearBand}
                onCopy={engine.copyColor}
                onPaste={engine.pasteColor}
                copiedColor={state.copiedColor}
                hoveredBandId={hoveredBandId}
                onHoverBand={setHoveredBandId}
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
                dividerAxis={state.dividerAxis}
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
          className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium z-50 shadow-lg"
          style={{
            background: toast.type === 'success' ? '#f0fdf4' : toast.type === 'error' ? '#fef2f2' : '#eff6ff',
            border: `1px solid ${toast.type === 'success' ? '#86efac' : toast.type === 'error' ? '#fca5a5' : '#93c5fd'}`,
            color: toast.type === 'success' ? '#15803d' : toast.type === 'error' ? '#b91c1c' : '#1d4ed8',
            whiteSpace: 'nowrap',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
