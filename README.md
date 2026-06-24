# Magic Carpet — Milestone 2: Procedural Island Generator

Builds on M1. Generates a unique, seed-reproducible island with elevation bands, biome variants, and feature placement hooks — all fed into the M1 deformable terrain.

## How to run

Requires an HTTP server (ES module imports block `file://`):

```bash
cd magic_carpet
python3 -m http.server 8080
# open http://localhost:8080
```

## What's new in M2

- **`src/generator.js`** — `generateIsland(seed)` implementing the §10.3 contract:
  - 4-stage pipeline: fBm noise → island-mask layout → band classification → feature slots
  - Elevation bands: beach (0–1.5m) → grass (1.5–6.5m) → rock (6.5–12m) → snow (12m+)
  - Biome variants within each band (`plain/forest/swamp`, `sandy_beach/rocky_beach`, etc.)
  - Feature placement stubs: castle, spawn, trigger×3, portal×2
  - No external CDN dependency — self-contained seeded Simplex 2D noise + Mulberry32 PRNG
- **Vertex-coloured terrain** — band/variant colours applied to the mesh after generation
- **Seed UI** — type a seed number and click "Regenerate Island" (top-right panel)
- **Feature markers** — coloured debug spheres show feature slot positions

## Controls

| Input | Action |
|---|---|
| **W / A / S / D** + mouse | Fly camera |
| **Left-click drag on terrain** | Paint in current mode |
| **Right-click drag** | Paint opposite mode |
| **Brush sliders** (top-left) | Adjust radius / strength |
| **Mode button** | Toggle Raise / Lower |
| **Seed input** (top-right) | Enter a seed number |
| **Regenerate Island** | Generate new island from seed |

## Feature markers (debug spheres floating above terrain)

| Colour | Kind |
|---|---|
| Red | Castle objective |
| Blue | Player spawn |
| Yellow | Trigger volume |
| Cyan | Portal |

## Self-check console output

Open the browser console immediately after load. Both M1 and M2 checks run automatically:

```
Milestone 1 Self-Check — ✓ ALL PASS
  [PASS] heights is Float32Array length 16384
  [PASS] getHeight(0,0) returns number
  ...

Milestone 2 Self-Check — ✓ ALL PASS
  [PASS] generateIsland(42) is deterministic (byte-identical)
  [PASS] heights is Float32Array
  [PASS] heights length === 16384
  [PASS] bandAt is a function
  [PASS] variantAt is a function
  [PASS] featureSlots is an Array
  [PASS] all 4 corners below y=0
  [PASS] centroid (63,63) above y=0
  [PASS] featureSlots has at least one castle
  [PASS] castle slot is on land (height > 0)
  [PASS] 200 random cells: variantAt ∈ bandAt's allowed set
  [PASS] bandAt only returns valid band strings
  [PASS] terrain.applyHeightmap(island.heights) runs without error

[PASS] FPS deform-spam (5s) ≥30 — XX fps (600 deforms)
```

## Technical notes

### Generator architecture

The generator is structured to allow alternative layouts without altering the rest of the pipeline. The `LAYOUTS` object holds layout strategies; only `singleIsland` is implemented for v1.

### Height formula (island mask)

```
combined = h × mask × 0.65 + mask² × 0.85
height   = combined × 20 − 1.5
```

- `h` = normalized fBm noise ∈ [−1, 1]
- `mask` = smoothstep(distance_from_centre) ∈ [0, 1]
- Corners always have mask = 0 → height = −1.5 (submerged ✓)
- Centre always has mask = 1 → height ∈ [2.5, 28.5] (above sea level ✓)

### Band system

Elevation is the **primary** signal. The secondary low-frequency noise map selects only within the band's allowed variant set — the two systems never conflict.

### World & grid conventions (unchanged from M1)

| Property | Value |
|---|---|
| Grid | 128 × 128 vertices |
| Heights array | `Float32Array[16384]`, row-major `j×128+i` |
| World footprint | X/Z ∈ [−64, 64] |
| Cell size | 128/127 ≈ 1.008 world units |
| Sea level | y = 0 |
| 1 unit | 1 metre |

## Milestone acceptance criteria

| Criterion | Status |
|---|---|
| Noise heightmap, seedable | ✓ seeded Simplex fBm, 5 octaves |
| Deterministic from seed | ✓ self-check verifies byte-identical |
| Single-island radial mask layout | ✓ `LAYOUTS.singleIsland` |
| Elevation bands (beach→grass→rock→snow) | ✓ |
| Biome variants within bands, no conflict | ✓ elevation strictly dominant |
| Feature-placement hook (stubbed) | ✓ `featureSlots` with castle/spawn/trigger/portal |
| §10.3 contract exactly | ✓ `{heights, bandAt, variantAt, featureSlots}` |
| Drops into `terrain.applyHeightmap` | ✓ |
| Colored island rendered in M1 terrain | ✓ vertex-coloured mesh |
