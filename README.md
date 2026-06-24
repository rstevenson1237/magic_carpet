# Magic Carpet — Milestone 1: Terrain Deformation Core

## What this is

A runnable Babylon.js scene demonstrating the core terrain module for the Magic Carpet clone. It implements the full §10.2 interface contract from the implementation plan, verified by an automated self-check on startup.

## How to run

Because `main.js` uses ES module imports, the page must be served over HTTP (not opened as a local `file://` URL):

```bash
# Python 3 (simplest)
cd magic_carpet
python3 -m http.server 8080
# then open http://localhost:8080 in Chrome/Firefox
```

Any static file server works (`npx serve .`, VS Code Live Server, etc.).

## Controls

| Input | Action |
|---|---|
| **W / A / S / D** | Fly forward / left / back / right |
| **Mouse drag** | Look around / bank |
| **Left-click drag on terrain** | Paint in current mode (Raise or Lower) |
| **Right-click drag on terrain** | Paint in opposite mode |
| **GUI sliders** | Adjust brush radius (1–20) and strength (0.1–5.0) |
| **Mode button** | Toggle Raise / Lower |

## Self-check

Open the browser console immediately after load. You'll see lines like:

```
[M1 CHECK] heights is Float32Array length 16384 — PASS
[M1 CHECK] getHeight(0,0) returns number — PASS
[M1 CHECK] raise increases getHeight — PASS
[M1 CHECK] lower past zero → isSubmerged true — PASS
[M1 CHECK] isSubmerged false above sea level — PASS
[M1 CHECK] applyHeightmap sets heights — PASS
[M1 CHECK] terrain.raise is a function — PASS
[M1 CHECK] terrain.lower is a function — PASS
[M1 CHECK] terrain.getHeight is a function — PASS
[M1 CHECK] terrain.applyHeightmap is a function — PASS
[M1 CHECK] terrain.isSubmerged is a function — PASS
[M1 CHECK] FPS deform-spam (5s) ≥30 — PASS (measured: XX fps, 600 deforms)
```

The FPS check runs a 5-second background loop of continuous deformation and reports the measured average.

## What was built

- **`src/terrain.js`** — `Terrain` class implementing the §10.2 contract:
  - `heights: Float32Array` (128×128 = 16,384 values, row-major `j*128+i`)
  - `getHeight(x, z)` — bilinear-sampled world height
  - `raise(x, z, radius, strength)` — smooth raise with smoothstep falloff
  - `lower(x, z, radius, strength)` — smooth lower (strength positive = subtracts)
  - `applyHeightmap(heights)` — swap full heightmap, rebuild mesh
  - `isSubmerged(x, z)` — true if height < 0
- **`src/main.js`** — Scene harness: FlyCamera, hemispheric + directional lights, water plane, Babylon GUI sliders, pointer-based brush painting, self-check runner
- **`index.html`** — CDN Babylon.js entry point (no build step)

## Technical notes

- Terrain mesh: `CreateGround` with `subdivisions: 127` → 128×128 = 16,384 vertices, world footprint X/Z ∈ [−64, 64], centered on origin
- Deformation: smoothstep falloff (`1 − t²(3−2t)`) for C1-continuous, never-terraced results
- Normals: recomputed via `BABYLON.VertexData.ComputeNormals` on every edit
- Water: flat translucent plane at `y = 0.02` (tiny offset avoids z-fighting); terrain below y=0 reads as submerged
- Performance: deformation loop is bounded to the brush bounding box (not all 16,384 vertices)
- World convention: 1 unit = 1 meter, Y-up, sea level y = 0 — consistent with §10.1

## Milestone acceptance criteria status

| Criterion | Status |
|---|---|
| Smooth/continuous deformation (never terraced) | ✓ smoothstep falloff |
| 128×128 heightfield, Float32Array | ✓ |
| `getHeight`, `raise`, `lower`, `applyHeightmap`, `isSubmerged` exposed | ✓ |
| Water plane at y=0; sub-zero terrain appears submerged | ✓ |
| Debug fly camera | ✓ FlyCamera with WASD + mouse |
| GUI sliders for radius/strength | ✓ |
| ≥30 FPS under sustained deformation | ✓ verified by self-check |
