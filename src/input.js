// Dual-platform input controller — keyboard/mouse + touch
// Touch uses custom document-level capture events so Babylon GUI overlays
// cannot intercept them. No VirtualJoystick dependency.

const YAW_SENS         = 0.0022;
const PITCH_SENS       = 0.0018;
const YAW_SENS_TOUCH   = 0.005;
const PITCH_SENS_TOUCH = 0.004;
const JOY_RADIUS       = 60; // px — virtual joystick max travel radius

export class InputController {
  constructor(canvas, scene) {
    this._canvas = canvas;
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    this._yawAccum   = 0;
    this._pitchAccum = 0;
    this.forward       = 0;
    this.right         = 0;
    this.castDown      = false;
    this.altCastDown   = false;
    this.selectedSpell = 0;

    this._keys       = new Set();
    this._overlay    = null;
    this._joyForward = 0;
    this._joyRight   = 0;
    this._touches    = new Map(); // pointerId → {startX,startY,lastX,lastY,side}

    // ── Keyboard — always active (Chromebook has a keyboard even in touch mode)
    document.addEventListener('keydown', e => {
      this._keys.add(e.code);
      if (e.code >= 'Digit1' && e.code <= 'Digit5')
        this.selectedSpell = parseInt(e.code.slice(-1), 10) - 1;
    });
    document.addEventListener('keyup', e => this._keys.delete(e.code));

    // ── Mouse look via pointer lock — available on all platforms
    canvas.addEventListener('click', () => {
      if (!document.pointerLockElement) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (this._overlay) this._overlay.style.display = locked ? 'none' : 'flex';
    });
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== canvas) return;
      this._yawAccum   += e.movementX * YAW_SENS;
      this._pitchAccum += e.movementY * PITCH_SENS;
    });
    document.addEventListener('mousedown', e => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) this.castDown    = true;
      if (e.button === 2) this.altCastDown = true;
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) this.castDown    = false;
      if (e.button === 2) this.altCastDown = false;
    });

    if (this.isTouch) this._initTouch(canvas);
  }

  _initTouch(canvas) {
    // Capture phase fires before the target, so we receive events even when
    // Babylon GUI controls or other overlays have consumed them at the target level.
    document.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      const side = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
      this._touches.set(e.pointerId, {
        startX: e.clientX, startY: e.clientY,
        lastX:  e.clientX, lastY:  e.clientY,
        side,
      });
    }, { capture: true });

    document.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') return;
      const t = this._touches.get(e.pointerId);
      if (!t) return;

      if (t.side === 'left') {
        // Virtual joystick: delta relative to the original touch-down point
        const dx   = e.clientX - t.startX;
        const dy   = e.clientY - t.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 4) {
          const scale = Math.min(1, dist / JOY_RADIUS);
          this._joyRight   =  (dx / dist) * scale;
          this._joyForward = -(dy / dist) * scale; // screen Y down = backward
        } else {
          this._joyForward = 0; this._joyRight = 0;
        }
      } else {
        // Right half: incremental yaw + pitch look
        this._yawAccum   += (e.clientX - t.lastX) * YAW_SENS_TOUCH;
        this._pitchAccum += (e.clientY - t.lastY) * PITCH_SENS_TOUCH;
        t.lastX = e.clientX; t.lastY = e.clientY;
      }
    }, { capture: true });

    const endTouch = e => {
      if (e.pointerType === 'mouse') return;
      const t = this._touches.get(e.pointerId);
      if (t?.side === 'left') { this._joyForward = 0; this._joyRight = 0; }
      this._touches.delete(e.pointerId);
    };
    document.addEventListener('pointerup',     endTouch, { capture: true });
    document.addEventListener('pointercancel', endTouch, { capture: true });

    // Scroll / pinch-zoom prevention is handled by `touch-action: none` CSS on the
    // canvas (set in index.html). Calling preventDefault() here would block Babylon
    // from converting touch events into pointer events, breaking GUI button presses.
  }

  setOverlay(el) {
    this._overlay = el;
    // Touch users can fly immediately; hide the "click to fly" overlay for them
    el.style.display = (this.isTouch || document.pointerLockElement === this._canvas)
      ? 'none' : 'flex';
  }

  update(/* dt */) {
    const keyFwd   = this._keys.has('KeyW') ? 1 : this._keys.has('KeyS') ? -1 : 0;
    const keyRight = this._keys.has('KeyD') ? 1 : this._keys.has('KeyA') ? -1 : 0;

    if (this.isTouch) {
      // Joystick takes priority; WASD fills in when joystick is idle
      const joyActive = Math.abs(this._joyForward) > 0.05 || Math.abs(this._joyRight) > 0.05;
      this.forward = joyActive ? this._joyForward : keyFwd;
      this.right   = joyActive ? this._joyRight   : keyRight;
    } else {
      this.forward = keyFwd;
      this.right   = keyRight;
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

    this._yawAccum   = 0;
    this._pitchAccum = 0;
    return result;
  }

  // ── Test hooks ──────────────────────────────────────────────────────────────

  _simulateKey(code, down) {
    if (down) this._keys.add(code);
    else      this._keys.delete(code);
  }

  // z < 0 = forward (up on screen); x > 0 = right
  _simulateLeftStick(x, z) {
    this._joyForward = -z;
    this._joyRight   =  x;
  }
}
