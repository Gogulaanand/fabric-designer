const PROJECT_VERSION = 2;
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

/**
 * Serialize the full project state to a JSON string.
 * @param {object} engineState - The state from getSerializableState()
 * @param {object} opts - Additional options
 * @param {string|null} opts.imageDataURL - The source image as a data URL (or null)
 * @param {boolean} opts.replaceAllNonBlack - Current replace-all-non-black toggle value
 * @returns {string} JSON string
 */
export function serializeProject(engineState, opts = {}) {
  return JSON.stringify({
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    dividers: engineState.dividers,
    bands: engineState.bands.map(b => ({
      id: b.id,
      name: b.name,
      color: b.color,
      gradient: b.gradient,
      locked: b.locked,
    })),
    swatches: engineState.swatches,
    displayDims: engineState.displayDims,
    originalDims: engineState.originalDims,
    displayScale: engineState.displayScale,
    dividerAxis: engineState.dividerAxis ?? 'horizontal',
    replaceAllNonBlack: opts.replaceAllNonBlack ?? true,
    imageDataURL: opts.imageDataURL ?? null,
  }, null, 2);
}

/**
 * Deserialize a project JSON string.
 * Handles both version 1 (legacy - no image, no axis, no replaceAllNonBlack)
 * and version 2 (full state with optional embedded image).
 * @param {string} json
 * @returns {object} Deserialized project data
 */
export function deserializeProject(json) {
  const data = JSON.parse(json);
  if (typeof data !== 'object' || data === null) throw new Error('Invalid project file');

  const version = data.version;
  if (version !== 1 && version !== 2) {
    throw new Error(`Unsupported project version: ${version}`);
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

  const result = {
    dividers,
    bands,
    swatches,
    displayDims: sanitizeDims(data.displayDims),
    originalDims: sanitizeDims(data.originalDims),
    displayScale: data.displayScale,
  };

  // Version 2 fields (migrated from v1 with defaults)
  result.dividerAxis = typeof data.dividerAxis === 'string'
    && (data.dividerAxis === 'horizontal' || data.dividerAxis === 'vertical')
    ? data.dividerAxis
    : 'horizontal';

  result.replaceAllNonBlack = typeof data.replaceAllNonBlack === 'boolean'
    ? data.replaceAllNonBlack
    : true;

  // Embedded image (v2 only; v1 files will have null)
  result.imageDataURL = typeof data.imageDataURL === 'string' && data.imageDataURL.length > 0
    ? data.imageDataURL
    : null;

  return result;
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
