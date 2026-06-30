const PROJECT_VERSION = 1;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function validateHex(val) {
  return typeof val === 'string' && HEX_RE.test(val) ? val : null;
}

function sanitizeColor(c) {
  if (!c || typeof c !== 'object') return null;
  const hex = validateHex(c.hex);
  if (!hex) return null;
  return { hex, rgb: Array.isArray(c.rgb) && c.rgb.length === 3 ? c.rgb.map(Number) : [0, 0, 0], name: String(c.name ?? '') };
}

function sanitizeDims(d) {
  if (!d || typeof d !== 'object') return null;
  const w = Number(d.w), h = Number(d.h);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0 || w > 20000 || h > 20000) return null;
  return { w: Math.round(w), h: Math.round(h) };
}

function sanitizeBand(b) {
  if (!b || typeof b !== 'object') return null;
  const id = typeof b.id === 'string' && b.id.length > 0 ? b.id : crypto.randomUUID();
  const gradient = b.gradient && sanitizeColor(b.gradient.top) && sanitizeColor(b.gradient.bottom)
    ? { top: sanitizeColor(b.gradient.top), bottom: sanitizeColor(b.gradient.bottom) }
    : null;
  return {
    id,
    name: String(b.name ?? 'Band'),
    color: sanitizeColor(b.color),
    gradient,
    locked: !!b.locked,
  };
}

export function serializeProject(state) {
  return JSON.stringify({
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    dividers: state.dividers,
    bands: state.bands.map(b => ({
      id: b.id,
      name: b.name,
      color: b.color,
      gradient: b.gradient,
      locked: b.locked,
    })),
    swatches: state.swatches,
    displayDims: state.displayDims,
    originalDims: state.originalDims,
    displayScale: state.displayScale,
  }, null, 2);
}

export function deserializeProject(json) {
  const data = JSON.parse(json);
  if (typeof data !== 'object' || data === null) throw new Error('Invalid project file');
  if (data.version !== PROJECT_VERSION) {
    throw new Error(`Unsupported project version: ${data.version}`);
  }

  const dividers = Array.isArray(data.dividers)
    ? data.dividers.filter(d => typeof d === 'number' && isFinite(d))
    : [];

  const bands = Array.isArray(data.bands)
    ? data.bands.map(sanitizeBand).filter(Boolean)
    : [];

  // Ensure bands.length === dividers.length + 1
  while (bands.length < dividers.length + 1) {
    bands.push({ id: crypto.randomUUID(), name: `Band ${bands.length + 1}`, color: null, gradient: null, locked: false });
  }

  const swatches = Array.isArray(data.swatches)
    ? data.swatches.map(sanitizeColor).filter(Boolean)
    : [];

  return { dividers, bands, swatches, displayDims: sanitizeDims(data.displayDims), originalDims: sanitizeDims(data.originalDims), displayScale: data.displayScale };
}

export function downloadJSON(filename, content) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function openJSONFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return reject(new Error('No file selected'));
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    };
    input.click();
  });
}
