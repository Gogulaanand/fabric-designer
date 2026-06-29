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
      <div className="text-xs text-[#555] font-semibold uppercase tracking-wider">Export</div>

      <button
        onClick={onExportPng}
        disabled={!hasImage}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#333] text-sm text-[#ccc] hover:border-[#555] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full"
      >
        <span>⬇</span>
        <span>Download PNG</span>
        <span className="ml-auto text-xs text-[#444]">Full res</span>
      </button>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#555]">JPG Quality</span>
          <input
            type="range" min={10} max={100} value={Math.round(jpgQuality * 100)}
            onChange={e => setJpgQuality(e.target.value / 100)}
            className="flex-1 h-1.5 rounded accent-[#2471a3]"
          />
          <span className="text-xs text-[#555] w-8 text-right">{Math.round(jpgQuality * 100)}%</span>
        </div>
        <button
          onClick={() => onExportJpg(jpgQuality)}
          disabled={!hasImage}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#333] text-sm text-[#ccc] hover:border-[#555] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full"
        >
          <span>⬇</span>
          <span>Download JPG</span>
        </button>
      </div>

      <button
        onClick={handleCopy}
        disabled={!hasImage || copying}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#333] text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full"
        style={{ color: copied ? '#00cc88' : '#ccc', borderColor: copied ? '#00cc8844' : '#333' }}
      >
        <span>{copied ? '✓' : '⎘'}</span>
        <span>{copied ? 'Copied!' : copying ? 'Copying…' : 'Copy to Clipboard'}</span>
      </button>
    </div>
  );
}
