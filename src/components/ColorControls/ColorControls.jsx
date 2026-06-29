import { useState, useCallback } from 'react';
import { hexToRgb, rgbToHex, hslToRgb, rgbToHsl, makeColor } from '../../utils/colorUtils.js';

export function ColorControls({ activeColor, swatches, onColorChange, onAddSwatch, onRemoveSwatch, onEyedropper, selectedBand, onSetGradient, gradientMode, onGradientModeChange }) {
  const [hex, setHex] = useState(activeColor.hex);
  const [gradTop, setGradTop] = useState(activeColor.hex);
  const [gradBottom, setGradBottom] = useState('#000000');

  const applyHex = useCallback((h) => {
    const clean = h.startsWith('#') ? h : '#' + h;
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
      onColorChange(makeColor(clean, 'Custom'));
    }
  }, [onColorChange]);

  const [hsl, setHsl] = useState(() => {
    const [r, g, b] = hexToRgb(activeColor.hex);
    return rgbToHsl(r, g, b);
  });

  const applyHsl = useCallback((h, s, l) => {
    const [r, g, b] = hslToRgb(h, s, l);
    const newHex = rgbToHex(r, g, b);
    setHex(newHex);
    onColorChange(makeColor(newHex, 'Custom'));
  }, [onColorChange]);

  const applyGradient = useCallback(() => {
    onSetGradient({
      top: makeColor(gradTop, 'Gradient Top'),
      bottom: makeColor(gradBottom, 'Gradient Bottom'),
    });
  }, [gradTop, gradBottom, onSetGradient]);

  return (
    <div className="flex flex-col gap-3">
      {/* Mode toggle */}
      <div className="flex gap-1">
        <ModeBtn active={!gradientMode} onClick={() => onGradientModeChange(false)}>Solid</ModeBtn>
        <ModeBtn active={gradientMode} onClick={() => onGradientModeChange(true)}>Gradient</ModeBtn>
      </div>

      {!gradientMode ? (
        <>
          {/* Color preview + hex input */}
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded-lg border border-[#333] flex-shrink-0"
              style={{ background: activeColor.hex }}
            />
            <div className="flex-1">
              <input
                type="text"
                value={hex}
                onChange={e => setHex(e.target.value)}
                onBlur={e => applyHex(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyHex(hex)}
                className="w-full bg-[#0a0a0a] border border-[#333] text-white text-xs px-2 py-1.5 rounded font-mono outline-none focus:border-[#555]"
                placeholder="#RRGGBB"
              />
            </div>
            <input
              type="color"
              value={activeColor.hex}
              onChange={e => {
                setHex(e.target.value);
                onColorChange(makeColor(e.target.value, 'Custom'));
              }}
              className="w-8 h-8 rounded cursor-pointer border border-[#333] bg-transparent p-0.5"
              title="Native color picker"
            />
          </div>

          {/* HSL sliders */}
          <div className="flex flex-col gap-1.5">
            {[['H', 0, 360, hsl[0]], ['S', 1, 100, hsl[1]], ['L', 2, 100, hsl[2]]].map(([label, idx, max, val]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[10px] text-[#555] w-3">{label}</span>
                <input
                  type="range" min={0} max={max} value={val}
                  onChange={e => {
                    const newHsl = [...hsl];
                    newHsl[idx] = Number(e.target.value);
                    setHsl(newHsl);
                    applyHsl(...newHsl);
                  }}
                  className="flex-1 h-1.5 rounded accent-[#00ccff]"
                  style={idx === 0 ? {
                    background: 'linear-gradient(to right, #f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'
                  } : undefined}
                />
                <span className="text-[10px] text-[#555] w-7 text-right">{val}</span>
              </div>
            ))}
          </div>

          {/* Eyedropper */}
          {typeof EyeDropper !== 'undefined' && (
            <button
              onClick={onEyedropper}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-[#333] text-xs text-[#888] hover:text-white hover:border-[#555] transition-colors w-full"
            >
              💧 Eyedropper
            </button>
          )}

          {/* Add to swatches */}
          <button
            onClick={() => onAddSwatch(activeColor)}
            className="text-xs text-[#555] hover:text-[#888] transition-colors text-left"
          >
            + Save as swatch
          </button>
        </>
      ) : (
        /* Gradient controls */
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#555] w-10">Top</span>
            <input type="color" value={gradTop} onChange={e => setGradTop(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-[#333] bg-transparent p-0.5" />
            <input type="text" value={gradTop} onChange={e => setGradTop(e.target.value)}
              className="flex-1 bg-[#0a0a0a] border border-[#333] text-white text-xs px-2 py-1 rounded font-mono outline-none focus:border-[#555]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#555] w-10">Bottom</span>
            <input type="color" value={gradBottom} onChange={e => setGradBottom(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-[#333] bg-transparent p-0.5" />
            <input type="text" value={gradBottom} onChange={e => setGradBottom(e.target.value)}
              className="flex-1 bg-[#0a0a0a] border border-[#333] text-white text-xs px-2 py-1 rounded font-mono outline-none focus:border-[#555]" />
          </div>
          <div
            className="h-16 rounded-lg border border-[#333]"
            style={{ background: `linear-gradient(to bottom, ${gradTop}, ${gradBottom})` }}
          />
          <button
            onClick={applyGradient}
            disabled={!selectedBand}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2471a3] text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply Gradient to Band
          </button>
        </div>
      )}

      {/* Swatches */}
      <div>
        <div className="text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Swatches</div>
        <div className="flex flex-wrap gap-1.5">
          {swatches.map((swatch, i) => (
            <div
              key={i}
              title={swatch.name || swatch.hex}
              className="relative group"
            >
              <button
                onClick={() => {
                  setHex(swatch.hex);
                  onColorChange(swatch);
                }}
                className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                style={{
                  background: swatch.hex,
                  borderColor: activeColor.hex === swatch.hex ? '#00ccff' : '#333',
                  boxShadow: activeColor.hex === swatch.hex ? '0 0 8px #00ccff88' : 'none',
                }}
              />
              <button
                onClick={() => onRemoveSwatch(i)}
                className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#c0392b] text-white text-[8px] rounded-full hidden group-hover:flex items-center justify-center"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ModeBtn({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 px-2 py-1 text-xs rounded font-medium transition-all"
      style={{
        background: active ? '#2471a3' : '#1a1a1a',
        color: active ? '#fff' : '#666',
        border: `1px solid ${active ? '#2471a3' : '#333'}`,
      }}
    >
      {children}
    </button>
  );
}
