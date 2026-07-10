import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { saveSession, loadSession, clearSession, hasSession } from './sessionStorage.js';

// fake-indexeddb/auto polyfills globalThis.indexedDB for Node environments.

describe('sessionStorage (IndexedDB)', () => {
  beforeEach(async () => {
    // Start each test with a clean slate
    await clearSession();
  });

  it('returns null when no session is saved', async () => {
    const result = await loadSession();
    expect(result).toBeNull();
  });

  it('hasSession returns false when no session exists', async () => {
    const exists = await hasSession();
    expect(exists).toBe(false);
  });

  it('saves and loads a session string', async () => {
    const data = JSON.stringify({ version: 2, bands: [], dividers: [] });
    await saveSession(data);
    const loaded = await loadSession();
    expect(loaded).toBe(data);
  });

  it('hasSession returns true after saving', async () => {
    await saveSession('{"test":true}');
    const exists = await hasSession();
    expect(exists).toBe(true);
  });

  it('overwrites the previous session on re-save', async () => {
    await saveSession('first');
    await saveSession('second');
    const loaded = await loadSession();
    expect(loaded).toBe('second');
  });

  it('clearSession removes the saved session', async () => {
    await saveSession('data');
    await clearSession();
    const loaded = await loadSession();
    expect(loaded).toBeNull();
    const exists = await hasSession();
    expect(exists).toBe(false);
  });

  it('handles large payloads (simulated image data URL)', async () => {
    // Simulate a moderately large data URL (100KB)
    const largePayload = 'data:image/png;base64,' + 'A'.repeat(100_000);
    const data = JSON.stringify({ version: 2, imageDataURL: largePayload });
    await saveSession(data);
    const loaded = await loadSession();
    const parsed = JSON.parse(loaded);
    expect(parsed.imageDataURL.length).toBe(largePayload.length);
  });

  it('round-trips a full project-like payload', async () => {
    const project = {
      version: 2,
      savedAt: '2026-07-10T00:00:00.000Z',
      dividers: [100, 300],
      bands: [
        { id: 'b1', name: 'Band 1', color: { hex: '#ff0000', rgb: [255, 0, 0], name: 'Red' }, gradient: null, locked: false },
        { id: 'b2', name: 'Band 2', color: null, gradient: null, locked: true },
        { id: 'b3', name: 'Band 3', color: null, gradient: { top: { hex: '#0000ff', rgb: [0, 0, 255], name: '' }, bottom: { hex: '#ffff00', rgb: [255, 255, 0], name: '' } }, locked: false },
      ],
      swatches: [{ hex: '#ff0000', rgb: [255, 0, 0], name: 'Red' }],
      displayDims: { w: 500, h: 1000 },
      originalDims: { w: 1000, h: 2000 },
      displayScale: 0.5,
      dividerAxis: 'horizontal',
      replaceAllNonBlack: true,
      imageDataURL: 'data:image/png;base64,abc123',
    };
    const json = JSON.stringify(project);
    await saveSession(json);
    const loaded = await loadSession();
    expect(JSON.parse(loaded)).toEqual(project);
  });
});
