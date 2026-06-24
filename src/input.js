// Dual-platform input controller — desktop (pointer-lock + WASD) and touch (VirtualJoystick)

const YAW_SENS       = 0.0022;  // rad/pixel desktop mouse
const PITCH_SENS     = 0.0018;  // rad/pixel desktop mouse
const YAW_SENS_TOUCH   = 0.004;
const PITCH_SENS_TOUCH = 0.003;

export class InputController {
  constructor(canvas, scene) {
    this._canvas = canvas;
    this._scene  = scene;
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    // Shared accumulated deltas — consumed each frame by update()
    this._yawAccum   = 0;
    this._pitchAccum = 0;

    // Digital state
    this.forward       = 0;
    this.right         = 0;
    this.castDown      = false;
    this.altCastDown   = false;
    this.selectedSpell = 0;

    // Pointer-lock overlay element (set by main.js after it creates the DOM element)
    this._overlay = null;

    this._keys = new Set();

    if (this.isTouch) {
      this._initTouch(scene);
    } else {
      this._initDesktop(canvas, scene);
    }
  }

  _initDesktop(canvas, scene) {
    // Pointer lock request on click when not already locked
    canvas.addEventListener('click', () => {
      if (!document.pointerLockElement) canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (this._overlay) this._overlay.style.display = locked ? 'none' : 'flex';
    });

    // Accumulate mouse deltas while locked
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== canvas) return;
      this._yawAccum   += e.movementX * YAW_SENS;
      this._pitchAccum += e.movementY * PITCH_SENS;
    });

    // Cast flags while locked
    document.addEventListener('mousedown', e => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) this.castDown    = true;
      if (e.button === 2) this.altCastDown = true;
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) this.castDown    = false;
      if (e.button === 2) this.altCastDown = false;
    });

    // WASD + spell keys
    document.addEventListener('keydown', e => {
      this._keys.add(e.code);
      if (e.code >= 'Digit1' && e.code <= 'Digit5') {
        this.selectedSpell = parseInt(e.code.slice(-1), 10) - 1;
      }
    });
    document.addEventListener('keyup', e => {
      this._keys.delete(e.code);
    });
  }

  _initTouch(scene) {
    // Left thumb joystick via Babylon VirtualJoystick
    this._leftStick = new BABYLON.VirtualJoystick(true);

    // Right-half drag for look
    const rightTouches = new Map(); // pointerId → {x, y}
    scene.onPointerObservable.add(info => {
      const e = info.event;
      const isRight = e.clientX > this._canvas.clientWidth / 2;
      if (info.type === BABYLON.PointerEventTypes.POINTERDOWN && isRight) {
        rightTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      } else if (info.type === BABYLON.PointerEventTypes.POINTERMOVE) {
        const prev = rightTouches.get(e.pointerId);
        if (prev) {
          this._yawAccum   += (e.clientX - prev.x) * YAW_SENS_TOUCH;
          this._pitchAccum += (e.clientY - prev.y) * PITCH_SENS_TOUCH;
          rightTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }
      } else if (info.type === BABYLON.PointerEventTypes.POINTERUP) {
        rightTouches.delete(e.pointerId);
      }
    });
  }

  setOverlay(el) {
    this._overlay = el;
    // Initialise visibility correctly
    if (!this.isTouch) {
      el.style.display = document.pointerLockElement === this._canvas ? 'none' : 'flex';
    } else {
      el.style.display = 'none';
    }
  }

  update(/* dt */) {
    if (this.isTouch) {
      // Normalise left joystick
      if (this._leftStick) {
        const dx = this._leftStick.deltaPosition.x;
        const dz = this._leftStick.deltaPosition.z; // already negated by Babylon
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > 0.001) {
          const scale = Math.min(1, len);
          this.forward = -(dz / len) * scale; // forward = negative Z in joystick space
          this.right   =  (dx / len) * scale;
        } else {
          this.forward = 0;
          this.right   = 0;
        }
      }
    } else {
      // WASD
      this.forward = this._keys.has('KeyW') ? 1 : this._keys.has('KeyS') ? -1 : 0;
      this.right   = this._keys.has('KeyD') ? 1 : this._keys.has('KeyA') ? -1 : 0;
    }

    const result = {
      forward:       this.forward,
      right:         this.right,
      yawDelta:      this._yawAccum,
      pitchDelta:    this._pitchAccum,
      castDown:      this.castDown,
      altCastDown:   this.altCastDown,
      selectedSpell: this.selectedSpell,
    };

    // Consume accumulated deltas
    this._yawAccum   = 0;
    this._pitchAccum = 0;

    return result;
  }

  // ── Test hooks (used by M3 self-check) ──────────────────────────────────────

  _simulateKey(code, down) {
    if (down) this._keys.add(code);
    else      this._keys.delete(code);
  }

  _simulateLeftStick(x, z) {
    if (this._leftStick) {
      this._leftStick.deltaPosition.x = x;
      this._leftStick.deltaPosition.z = z;
    } else {
      // Desktop: synthesise as forward/right directly for test purposes
      this.forward = -z;
      this.right   =  x;
    }
  }
}
