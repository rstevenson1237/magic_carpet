// Terrain module — §10.2 contract
// Grid: 128×128 vertices, row-major index = j*128 + i
// World footprint: X ∈ [−64, 64], Z ∈ [−64, 64], Y-up
// Sea level: y = 0

const GRID = 128;
const SUBDIVISIONS = GRID - 1; // 127
const WORLD_SIZE = 128;
const HALF = WORLD_SIZE / 2; // 64
const STEP = WORLD_SIZE / SUBDIVISIONS; // 128/127 ≈ 1.0079

export class Terrain {
  constructor(scene) {
    this._scene = scene;
    this.heights = new Float32Array(GRID * GRID);
    this._mesh = null;
    this._positions = null;
    this._indices = null;
    this._normals = null;
    this._init();
  }

  _init() {
    this._mesh = BABYLON.MeshBuilder.CreateGround("terrain", {
      width: WORLD_SIZE,
      height: WORLD_SIZE,
      subdivisions: SUBDIVISIONS,
      updatable: true,
    }, this._scene);

    // Cache position/index buffers once; we update them in-place
    this._positions = this._mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    this._indices = this._mesh.getIndices();
    this._normals = new Float32Array(this._positions.length);

    // Flat terrain at y=0 to start; M2 will call applyHeightmap with generated data
    // For debug/testing, apply a gentle rolling hill so normals are visible
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const wx = -HALF + i * STEP;
        const wz = -HALF + j * STEP;
        this.heights[j * GRID + i] =
          3 * Math.sin(wx * 0.05) * Math.cos(wz * 0.05) +
          1.5 * Math.sin(wx * 0.12 + 0.3) * Math.cos(wz * 0.09) +
          0.5 * Math.sin(wx * 0.22) * Math.cos(wz * 0.18);
      }
    }

    this._syncPositions();
    this._recomputeNormals();
    this._applyMaterial();
  }

  _applyMaterial() {
    const mat = new BABYLON.StandardMaterial("terrainMat", this._scene);
    mat.diffuseColor = new BABYLON.Color3(0.42, 0.55, 0.25);
    mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    this._mesh.material = mat;
  }

  // Write heights[] into the cached positions array
  _syncPositions() {
    for (let idx = 0; idx < GRID * GRID; idx++) {
      this._positions[idx * 3 + 1] = this.heights[idx];
    }
  }

  // Push position buffer to GPU
  _updatePositions() {
    this._mesh.updateVerticesData(
      BABYLON.VertexBuffer.PositionKind,
      this._positions,
      false,
      false
    );
  }

  _recomputeNormals() {
    BABYLON.VertexData.ComputeNormals(this._positions, this._indices, this._normals);
    this._mesh.updateVerticesData(
      BABYLON.VertexBuffer.NormalKind,
      this._normals,
      false,
      false
    );
  }

  // Sync heights → GPU positions + normals
  _updateMesh() {
    this._syncPositions();
    this._updatePositions();
    this._recomputeNormals();
  }

  // World XZ → fractional grid coords (not clamped)
  _worldToFrac(x, z) {
    return {
      fi: (x + HALF) / STEP,
      fj: (z + HALF) / STEP,
    };
  }

  // Grid (i,j) → world X
  _gridX(i) { return -HALF + i * STEP; }
  // Grid (i,j) → world Z
  _gridZ(j) { return -HALF + j * STEP; }

  // ── §10.2 public API ────────────────────────────────────────────────────────

  /** Bilinear-sampled world height at world XZ. */
  getHeight(x, z) {
    const { fi, fj } = this._worldToFrac(x, z);
    const i0 = Math.max(0, Math.min(GRID - 1, Math.floor(fi)));
    const i1 = Math.max(0, Math.min(GRID - 1, i0 + 1));
    const j0 = Math.max(0, Math.min(GRID - 1, Math.floor(fj)));
    const j1 = Math.max(0, Math.min(GRID - 1, j0 + 1));
    const tx = fi - i0;
    const tz = fj - j0;
    const h00 = this.heights[j0 * GRID + i0];
    const h10 = this.heights[j0 * GRID + i1];
    const h01 = this.heights[j1 * GRID + i0];
    const h11 = this.heights[j1 * GRID + i1];
    return h00 * (1 - tx) * (1 - tz) +
           h10 * tx * (1 - tz) +
           h01 * (1 - tx) * tz +
           h11 * tx * tz;
  }

  /** Smooth radial raise. Strength is positive; radius and strength in world units. */
  raise(x, z, radius, strength) {
    this._deform(x, z, radius, strength, 1);
  }

  /** Smooth radial lower. Strength is positive (subtracts). */
  lower(x, z, radius, strength) {
    this._deform(x, z, radius, strength, -1);
  }

  _deform(x, z, radius, strength, sign) {
    const { fi: fi_c, fj: fj_c } = this._worldToFrac(x, z);
    // Grid-space radius (approximate; STEP ≈ 1 so this is nearly exact)
    const gridRadius = radius / STEP;

    const i0 = Math.max(0, Math.floor(fi_c - gridRadius));
    const i1 = Math.min(GRID - 1, Math.ceil(fi_c + gridRadius));
    const j0 = Math.max(0, Math.floor(fj_c - gridRadius));
    const j1 = Math.min(GRID - 1, Math.ceil(fj_c + gridRadius));

    const r2 = radius * radius;

    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = this._gridX(i) - x;
        const dz = this._gridZ(j) - z;
        const dist2 = dx * dx + dz * dz;
        if (dist2 >= r2) continue;
        const t = Math.sqrt(dist2) / radius; // 0 at center → 1 at edge
        // Smoothstep complement: 1 at center, 0 at edge, C1-continuous
        const falloff = 1 - t * t * (3 - 2 * t);
        this.heights[j * GRID + i] += sign * strength * falloff;
      }
    }
    this._updateMesh();
  }

  /** Replace the full 128×128 Float32Array and rebuild the mesh. */
  applyHeightmap(heights) {
    if (heights.length !== GRID * GRID) {
      throw new Error(`applyHeightmap: expected ${GRID * GRID} values, got ${heights.length}`);
    }
    this.heights = new Float32Array(heights); // defensive copy
    this._updateMesh();
  }

  /** True if the terrain at world XZ is below sea level (y < 0). */
  isSubmerged(x, z) {
    return this.getHeight(x, z) < 0;
  }

  // Expose mesh for raycasting and picking in main.js
  get mesh() { return this._mesh; }
}
