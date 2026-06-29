import { useState } from 'react';

export function ExportDialog({ onExportPng, onExportJpg, onCopyToClipboard, hasImage }) {
  const [jpgQuality, setJpgQuality] = useState(0.92);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    setCopying(true);
    const ok = await onCopyToClipboard();
    setCopying(false);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Export</div>

      <button
        onClick={onExportPng}
        disabled={!hasImage}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full bg-white shadow-sm"
      >
        <span className="text-slate-400">↓</span>
        <span className="font-medium">Download PNG</span>
        <span className="ml-auto text-xs text-slate-400">Full res</span>
      </button>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">JPG Quality</span>
          <input
            type="range" min={10} max={100} value={Math.round(jpgQuality * 100)}
            onChange={e => setJpgQuality(e.target.value / 100)}
            className="flex-1 h-1.5 rounded accent-blue-500"
          />
          <span className="text-xs text-slate-500 w-8 text-right font-mono">{Math.round(jpgQuality * 100)}%</span>
        </div>
        <button
          onClick={() => onExportJpg(jpgQuality)}
          disabled={!hasImage}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full bg-white shadow-sm"
        >
          <span className="text-slate-400">↓</span>
          <span className="font-medium">Download JPG</span>
        </button>
      </div>

      <button
        onClick={handleCopy}
        disabled={!hasImage || copying}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full shadow-sm"
        style={{
          color: copied ? '#16a34a' : '#374151',
          borderColor: copied ? '#86efac' : '#e2e8f0',
          background: copied ? '#f0fdf4' : '#fff',
        }}
      >
        <span>{copied ? '✓' : '⎘'}</span>
        <span className="font-medium">{copied ? 'Copied!' : copying ? 'Copying…' : 'Copy to Clipboard'}</span>
      </button>
    </div>
  );
}
