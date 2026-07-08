import { describe, it, expect } from 'vitest';
import { bandReducer, INITIAL_STATE } from './bandReducer.js';

// ── helpers ──────────────────────────────────────────────────────────────────

let _id = 0;
function uid() { return `test-id-${++_id}`; }
function makeBand(overrides = {}) {
  return { id: uid(), name: 'Band', color: null, gradient: null, locked: false, ...overrides };
}
function makeState({ dividers = [], bands = [], axis = 'horizontal', h = 1000, w = 500 } = {}) {
  return {
    ...INITIAL_STATE,
    dividers,
    bands,
    dividerAxis: axis,
    displayDims: { w, h },
    originalDims: { w, h },
  };
}
function stamp(state, startCoord, period, templateDividers, templateBands) {
  return bandReducer(state, { type: 'STAMP_PATTERN', startCoord, period, templateDividers, templateBands });
}

// ── STAMP_PATTERN tests ───────────────────────────────────────────────────────

describe('STAMP_PATTERN – anchor at click', () => {
  it('inserts a divider exactly at startCoord (leading edge)', () => {
    const b1 = makeBand({ color: { hex: '#ff0000' } });
    const b2 = makeBand({ color: { hex: '#0000ff' } });
    const state = makeState({ dividers: [], bands: [makeBand()] });
    const result = stamp(state, 400, 200, [100], [b1, b2]);
    expect(result.dividers).toContain(400); // leading edge
    expect(result.dividers).toContain(500); // internal (400 + 100)
    expect(result.dividers).toContain(600); // trailing edge (400 + 200)
  });

  it('band midpoint at click+50 maps to first template band', () => {
    const red = makeBand({ color: { hex: '#ff0000' } });
    const blue = makeBand({ color: { hex: '#0000ff' } });
    const state = makeState({ dividers: [], bands: [makeBand()] });
    const result = stamp(state, 400, 200, [100], [red, blue]);
    // band [400, 500) has mid=450 → relative mid=50 < 100 → template band 0 (red)
    const mergedDivs = [...result.dividers].sort((a, b) => a - b);
    const bandAfterClick = result.bands.find((_, i) => {
      const bStart = i === 0 ? 0 : mergedDivs[i - 1];
      const bEnd = i < mergedDivs.length ? mergedDivs[i] : 1000;
      return bStart === 400 && bEnd === 500;
    });
    expect(bandAfterClick?.color?.hex).toBe('#ff0000');
  });

  it('second template band lands in [startCoord+100, startCoord+200)', () => {
    const red = makeBand({ color: { hex: '#ff0000' } });
    const blue = makeBand({ color: { hex: '#0000ff' } });
    const state = makeState({ dividers: [], bands: [makeBand()] });
    const result = stamp(state, 400, 200, [100], [red, blue]);
    const mergedDivs = [...result.dividers].sort((a, b) => a - b);
    const secondBand = result.bands.find((_, i) => {
      const bStart = i === 0 ? 0 : mergedDivs[i - 1];
      const bEnd = i < mergedDivs.length ? mergedDivs[i] : 1000;
      return bStart === 500 && bEnd === 600;
    });
    expect(secondBand?.color?.hex).toBe('#0000ff');
  });
});

describe('STAMP_PATTERN – subset selection (names and locks outside range)', () => {
  it('preserves id, name, color, and locked of bands outside the stamp range', () => {
    const outside1 = makeBand({ id: 'out1', name: 'Outside One', color: { hex: '#aaaaaa' }, locked: true });
    const inside  = makeBand({ id: 'in1',  name: 'Inside',      color: { hex: '#ff0000' } });
    const outside2 = makeBand({ id: 'out2', name: 'Outside Two', color: { hex: '#bbbbbb' } });
    // dividers: [300, 600] → bands [0,300), [300,600), [600,1000)
    const state = makeState({ dividers: [300, 600], bands: [outside1, inside, outside2] });
    // stamp only the middle band [300,600), period=300
    const result = stamp(state, 300, 300, [], [makeBand({ color: { hex: '#00ff00' } })]);
    // outside1 at [0,300) — mid=150, outside the stamp — should be preserved exactly
    const preserved1 = result.bands.find(b => b.id === 'out1');
    expect(preserved1).toBeTruthy();
    expect(preserved1.name).toBe('Outside One');
    expect(preserved1.color?.hex).toBe('#aaaaaa');
    expect(preserved1.locked).toBe(true);
    // outside2 at [600,1000) — should be preserved
    const preserved2 = result.bands.find(b => b.id === 'out2');
    expect(preserved2).toBeTruthy();
    expect(preserved2.name).toBe('Outside Two');
  });

  it('stamps only bands in selected range with template colors', () => {
    const b0 = makeBand({ id: 'b0', name: 'B0', color: { hex: '#111111' } });
    const b1 = makeBand({ id: 'b1', name: 'B1', color: { hex: '#222222' } });
    const b2 = makeBand({ id: 'b2', name: 'B2', color: { hex: '#333333' } });
    const b3 = makeBand({ id: 'b3', name: 'B3', color: { hex: '#444444' } });
    // dividers at 200, 400, 600 → bands [0,200), [200,400), [400,600), [600,1000)
    const state = makeState({ dividers: [200, 400, 600], bands: [b0, b1, b2, b3] });
    // stamp band 1 only: patternStart=200, patternEnd=400, period=200, no internal dividers
    const tpl = makeBand({ color: { hex: '#ff00ff' } });
    const result = stamp(state, 200, 200, [], [tpl]);
    // b0 preserved
    expect(result.bands.find(b => b.id === 'b0')).toBeTruthy();
    // band at [200,400) should have template color
    const mergedDivs = [...result.dividers].sort((a, b) => a - b);
    const stamped = result.bands.find((_, i) => {
      const s = i === 0 ? 0 : mergedDivs[i - 1];
      const e = i < mergedDivs.length ? mergedDivs[i] : 1000;
      return s === 200 && e === 400;
    });
    expect(stamped?.color?.hex).toBe('#ff00ff');
    // b3 preserved
    expect(result.bands.find(b => b.id === 'b3')).toBeTruthy();
  });
});

describe('STAMP_PATTERN – edge clipping', () => {
  it('clips gracefully when stamp extends past the image edge', () => {
    const state = makeState({ dividers: [], bands: [makeBand()] });
    const red = makeBand({ color: { hex: '#ff0000' } });
    const blue = makeBand({ color: { hex: '#0000ff' } });
    // startCoord=900, period=200, image height=1000 → endCoord=1100 clips at 1000
    const result = stamp(state, 900, 200, [100], [red, blue]);
    expect(result.dividers).toContain(900); // leading edge inserted
    // No divider should be >= 1000 (image limit)
    expect(result.dividers.every(d => d < 1000)).toBe(true);
    // Should not throw and should return valid state
    expect(result.bands.length).toBe(result.dividers.length + 1);
  });

  it('returns unchanged state when startCoord is out of bounds', () => {
    const state = makeState({ dividers: [], bands: [makeBand()] });
    const result = stamp(state, 1000, 100, [], [makeBand()]);
    expect(result).toBe(state);
  });

  it('startCoord at 0 does not add a leading-edge divider (already at image edge)', () => {
    const state = makeState({ dividers: [], bands: [makeBand()] });
    const result = stamp(state, 0, 200, [100], [makeBand({ color: { hex: '#ff0000' } }), makeBand()]);
    // No divider at 0 (image edge); should have dividers at 100 and 200
    expect(result.dividers).not.toContain(0);
    expect(result.dividers).toContain(100);
    expect(result.dividers).toContain(200);
  });
});

describe('STAMP_PATTERN – locked bands inside range keep color', () => {
  it('locked band inside stamp range keeps its existing color', () => {
    const locked = makeBand({ id: 'locked', name: 'Locked', color: { hex: '#abcdef' }, locked: true });
    // one band spanning [0,1000), no dividers
    const state = makeState({ dividers: [], bands: [locked] });
    // stamp a template with a different color over the whole range
    const tpl = makeBand({ color: { hex: '#ff0000' } });
    const result = stamp(state, 0, 500, [], [tpl]);
    // The locked band covers [0,1000). Stamp covers [0,500). The locked band's fragment in [0,500) keeps its color.
    // Band at [0,500) should still have #abcdef (locked)
    const mergedDivs = [...result.dividers].sort((a, b) => a - b);
    const stampedBand = result.bands.find((_, i) => {
      const s = i === 0 ? 0 : mergedDivs[i - 1];
      const e = i < mergedDivs.length ? mergedDivs[i] : 1000;
      const mid = (s + e) / 2;
      return mid >= 0 && mid < 500;
    });
    expect(stampedBand?.color?.hex).toBe('#abcdef');
    expect(stampedBand?.locked).toBe(true);
  });
});

describe('STAMP_PATTERN – vertical axis', () => {
  it('uses image width as limit for vertical axis', () => {
    const state = makeState({ dividers: [], bands: [makeBand()], axis: 'vertical', w: 800, h: 400 });
    const red = makeBand({ color: { hex: '#ff0000' } });
    // stamp at x=600, period=300 → should clip at w=800
    const result = stamp(state, 600, 300, [100], [red, makeBand()]);
    // 600 < 800 → leading edge inserted
    expect(result.dividers).toContain(600);
    // 700 (600+100) < 800 → inserted
    expect(result.dividers).toContain(700);
    // 900 (600+300) >= 800 → NOT inserted (clips)
    expect(result.dividers).not.toContain(900);
    expect(result.dividers.every(d => d < 800)).toBe(true);
  });
});

describe('STAMP_PATTERN – 2px merge tolerance', () => {
  it('does not add a divider within 2px of an existing one', () => {
    // existing divider at 300; stamp wants to insert at 301 (within 2px)
    const state = makeState({ dividers: [300], bands: [makeBand(), makeBand()] });
    const result = stamp(state, 301, 100, [], [makeBand({ color: { hex: '#ff0000' } })]);
    const count300ish = result.dividers.filter(d => Math.abs(d - 300) < 2).length;
    expect(count300ish).toBe(1); // only one, not two
  });

  it('adds a new divider that is > 2px away from any existing one', () => {
    const state = makeState({ dividers: [300], bands: [makeBand(), makeBand()] });
    const result = stamp(state, 305, 100, [], [makeBand({ color: { hex: '#ff0000' } })]);
    expect(result.dividers).toContain(305);
    expect(result.dividers).toContain(300);
  });
});

describe('STAMP_PATTERN – no-op cases', () => {
  it('returns unchanged state with empty templateBands', () => {
    const state = makeState({ dividers: [], bands: [makeBand()] });
    const result = bandReducer(state, { type: 'STAMP_PATTERN', startCoord: 100, period: 100, templateDividers: [], templateBands: [] });
    expect(result).toBe(state);
  });

  it('returns unchanged state with no displayDims', () => {
    const state = { ...makeState(), displayDims: null };
    const result = bandReducer(state, { type: 'STAMP_PATTERN', startCoord: 0, period: 100, templateDividers: [], templateBands: [makeBand()] });
    expect(result).toBe(state);
  });
});
