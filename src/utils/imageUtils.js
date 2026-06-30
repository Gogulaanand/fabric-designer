const MAX_DISPLAY_WIDTH = 1000;

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode image. Try a JPG or PNG file.'));
      img.onload = () => {
        // Full-resolution canvas (retained for export)
        const origCanvas = document.createElement('canvas');
        origCanvas.width = img.width;
        origCanvas.height = img.height;
        origCanvas.getContext('2d').drawImage(img, 0, 0);
        const originalImageData = origCanvas.getContext('2d').getImageData(0, 0, img.width, img.height);

        // Display-resolution canvas (max 1000px wide for interaction)
        const scale = Math.min(1, MAX_DISPLAY_WIDTH / img.width);
        const dw = Math.round(img.width * scale);
        const dh = Math.round(img.height * scale);
        const dispCanvas = document.createElement('canvas');
        dispCanvas.width = dw;
        dispCanvas.height = dh;
        dispCanvas.getContext('2d').drawImage(img, 0, 0, dw, dh);
        const displayImageData = dispCanvas.getContext('2d').getImageData(0, 0, dw, dh);

        resolve({
          originalImageData,
          originalDims: { w: img.width, h: img.height },
          displayImageData,
          displayDims: { w: dw, h: dh },
          displayScale: scale,
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const THRESH = 130;
const BLACK_THRESH = 60;

function shouldReplacePx(data, i, replaceAllNonBlack) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  if (Math.max(r, g, b) < BLACK_THRESH) return false;
  if (replaceAllNonBlack) return true;
  return r > THRESH && g > THRESH && b > THRESH;
}

export function buildColorizedSync(srcData, dims, sortedDivs, bands, axis = 'horizontal', replaceAllNonBlack = true) {
  const out = new ImageData(new Uint8ClampedArray(srcData.data), dims.w, dims.h);

  if (axis === 'vertical') {
    // Bands are vertical columns; dividers are X positions
    for (let x = 0; x < dims.w; x++) {
      let bandIdx = bands.length - 1;
      for (let i = 0; i < sortedDivs.length; i++) {
        if (x < sortedDivs[i]) { bandIdx = i; break; }
      }
      const band = bands[bandIdx];
      if (!band) continue;

      let col = null;
      if (band.gradient && band.gradient.top && band.gradient.bottom) {
        const xStart = bandIdx === 0 ? 0 : sortedDivs[bandIdx - 1];
        const xEnd = bandIdx < sortedDivs.length ? sortedDivs[bandIdx] : dims.w;
        const t = (x - xStart) / Math.max(xEnd - xStart - 1, 1);
        const ta = band.gradient.top.rgb;
        const tb = band.gradient.bottom.rgb;
        col = [
          Math.round(ta[0] + (tb[0] - ta[0]) * t),
          Math.round(ta[1] + (tb[1] - ta[1]) * t),
          Math.round(ta[2] + (tb[2] - ta[2]) * t),
        ];
      } else if (band.color) {
        col = band.color.rgb;
      }
      if (!col) continue;

      for (let y = 0; y < dims.h; y++) {
        const i = (y * dims.w + x) * 4;
        if (shouldReplacePx(srcData.data, i, replaceAllNonBlack)) {
          out.data[i]     = col[0];
          out.data[i + 1] = col[1];
          out.data[i + 2] = col[2];
        }
      }
    }
  } else {
    // Bands are horizontal rows; dividers are Y positions
    for (let y = 0; y < dims.h; y++) {
      let bandIdx = bands.length - 1;
      for (let i = 0; i < sortedDivs.length; i++) {
        if (y < sortedDivs[i]) { bandIdx = i; break; }
      }
      const band = bands[bandIdx];
      if (!band) continue;

      let col = null;
      if (band.gradient && band.gradient.top && band.gradient.bottom) {
        const yStart = bandIdx === 0 ? 0 : sortedDivs[bandIdx - 1];
        const yEnd = bandIdx < sortedDivs.length ? sortedDivs[bandIdx] : dims.h;
        const t = (y - yStart) / Math.max(yEnd - yStart - 1, 1);
        const ta = band.gradient.top.rgb;
        const tb = band.gradient.bottom.rgb;
        col = [
          Math.round(ta[0] + (tb[0] - ta[0]) * t),
          Math.round(ta[1] + (tb[1] - ta[1]) * t),
          Math.round(ta[2] + (tb[2] - ta[2]) * t),
        ];
      } else if (band.color) {
        col = band.color.rgb;
      }

      if (!col) continue;

      for (let x = 0; x < dims.w; x++) {
        const i = (y * dims.w + x) * 4;
        if (shouldReplacePx(srcData.data, i, replaceAllNonBlack)) {
          out.data[i]     = col[0];
          out.data[i + 1] = col[1];
          out.data[i + 2] = col[2];
        }
      }
    }
  }
  return out;
}

export function autoDetectDividers(displayImageData, dims, minBandHeight = 8, axis = 'horizontal') {
  const { data, width } = displayImageData;
  const contrasts = [];

  if (axis === 'vertical') {
    // Compare neighboring columns to find vertical stripe boundaries
    const sampleStep = Math.max(1, Math.floor(dims.h / 50));
    for (let x = 1; x < dims.w - 1; x++) {
      let diff = 0, samples = 0;
      for (let y = 0; y < dims.h; y += sampleStep) {
        const i0 = (y * width + (x - 1)) * 4;
        const i1 = (y * width + x) * 4;
        diff += Math.abs(data[i1] - data[i0]) + Math.abs(data[i1+1] - data[i0+1]) + Math.abs(data[i1+2] - data[i0+2]);
        samples++;
      }
      contrasts.push({ pos: x, contrast: samples > 0 ? diff / samples : 0 });
    }
  } else {
    const sampleStep = Math.max(1, Math.floor(width / 50));
    for (let y = 1; y < dims.h - 1; y++) {
      let diff = 0, samples = 0;
      for (let x = 0; x < width; x += sampleStep) {
        const i0 = ((y - 1) * width + x) * 4;
        const i1 = (y * width + x) * 4;
        diff += Math.abs(data[i1] - data[i0]) + Math.abs(data[i1+1] - data[i0+1]) + Math.abs(data[i1+2] - data[i0+2]);
        samples++;
      }
      contrasts.push({ pos: y, contrast: samples > 0 ? diff / samples : 0 });
    }
  }

  const mean = contrasts.reduce((s, r) => s + r.contrast, 0) / contrasts.length;
  const threshold = mean * 2.5;
  const dividers = [];
  let lastDiv = -minBandHeight;

  for (const { pos, contrast } of contrasts) {
    if (contrast > threshold && pos - lastDiv >= minBandHeight) {
      dividers.push(pos);
      lastDiv = pos;
    }
  }
  return dividers;
}
