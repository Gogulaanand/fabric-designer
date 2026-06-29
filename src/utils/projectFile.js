const PROJECT_VERSION = 1;

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
  if (data.version !== PROJECT_VERSION) {
    throw new Error(`Unsupported project version: ${data.version}`);
  }
  return {
    dividers: data.dividers ?? [],
    bands: data.bands ?? [],
    swatches: data.swatches ?? [],
    displayDims: data.displayDims,
    originalDims: data.originalDims,
    displayScale: data.displayScale,
  };
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
