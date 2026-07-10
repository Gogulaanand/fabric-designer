import { describe, it, expect } from 'vitest';
import { serializeProject, deserializeProject } from './projectFile.js';

// ── helpers ──────────────────────────────────────────────────────────────────

let _id = 0;
function uid() { return `test-id-${++_id}`; }

function makeBand(overrides = {}) {
  return { id: uid(), name: 'Band', color: null, gradient: null, locked: false, ...overrides };
}

function makeColor(hex = '#ff0000') {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { hex, rgb: [r, g, b], name: 'Test' };
}

function makeState(overrides = {}) {
  return {
    dividers: [100, 300],
    bands: [
      makeBand({ name: 'Band 1', color: makeColor('#ff0000') }),
      makeBand({ name: 'Band 2', color: makeColor('#00ff00'), locked: true }),
      makeBand({
        name: 'Band 3',
        gradient: {
          top: makeColor('#0000ff'),
          bottom: makeColor('#ffff00'),
        },
      }),
    ],
    swatches: [makeColor('#ff0000'), makeColor('#00ff00')],
    displayDims: { w: 500, h: 1000 },
    originalDims: { w: 1000, h: 2000 },
    displayScale: 0.5,
    dividerAxis: 'horizontal',
    ...overrides,
  };
}

// ── Round-trip tests ─────────────────────────────────────────────────────────

describe('projectFile round-trip', () => {
  it('round-trips bands, dividers, swatches, dims, and scale', () => {
    const state = makeState();
    const json = serializeProject(state);
    const loaded = deserializeProject(json);

    expect(loaded.dividers).toEqual([100, 300]);
    expect(loaded.bands.length).toBe(3);
    expect(loaded.bands[0].name).toBe('Band 1');
    expect(loaded.bands[0].color.hex).toBe('#ff0000');
    expect(loaded.bands[1].locked).toBe(true);
    expect(loaded.bands[2].gradient.top.hex).toBe('#0000ff');
    expect(loaded.bands[2].gradient.bottom.hex).toBe('#ffff00');
    expect(loaded.swatches.length).toBe(2);
    expect(loaded.displayDims).toEqual({ w: 500, h: 1000 });
    expect(loaded.originalDims).toEqual({ w: 1000, h: 2000 });
    expect(loaded.displayScale).toBe(0.5);
  });

  it('round-trips dividerAxis', () => {
    const state = makeState({ dividerAxis: 'vertical' });
    const json = serializeProject(state);
    const loaded = deserializeProject(json);
    expect(loaded.dividerAxis).toBe('vertical');
  });

  it('round-trips replaceAllNonBlack', () => {
    const state = makeState();
    const jsonTrue = serializeProject(state, { replaceAllNonBlack: true });
    expect(deserializeProject(jsonTrue).replaceAllNonBlack).toBe(true);

    const jsonFalse = serializeProject(state, { replaceAllNonBlack: false });
    expect(deserializeProject(jsonFalse).replaceAllNonBlack).toBe(false);
  });

  it('round-trips imageDataURL', () => {
    const state = makeState();
    const dataURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const json = serializeProject(state, { imageDataURL: dataURL });
    const loaded = deserializeProject(json);
    expect(loaded.imageDataURL).toBe(dataURL);
  });

  it('preserves band IDs across round-trip', () => {
    const state = makeState();
    const originalIds = state.bands.map(b => b.id);
    const json = serializeProject(state);
    const loaded = deserializeProject(json);
    const loadedIds = loaded.bands.map(b => b.id);
    expect(loadedIds).toEqual(originalIds);
  });

  it('preserves gradient rgb values across round-trip', () => {
    const state = makeState();
    const json = serializeProject(state);
    const loaded = deserializeProject(json);
    expect(loaded.bands[2].gradient.top.rgb).toEqual([0, 0, 255]);
    expect(loaded.bands[2].gradient.bottom.rgb).toEqual([255, 255, 0]);
  });
});

// ── Version migration tests ──────────────────────────────────────────────────

describe('projectFile version migration', () => {
  it('loads version 1 files (no image, no axis, no replaceAllNonBlack)', () => {
    const v1 = JSON.stringify({
      version: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      dividers: [100],
      bands: [
        { id: 'b1', name: 'Band 1', color: { hex: '#ff0000', rgb: [255, 0, 0], name: 'Red' }, gradient: null, locked: false },
        { id: 'b2', name: 'Band 2', color: null, gradient: null, locked: false },
      ],
      swatches: [],
      displayDims: { w: 500, h: 1000 },
      originalDims: { w: 1000, h: 2000 },
      displayScale: 0.5,
    });
    const loaded = deserializeProject(v1);
    expect(loaded.dividers).toEqual([100]);
    expect(loaded.bands.length).toBe(2);
    expect(loaded.bands[0].color.hex).toBe('#ff0000');
    // v1 defaults
    expect(loaded.dividerAxis).toBe('horizontal');
    expect(loaded.replaceAllNonBlack).toBe(true);
    expect(loaded.imageDataURL).toBeNull();
  });

  it('rejects unsupported versions', () => {
    const v99 = JSON.stringify({ version: 99 });
    expect(() => deserializeProject(v99)).toThrow('Unsupported project version: 99');
  });

  it('pads missing bands to satisfy bands.length === dividers.length + 1', () => {
    const v2 = JSON.stringify({
      version: 2,
      dividers: [100, 200, 300],
      bands: [{ id: 'b1', name: 'Band 1', color: null, gradient: null, locked: false }],
      swatches: [],
      displayDims: { w: 500, h: 1000 },
      originalDims: { w: 1000, h: 2000 },
      displayScale: 0.5,
    });
    const loaded = deserializeProject(v2);
    expect(loaded.bands.length).toBe(4); // dividers.length + 1
  });

  it('sanitizes invalid color data', () => {
    const v2 = JSON.stringify({
      version: 2,
      dividers: [],
      bands: [{ id: 'b1', name: 'Band 1', color: { hex: 'invalid', rgb: [0, 0, 0], name: '' }, gradient: null, locked: false }],
      swatches: [],
      displayDims: { w: 500, h: 1000 },
      originalDims: { w: 1000, h: 2000 },
      displayScale: 0.5,
    });
    const loaded = deserializeProject(v2);
    expect(loaded.bands[0].color).toBeNull();
  });

  it('handles missing dividers and bands gracefully', () => {
    const v2 = JSON.stringify({
      version: 2,
      displayDims: { w: 500, h: 1000 },
      originalDims: { w: 1000, h: 2000 },
      displayScale: 0.5,
    });
    const loaded = deserializeProject(v2);
    expect(loaded.dividers).toEqual([]);
    expect(loaded.bands.length).toBe(1); // at least 1 band
  });

  it('rejects non-object input', () => {
    expect(() => deserializeProject('"string"')).toThrow('Invalid project file');
    expect(() => deserializeProject('null')).toThrow('Invalid project file');
  });
});

// ── Serialization format tests ───────────────────────────────────────────────

describe('serializeProject output', () => {
  it('includes version 2 and a savedAt timestamp', () => {
    const state = makeState();
    const json = serializeProject(state);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(2);
    expect(parsed.savedAt).toBeDefined();
    expect(typeof parsed.savedAt).toBe('string');
  });

  it('includes dividerAxis and replaceAllNonBlack', () => {
    const state = makeState({ dividerAxis: 'vertical' });
    const json = serializeProject(state, { replaceAllNonBlack: false });
    const parsed = JSON.parse(json);
    expect(parsed.dividerAxis).toBe('vertical');
    expect(parsed.replaceAllNonBlack).toBe(false);
  });

  it('includes imageDataURL when provided', () => {
    const state = makeState();
    const json = serializeProject(state, { imageDataURL: 'data:image/png;base64,abc' });
    const parsed = JSON.parse(json);
    expect(parsed.imageDataURL).toBe('data:image/png;base64,abc');
  });

  it('sets imageDataURL to null when not provided', () => {
    const state = makeState();
    const json = serializeProject(state);
    const parsed = JSON.parse(json);
    expect(parsed.imageDataURL).toBeNull();
  });
});
