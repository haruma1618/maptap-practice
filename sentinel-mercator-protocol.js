/* This code was written by Claude Sonnet 5 */

/**
 * sentinel-mercator-protocol.js
 *
 * The tiles at https://tiles.maptap.gg/tiles/sentinel/{z}/{x}/{y}.jpg use a
 * Plate Carrée / equirectangular projection packed into a square 2^z x 2^z
 * tile grid:
 *
 *   - X (longitude): identical formula to standard Web Mercator/XYZ tiles.
 *       lon = x / 2^z * 360 - 180
 *   - Y (latitude): LINEAR in latitude (not Mercator's atan(sinh(...))):
 *       lat = 90 - y / 2^z * 180
 *
 * MapLibre GL always requests tiles using standard Web Mercator addressing.
 * This protocol intercepts those requests and resamples the equirectangular
 * source into a proper Mercator tile.
 *
 * IMPORTANT - MapLibre's globe renderer does NOT request tiles at a single
 * uniform zoom across the visible sphere. It builds a quadtree of tiles and
 * deliberately uses coarser (lower-zoom, even z=0/1) tiles for the poles and
 * other areas far from the camera's center -- REGARDLESS of your current
 * camera zoom. That's why tilting toward a pole, or zooming all the way out,
 * both triggered requests below this source's actual minimum zoom (3).
 *
 * Two things fix this together:
 *   1. Set `minzoom` (and `maxzoom`, once you know it) on the MapLibre
 *      source below, matching the source's real range. This makes MapLibre
 *      prefer requesting more tiles AT the available zoom instead of tiles
 *      that don't exist.
 *   2. As a safety net (globe's pole-cap logic doesn't always respect
 *      source minzoom the same way flat quadtree tiling does), this file's
 *      buildMercatorTile() now handles ANY relationship between the
 *      requested zoom and the source's available zoom: if a lower zoom is
 *      requested, it gathers and mosaics the *multiple* source tiles needed
 *      to cover that larger area, instead of trying (and failing) to fetch
 *      a source tile that doesn't exist.
 *
 * Because X (longitude) mapping is linear in both schemes regardless of
 * zoom, only Y ever needs nonlinear (Mercator) resampling -- X is always a
 * simple crop + scale, which drawImage() does for us.
 *
 */

const SOURCE_URL_TEMPLATE = 'https://tiles.maptap.gg/tiles/sentinel/{z}/{x}/{y}.jpg';
const TILE_SIZE = 256;
const SUBDIVISIONS = 16; // vertical resampling segments per output tile

const MIN_SOURCE_ZOOM = 3;
const MAX_SOURCE_ZOOM = 11;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function effectiveSourceZoom(z) {
  let zs = z;
  if (MIN_SOURCE_ZOOM != null) zs = Math.max(zs, MIN_SOURCE_ZOOM);
  if (MAX_SOURCE_ZOOM != null) zs = Math.min(zs, MAX_SOURCE_ZOOM);
  return zs;
}

// ---- coordinate math -------------------------------------------------

// Latitude at a (possibly fractional) Web Mercator tile row `yFrac`, zoom `z`.
function mercatorRowToLat(yFrac, z) {
  const n = 2 ** z;
  const t = Math.PI * (1 - (2 * yFrac) / n);
  return (Math.atan(Math.sinh(t)) * 180) / Math.PI;
}

// Global (continuous) source-tile pixel row for a given latitude, at zoom `z`,
// under the source's linear/equirectangular Y scheme.
function latToSourceRowGlobal(lat, z) {
  const n = 2 ** z;
  return ((90 - lat) / 180) * n * TILE_SIZE;
}

function sourceTileUrl(z, x, y) {
  return SOURCE_URL_TEMPLATE.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

function range(start, end) {
  const out = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

// ---- core reprojection -------------------------------------------------

/**
 * Build a standard-Mercator-conformant tile image for (z, x, y) by sampling
 * the equirectangular source, at whatever source zoom is actually available.
 * Returns a <canvas>.
 */
async function buildMercatorTile(z, x, y) {
  const nDst = 2 ** z;
  const lonWest = (x / nDst) * 360 - 180;
  const lonEast = ((x + 1) / nDst) * 360 - 180;
  const latNorth = mercatorRowToLat(y, z);
  const latSouth = mercatorRowToLat(y + 1, z);

  const zs = effectiveSourceZoom(z);
  const nSrc = 2 ** zs;

  // Bounding box of the destination tile, in *source* global pixel space.
  const srcXGlobalWest = ((lonWest + 180) / 360) * nSrc * TILE_SIZE;
  const srcXGlobalEast = ((lonEast + 180) / 360) * nSrc * TILE_SIZE;
  const srcYGlobalNorth = latToSourceRowGlobal(latNorth, zs);
  const srcYGlobalSouth = latToSourceRowGlobal(latSouth, zs);

  const txStart = clamp(Math.floor(srcXGlobalWest / TILE_SIZE), 0, nSrc - 1);
  const txEnd = clamp(Math.floor((srcXGlobalEast - 1e-6) / TILE_SIZE), 0, nSrc - 1);
  const tyStart = clamp(Math.floor(srcYGlobalNorth / TILE_SIZE), 0, nSrc - 1);
  const tyEnd = clamp(Math.floor((srcYGlobalSouth - 1e-6) / TILE_SIZE), 0, nSrc - 1);

  // Fetch every source tile that overlaps the destination tile and lay them
  // out into one mosaic canvas (plain 1:1 placement, no distortion here).
  const mosaic = document.createElement('canvas');
  mosaic.width = (txEnd - txStart + 1) * TILE_SIZE;
  mosaic.height = (tyEnd - tyStart + 1) * TILE_SIZE;
  const mctx = mosaic.getContext('2d');

  await Promise.all(
    range(txStart, txEnd).flatMap((tx) =>
      range(tyStart, tyEnd).map(async (ty) => {
        try {
          const img = await loadImage(sourceTileUrl(zs, tx, ty));
          mctx.drawImage(img, (tx - txStart) * TILE_SIZE, (ty - tyStart) * TILE_SIZE);
        } catch {
          // Missing/failed source tile -- leave that patch of the mosaic blank
          // rather than failing the whole destination tile.
        }
      })
    )
  );

  const mosaicXWest = srcXGlobalWest - txStart * TILE_SIZE;
  const mosaicXEast = srcXGlobalEast - txStart * TILE_SIZE;

  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');

  // X is a simple linear crop+scale (handled by drawImage's source/dest
  // rects below). Y needs the nonlinear Mercator relationship, so it's done
  // in SUBDIVISIONS piecewise-linear segments.
  const samples = [];
  for (let i = 0; i <= SUBDIVISIONS; i++) {
    const destPy = (i / SUBDIVISIONS) * TILE_SIZE;
    const lat = mercatorRowToLat(y + destPy / TILE_SIZE, z);
    const srcRowGlobal = latToSourceRowGlobal(lat, zs);
    samples.push({ destPy, mosaicY: srcRowGlobal - tyStart * TILE_SIZE });
  }

  for (let i = 0; i < SUBDIVISIONS; i++) {
    const top = samples[i];
    const bottom = samples[i + 1];
    const destH = bottom.destPy - top.destPy;
    if (destH <= 0) continue;

    const srcY0 = clamp(top.mosaicY, 0, mosaic.height);
    const srcY1 = clamp(bottom.mosaicY, 0, mosaic.height);
    const srcH = srcY1 - srcY0;
    if (srcH <= 0) continue;

    ctx.drawImage(
      mosaic,
      mosaicXWest, srcY0, mosaicXEast - mosaicXWest, srcH,
      0, top.destPy, TILE_SIZE, destH
    );
  }

  return canvas;
}

// ---- MapLibre protocol registration -------------------------------------------------

const tileCache = new Map(); // "z/x/y" -> ArrayBuffer

export function registerSentinelMercatorProtocol(maplibregl, protocolName = 'sentinel-merc') {
  maplibregl.addProtocol(protocolName, async (params) => {
    const m = params.url.match(new RegExp(`^${protocolName}://(\\d+)/(\\d+)/(\\d+)`));
    if (!m) throw new Error(`Unrecognized tile URL: ${params.url}`);
    const [, z, x, y] = m;
    const key = `${z}/${x}/${y}`;

    if (tileCache.has(key)) {
      return { data: tileCache.get(key) };
    }

    const canvas = await buildMercatorTile(+z, +x, +y);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.9)
    );
    const buf = await blob.arrayBuffer();
    tileCache.set(key, buf);
    return { data: buf };
  });
}
