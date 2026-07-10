import { useState, useCallback, useEffect } from 'react';
import { hexToRgb, rgbToHex, hslToRgb, rgbToHsl, makeColor } from '../../utils/colorUtils.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function normalizeHex(h) {
  return h.startsWith('#') ? h : '#' + h;
}

export function ColorControls({ activeColor, swatches, onColorChange, onAddSwatch, onRemoveSwatch, onEyedropper, selectedBand, onSetGradient, gradientMode, onGradientModeChange, dividerAxis }) {
  const [hex, setHex] = useState(activeColor.hex);
  const [gradTop, setGradTop] = useState(activeColor.hex);
  const [gradBottom, setGradBottom] = useState('#000000');

  const [hsl, setHsl] = useState(() => {
    const [r, g, b] = hexToRgb(activeColor.hex);
    return rgbToHsl(r, g, b);
  });

  // Sync local hex/HSL state when activeColor changes externally (eyedropper, swatch, etc.)
  useEffect(() => {
    setHex(activeColor.hex);
    const [r, g, b] = hexToRgb(activeColor.hex);
    setHsl(rgbToHsl(r, g, b));
  }, [activeColor.hex]);

  const applyHex = useCallback((h) => {
    const clean = normalizeHex(h);
    if (HEX_RE.test(clean)) {
      const [r, g, b] = hexToRgb(clean);
      setHsl(rgbToHsl(r, g, b));
      onColorChange(makeColor(clean, 'Custom'));
    }
  }, [onColorChange]);

  const applyHsl = useCallback((h, s, l) => {
    const [r, g, b] = hslToRgb(h, s, l);
    const newHex = rgbToHex(r, g, b);
    setHex(newHex);
    onColorChange(makeColor(newHex, 'Custom'));
  }, [onColorChange]);

  const applyGradient = useCallback(() => {
    const topClean = normalizeHex(gradTop);
    const botClean = normalizeHex(gradBottom);
    if (!HEX_RE.test(topClean) || !HEX_RE.test(botClean)) return;
    onSetGradient({
      top: makeColor(topClean, 'Gradient Top'),
      bottom: makeColor(botClean, 'Gradient Bottom'),
    });
  }, [gradTop, gradBottom, onSetGradient]);

  const gradTopValid = HEX_RE.test(normalizeHex(gradTop));
  const gradBotValid = HEX_RE.test(normalizeHex(gradBottom));

  return (
    <div className="flex flex-col gap-3">
      {/* Mode toggle */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
        <ModeBtn active={!gradientMode} onClick={() => onGradientModeChange(false)}>Solid</ModeBtn>
        <ModeBtn active={gradientMode} onClick={() => onGradientModeChange(true)}>Gradient</ModeBtn>
      </div>

      {!gradientMode ? (
        <>
          {/* Color preview + hex input */}
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded-lg border border-slate-200 flex-shrink-0 shadow-sm"
              style={{ background: activeColor.hex }}
            />
            <div className="flex-1">
              <input
                type="text"
                value={hex}
                onChange={e => setHex(e.target.value)}
                onBlur={e => applyHex(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyHex(hex)}
                className="w-full bg-white border border-slate-200 text-slate-900 text-sm px-2 py-1.5 rounded-lg font-mono outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
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
              className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200 bg-white p-0.5"
              title="Native color picker"
            />
          </div>

          {/* HSL sliders */}
          <div className="flex flex-col gap-2">
            {[['H', 0, 360, hsl[0]], ['S', 1, 100, hsl[1]], ['L', 2, 100, hsl[2]]].map(([label, idx, max, val]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-sm text-slate-400 w-4 font-semibold">{label}</span>
                <input
                  type="range" min={0} max={max} value={val}
                  onChange={e => {
                    const newHsl = [...hsl];
                    newHsl[idx] = Number(e.target.value);
                    setHsl(newHsl);
                    applyHsl(...newHsl);
                  }}
                  className="flex-1 h-1.5 rounded accent-blue-500"
                  style={idx === 0 ? {
                    background: 'linear-gradient(to right, #f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'
                  } : undefined}
                />
                <span className="text-sm text-slate-400 w-8 text-right font-mono">{val}</span>
              </div>
            ))}
          </div>

          {/* Eyedropper */}
          {typeof EyeDropper !== 'undefined' && (
            <button
              onClick={onEyedropper}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-200 text-base text-slate-500 hover:text-slate-800 hover:border-slate-400 transition-colors w-full bg-white"
            >
              💧 Eyedropper
            </button>
          )}

          {/* Add to swatches */}
          <button
            onClick={() => onAddSwatch(activeColor)}
            className="text-base text-slate-400 hover:text-blue-600 transition-colors text-left"
          >
            + Save as swatch
          </button>
        </>
      ) : (
        /* Gradient controls */
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 w-14">{dividerAxis === 'vertical' ? 'Left' : 'Top'}</span>
            <input type="color" value={gradTopValid ? normalizeHex(gradTop) : '#000000'} onChange={e => setGradTop(e.target.value)}
              className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200 bg-white p-0.5" />
            <input type="text" value={gradTop} onChange={e => setGradTop(e.target.value)}
              className="flex-1 bg-white border border-slate-200 text-slate-900 text-sm px-2 py-1 rounded-lg font-mono outline-none focus:border-blue-400"
              style={!gradTopValid ? { borderColor: '#fca5a5' } : undefined} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 w-14">{dividerAxis === 'vertical' ? 'Right' : 'Bottom'}</span>
            <input type="color" value={gradBotValid ? normalizeHex(gradBottom) : '#000000'} onChange={e => setGradBottom(e.target.value)}
              className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200 bg-white p-0.5" />
            <input type="text" value={gradBottom} onChange={e => setGradBottom(e.target.value)}
              className="flex-1 bg-white border border-slate-200 text-slate-900 text-sm px-2 py-1 rounded-lg font-mono outline-none focus:border-blue-400"
              style={!gradBotValid ? { borderColor: '#fca5a5' } : undefined} />
          </div>
          <div
            className="h-14 rounded-lg border border-slate-200 shadow-sm"
            style={{ background: gradTopValid && gradBotValid ? `linear-gradient(${dividerAxis === 'vertical' ? 'to right' : 'to bottom'}, ${normalizeHex(gradTop)}, ${normalizeHex(gradBottom)})` : '#f1f5f9' }}
          />
          <button
            onClick={applyGradient}
            disabled={!selectedBand || !gradTopValid || !gradBotValid}
            className="px-3 py-2 rounded-lg text-base font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply Gradient to Band
          </button>
        </div>
      )}

      {/* Swatches */}
      <div>
        <div className="text-sm text-slate-400 mb-2 uppercase tracking-wider font-semibold">Swatches</div>
        <div className="flex flex-wrap gap-1.5">
          {swatches.map((swatch, i) => (
            <div key={i} title={swatch.name || swatch.hex} className="relative group">
              <button
                onClick={() => {
                  setHex(swatch.hex);
                  onColorChange(swatch);
                }}
                className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110 shadow-sm"
                style={{
                  background: swatch.hex,
                  borderColor: activeColor.hex === swatch.hex ? '#3b82f6' : '#e2e8f0',
                  boxShadow: activeColor.hex === swatch.hex ? '0 0 0 2px #93c5fd' : '0 1px 2px rgba(0,0,0,0.1)',
                }}
              />
              <button
                onClick={() => onRemoveSwatch(i)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-sm rounded-full hidden group-hover:flex items-center justify-center shadow"
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
      className="flex-1 px-2 py-1.5 text-base rounded-md font-medium transition-all"
      style={{
        background: active ? '#fff' : 'transparent',
        color: active ? '#1d4ed8' : '#64748b',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}
