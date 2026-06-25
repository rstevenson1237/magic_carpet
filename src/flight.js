// Arcade flight controller — carpet entity with momentum, banking, terrain collision
import { worldEvents } from './worldEvents.js';

const THRUST    = 50;    // m/s²
const MAX_HSPEED = 40;   // m/s horizontal cap
const DRAG      = 0.92;  // per-60Hz-frame velocity multiplier
const GRAVITY   = 2.5;   // m/s² downward pull
const CLEARANCE = 1.5;   // hard floor above terrain surface (m)
const MAX_BANK  = 0.42;  // ~24° max visual bank (radians)
const BANK_SPEED = 5;    // rad/s lerp rate
const ALT_SCALE = 14;    // pitch-to-vertical-velocity multiplier
const BASE_PITCH = 0.12; // default camera downward tilt (radians)
const PITCH_MIN  = -0.9; // max look up ~52°
const PITCH_MAX  =  1.3; // max look down ~74°

export class FlightController {
  constructor(scene, terrain, spawnSlot) {
    this._scene   = scene;
    this._terrain = terrain;

    const sx = spawnSlot?.x ?? 0;
    const sz = spawnSlot?.z ?? 0;
    const sy = terrain.getHeight(sx, sz) + 8;

    this.position   = new BABYLON.Vector3(sx, sy, sz);
    this.velocity   = BABYLON.Vector3.Zero();
    this.yaw        = 0;
    this.bankAngle  = 0;
    this._pitchAngle = BASE_PITCH;

    this._buildMesh(scene);
    this._buildCamera(scene);
  }

  _buildMesh(scene) {
    this._mesh = BABYLON.MeshBuilder.CreateBox('carpet', { width: 3.5, height: 0.15, depth: 2.5 }, scene);
    const mat = new BABYLON.StandardMaterial('carpetMat', scene);
    mat.diffuseColor  = new BABYLON.Color3(0.65, 0.12, 0.40);
    mat.emissiveColor = new BABYLON.Color3(0.08, 0.01, 0.05);
    this._mesh.material = mat;
    this._mesh.position.copyFrom(this.position);
  }

  _buildCamera(scene) {
    this._yawPivot = new BABYLON.TransformNode('camPivot', scene);
    this._camera   = new BABYLON.FreeCamera('carpetCam', new BABYLON.Vector3(0, 1.5, -4), scene);
    this._camera.parent    = this._yawPivot;
    this._camera.rotation.x = BASE_PITCH;
    this._camera.minZ = 0.5;
    this._camera.inputs.clear();
  }

  get mesh()   { return this._mesh; }
  get camera() { return this._camera; }

  update(dt, input) {
    // 1. Yaw from input
    this.yaw += input.yawDelta;

    // 2. Facing vectors (XZ plane)
    const fwdX =  Math.sin(this.yaw);
    const fwdZ =  Math.cos(this.yaw);
    const rgtX =  Math.cos(this.yaw);
    const rgtZ = -Math.sin(this.yaw);

    // 3. Horizontal thrust
    this.velocity.x += (fwdX * input.forward + rgtX * input.right) * THRUST * dt;
    this.velocity.z += (fwdZ * input.forward + rgtZ * input.right) * THRUST * dt;

    // 4. Vertical: pitch drives altitude, gravity pulls down
    this.velocity.y += input.pitchDelta * ALT_SCALE - GRAVITY * dt;

    // 5. Frame-rate-independent drag
    const dragFactor = Math.pow(DRAG, dt * 60);
    this.velocity.x *= dragFactor;
    this.velocity.z *= dragFactor;
    this.velocity.y *= dragFactor;

    // 6. Horizontal speed cap
    const hspeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    if (hspeed > MAX_HSPEED) {
      const scale = MAX_HSPEED / hspeed;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // 7. Integrate position
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // 8. Terrain collision — sample current + one-frame-ahead to prevent embedding
    //    on fast horizontal movement into slopes.
    const groundY = this._terrain.getHeight(this.position.x, this.position.z);
    const nx = Math.max(-62, Math.min(62, this.position.x + this.velocity.x * dt));
    const nz = Math.max(-62, Math.min(62, this.position.z + this.velocity.z * dt));
    const groundNext = this._terrain.getHeight(nx, nz);
    const floorY = Math.max(groundY, groundNext) + CLEARANCE;
    if (this.position.y < floorY) {
      this.position.y = floorY;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }

    // 9. World bounds
    this.position.x = Math.max(-62, Math.min(62, this.position.x));
    this.position.z = Math.max(-62, Math.min(62, this.position.z));
    this.position.y = Math.max(-2,  Math.min(80, this.position.y));

    // 10. Visual banking (cosmetic roll)
    const targetBank = -input.right * MAX_BANK;
    this.bankAngle += (targetBank - this.bankAngle) * Math.min(1, dt * BANK_SPEED);

    // 11. Apply to carpet mesh
    this._mesh.position.copyFrom(this.position);
    this._mesh.rotation.y = this.yaw;
    this._mesh.rotation.z = this.bankAngle;

    // 12. Smooth camera yaw follow (small lag = cinematic feel)
    this._yawPivot.position.copyFrom(this.position);
    const yawDiff = this.yaw - this._yawPivot.rotation.y;
    const wrappedDiff = ((yawDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
    this._yawPivot.rotation.y += wrappedDiff * Math.min(1, dt * 8);

    // 12b. Camera pitch — accumulate from input, clamped to avoid flip-over
    this._pitchAngle = Math.max(PITCH_MIN, Math.min(PITCH_MAX,
      this._pitchAngle + input.pitchDelta));
    this._camera.rotation.x = this._pitchAngle;

    // 13. §10.6 event
    worldEvents.emit('carpetMove', {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      yaw: this.yaw,
    });
  }

  // Test hook: place carpet at arbitrary position (used by M3 self-check)
  _teleport(x, y, z) {
    this.position.set(x, y, z);
    this.velocity.setAll(0);
    this._pitchAngle = BASE_PITCH;
  }
}
