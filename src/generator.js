// Procedural island generator — §10.3 contract
// generateIsland(seed) -> { heights, bandAt, variantAt, featureSlots }
// No external dependencies: uses self-contained seeded Simplex noise.

const GRID = 128;
const HALF = 64;             // world half-extent
const STEP = 128 / 127;     // world units per grid cell (≈1.0079), matches terrain.js
const MAX_HEIGHT = 20;       // world units from sea to max peak
const SEA_OFFSET = 1.5;     // how far below y=0 the very edge dips

// ── Elevation band definitions (primary, strictly by height) ──────────────────

const BAND_THRESHOLDS = [
  { band: 'beach', max: 1.5 },
  { band: 'grass', max: 6.5 },
  { band: 'rock',  max: 12.0 },
  { band: 'snow',  max: Infinity },
];

// Secondary biome variants — must stay within the band's allowed set
export const BAND_VARIANTS = {
  beach: ['sandy_beach', 'rocky_beach'],
  grass: ['plain', 'forest', 'swamp'],
  rock:  ['bare_rock', 'alpine'],
  snow:  ['snow_peak', 'glacial'],
};

// ── Seeded PRNG (Mulberry32) ─────────────────────────────────────────────────

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Self-contained seeded Simplex 2D noise ────────────────────────────────────

function createSeededNoise(seed) {
  const rng = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates shuffle
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  // 2D simplex gradient table (8 gradients)
  const G = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;

  return function noise2D(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t  = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const g0 = G[perm[ii +      perm[jj     ]] % 8];
    const g1 = G[perm[ii + i1 + perm[jj + j1]] % 8];
    const g2 = G[perm[ii + 1  + perm[jj + 1 ]] % 8];
    const c0 = 0.5 - x0*x0 - y0*y0; const n0 = c0 < 0 ? 0 : c0*c0*c0*c0*(g0[0]*x0+g0[1]*y0);
    const c1 = 0.5 - x1*x1 - y1*y1; const n1 = c1 < 0 ? 0 : c1*c1*c1*c1*(g1[0]*x1+g1[1]*y1);
    const c2 = 0.5 - x2*x2 - y2*y2; const n2 = c2 < 0 ? 0 : c2*c2*c2*c2*(g2[0]*x2+g2[1]*y2);
    return 70 * (n0 + n1 + n2); // output ≈ [-1, 1]
  };
}

// ── Island layout functions ───────────────────────────────────────────────────
// Structured so alternative layouts (multi-island, landlocked) can be added by
// swapping out the layout object. Only single-island is implemented for v1.

const LAYOUTS = {
  singleIsland: {
    // Returns a mask ∈ [0,1]: 1 at center, 0 at edges.
    // nx/nz are normalized coords in [-1, 1].
    mask(nx, nz) {
      const d = Math.min(1, Math.sqrt(nx * nx + nz * nz));
      return 1 - d * d * (3 - 2 * d); // smoothstep: C1, no terracing
    },
  },
};

// ── Main generator ────────────────────────────────────────────────────────────

export function generateIsland(seed) {
  // Stage 1 — Seedable noise instances
  const heightNoise  = createSeededNoise(seed);
  // Second instance uses a different but seed-derived value for full determinism
  const variantNoise = createSeededNoise((seed ^ 0xA3B5_C7D9) >>> 0);

  const layout = LAYOUTS.singleIsland;

  // Stage 2 — Heightmap with island-mask falloff (single-island)
  const heights = new Float32Array(GRID * GRID);

  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      // Normalized coords ∈ [-1, 1]
      const nx = (i / (GRID - 1)) * 2 - 1;
      const nz = (j / (GRID - 1)) * 2 - 1;

      // fBm: 5 octaves (broad shape → fine detail)
      let h = 0, amp = 1, freq = 2.0;
      const ampSum = 1 + 0.5 + 0.25 + 0.125 + 0.0625; // 1.9375
      for (let oct = 0; oct < 5; oct++) {
        h += amp * heightNoise(nx * freq, nz * freq);
        amp  *= 0.5;
        freq *= 2.0;
      }
      h /= ampSum; // normalize → [-1, 1]

      const mask = layout.mask(nx, nz);
      // gradient is mask² — strong only at center, zero at edge.
      // Blending: noise shapes character, gradient guarantees center is above sea.
      // At mask=0 (corners): combined = 0 → height = -SEA_OFFSET (underwater ✓).
      // At mask=1 (center):  combined = h*0.65 + 0.85 ∈ [0.2, 1.5] → height ∈ [2.5, 28.5] ✓.
      const gradient = mask * mask;
      const combined = h * mask * 0.65 + gradient * 0.85;
      heights[j * GRID + i] = combined * MAX_HEIGHT - SEA_OFFSET;
    }
  }

  // Stage 3 — Elevation bands (primary) + biome variants (secondary)

  function _getHeightAt(x, z) {
    // Nearest-neighbour sample (fast; good enough for band classification)
    const fi = Math.max(0, Math.min(GRID - 1, Math.round((x + HALF) / STEP)));
    const fj = Math.max(0, Math.min(GRID - 1, Math.round((z + HALF) / STEP)));
    return heights[fj * GRID + fi];
  }

  function _classifyBand(h) {
    for (const { band, max } of BAND_THRESHOLDS) {
      if (h < max) return band;
    }
    return 'snow'; // fallback
  }

  /** Primary band at world XZ. Elevation is the sole determining factor. */
  function bandAt(x, z) {
    return _classifyBand(_getHeightAt(x, z));
  }

  /** Secondary biome variant within the band's allowed set. Elevation always dominates. */
  function variantAt(x, z) {
    const band = bandAt(x, z);
    // Sample secondary low-frequency noise at world coords
    const vn = (variantNoise(x * 0.018, z * 0.018) + 1) * 0.5; // 0..1
    const opts = BAND_VARIANTS[band];
    return opts[Math.min(opts.length - 1, Math.floor(vn * opts.length))];
  }

  // Stage 4 — Feature-placement hook (stubbed; M7 fills full placement logic)
  const featureSlots = _placeFeatureSlots(heights);

  return { heights, bandAt, variantAt, featureSlots };
}

// ── Feature slot placement (algorithmic stub for M7) ─────────────────────────

function _placeFeatureSlots(heights) {
  const slots = [];

  // Build a scored list of all above-sea-level grid cells
  const land = [];
  for (let j = 2; j < GRID - 2; j++) {
    for (let i = 2; i < GRID - 2; i++) {
      const h = heights[j * GRID + i];
      if (h <= 0) continue;
      const wx = -HALF + i * STEP;
      const wz = -HALF + j * STEP;
      const dist = Math.sqrt(wx * wx + wz * wz);
      land.push({ i, j, wx, wz, h, dist });
    }
  }

  // Local flatness: max height delta in a radius-r neighbourhood
  function flatness(ci, cj, r = 3) {
    let lo = Infinity, hi = -Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || ni >= GRID || nj < 0 || nj >= GRID) continue;
        const h = heights[nj * GRID + ni];
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    return hi - lo;
  }

  // CASTLE — far from centre, flat grass/rock land (never snow, never submerged)
  {
    const cands = land.filter(c =>
      c.dist >= 24 && c.h > 1.5 && c.h < 12 && flatness(c.i, c.j) < 2.5
    ).sort((a, b) => flatness(a.i, a.j) - flatness(b.i, b.j));

    // Take a cell near the flattest 10th-percentile to avoid placing on a razor peak
    if (cands.length > 0) {
      const pick = cands[Math.min(cands.length - 1, Math.floor(cands.length * 0.08))];
      slots.push({ x: pick.wx, z: pick.wz, kind: 'castle', meta: { h: pick.h } });
    } else {
      // Fallback: any far land cell
      const far = land.filter(c => c.dist >= 20 && c.h > 0.5);
      far.sort((a, b) => b.dist - a.dist);
      if (far.length > 0) {
        const pick = far[0];
        slots.push({ x: pick.wx, z: pick.wz, kind: 'castle', meta: { h: pick.h } });
      }
    }
  }

  // SPAWN — closest to centre (player starts roughly in the middle of the island)
  {
    const inner = land.filter(c => c.dist < 20 && c.h > 0.5)
      .sort((a, b) => a.dist - b.dist);
    if (inner.length > 0) {
      const pick = inner[0];
      slots.push({ x: pick.wx, z: pick.wz, kind: 'spawn', meta: { h: pick.h } });
    }
  }

  // TRIGGERS — 3 slots spread angularly around the island at mid-ring distance
  {
    const trigAngles = [0, Math.PI * 2/3, Math.PI * 4/3];
    for (const angle of trigAngles) {
      // Look for land in a 30°-wide arc at ~half island radius
      const targetDist = 20;
      const arc = Math.PI / 6;
      const cands = land.filter(c => {
        const a = Math.atan2(c.wz, c.wx);
        let da = Math.abs(a - angle);
        if (da > Math.PI) da = 2 * Math.PI - da;
        return da < arc && Math.abs(c.dist - targetDist) < 12 && c.h > 0.5;
      });
      if (cands.length > 0) {
        cands.sort((a, b) => Math.abs(a.dist - targetDist) - Math.abs(b.dist - targetDist));
        const pick = cands[0];
        slots.push({ x: pick.wx, z: pick.wz, kind: 'trigger', meta: { h: pick.h } });
      }
    }
  }

  // PORTALS — 2 paired slots on opposite sides, inner ring
  {
    const portalAngles = [Math.PI * 0.25, Math.PI * 1.25];
    for (const angle of portalAngles) {
      const arc = Math.PI / 4;
      const cands = land.filter(c => {
        const a = Math.atan2(c.wz, c.wx);
        let da = Math.abs(a - angle);
        if (da > Math.PI) da = 2 * Math.PI - da;
        return da < arc && c.dist > 10 && c.dist < 30 && c.h > 0.5;
      });
      if (cands.length > 0) {
        cands.sort((a, b) => a.dist - b.dist);
        const pick = cands[Math.floor(cands.length * 0.3)];
        slots.push({ x: pick.wx, z: pick.wz, kind: 'portal', meta: { h: pick.h } });
      }
    }
  }

  return slots;
}

// ── Band colour palette (used by main.js for vertex colouring) ────────────────

export const BAND_COLORS = {
  beach: {
    sandy_beach: [0.86, 0.79, 0.50],
    rocky_beach:  [0.66, 0.62, 0.52],
  },
  grass: {
    plain:  [0.36, 0.57, 0.22],
    forest: [0.17, 0.40, 0.14],
    swamp:  [0.30, 0.46, 0.24],
  },
  rock: {
    bare_rock: [0.52, 0.47, 0.42],
    alpine:    [0.43, 0.38, 0.36],
  },
  snow: {
    snow_peak: [0.93, 0.94, 0.97],
    glacial:   [0.80, 0.88, 0.96],
  },
};
