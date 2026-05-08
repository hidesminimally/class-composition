// Hatch sprite generators — produce ImageData tiles that MapLibre can register
// via map.addImage() and reference from a fill-pattern paint expression.
//
// We generate three densities and the matching SVG strings used by the legend
// so the map and the legend stay visually consistent.

export const HATCH_COLOR = 'rgba(15, 23, 42, 0.55)';

const TILE_SIZE = 12;

const DENSITIES = {
  'hatch-mid':   { spacing: 6, lineWidth: 1 },
  'hatch-dense': { spacing: 3, lineWidth: 1 },
};

// Draw a 45° diagonal line pattern into a canvas. Lines extend past the tile
// edges in both directions so the pattern tiles seamlessly.
function drawHatch(ctx, { spacing, lineWidth, color, size }) {
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'square';
  for (let i = -size; i <= size * 2; i += spacing) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }
}

// Generate the three hatch sprites as ImageData ready for map.addImage.
// Browser-only (uses canvas). Returns { id: ImageData } map.
export function makeHatchSprites({ size = TILE_SIZE, color = HATCH_COLOR } = {}) {
  const out = {};
  for (const [id, { spacing, lineWidth }] of Object.entries(DENSITIES)) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    drawHatch(ctx, { spacing, lineWidth, color, size });
    out[id] = ctx.getImageData(0, 0, size, size);
  }
  return out;
}

// SVG <pattern> string used by the legend to render the same hatching the map
// shows. Returns inline SVG markup for a single tile of the given density.
export function hatchSvgDataUri(densityId, { size = TILE_SIZE, color = HATCH_COLOR } = {}) {
  const cfg = DENSITIES[densityId];
  if (!cfg) return null;
  const { spacing, lineWidth } = cfg;
  const lines = [];
  for (let i = -size; i <= size * 2; i += spacing) {
    lines.push(`<line x1="${i}" y1="0" x2="${i + size}" y2="${size}" />`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <g stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="square">${lines.join('')}</g>
  </svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export const HATCH_IDS = Object.keys(DENSITIES);
