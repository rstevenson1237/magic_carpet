# Magic Carpet — Milestone 3: Arcade Flight Controller

Builds on M1 (deformable terrain) and M2 (procedural island generator). Adds a magic carpet entity driven by an arcade flight model, dual-platform input (desktop pointer-lock + touch joystick), a world-event bus, and soft terrain collision.

## How to run

Requires an HTTP server (ES module imports block `file://`):

```bash
cd magic_carpet
python3 -m http.server 8080
# open http://localhost:8080
```

## What's new in M3

- **`src/worldEvents.js`** — §10.6 singleton event bus (`emit` / `on` / `off`)
- **`src/flight.js`** — `FlightController`: carpet mesh, arcade physics (momentum, drag, gravity, banking), soft terrain collision, follow camera on a yaw-only pivot, `carpetMove` events
- **`src/input.js`** — `InputController`: auto-detects desktop vs touch; desktop uses pointer-lock + WASD + mouse-look, touch uses `BABYLON.VirtualJoystick` (left) + right-half drag (look) + GUI cast/spell buttons
- **`src/main.js`** updated: FlyCamera + brush painting removed; carpet + follow camera wired; HUD replaces brush panel; M3 self-check added

## Controls

### Desktop
| Input | Action |
|---|---|
| **Click canvas** | Lock pointer (required to fly) |
| **W / A / S / D** | Thrust forward / left / back / right |
| **Mouse move** | Yaw (left/right) + pitch (up/down → altitude) |
| **Left-click** | Primary cast (stub — M4) |
| **Right-click** | Alt cast (stub — M4) |
| **1 – 5** | Select spell slot |
| **Seed input** (top-right) | Enter a seed number |
| **Regenerate Island** | Generate new island; carpet teleports to spawn |

### Touch
| Input | Action |
|---|---|
| **Left thumb joystick** | Move (forward / strafe) |
| **Right-half drag** | Yaw / pitch look |
| **CAST button** (bottom-right) | Primary cast |
| **ALT button** | Alt cast |
| **1–5 spell bar** (bottom-center) | Select spell slot |

## Feature markers (debug spheres)

| Colour | Kind |
|---|---|
| Red | Castle objective |
| Blue | Player spawn |
| Yellow | Trigger volume |
| Cyan | Portal |

## Self-check console output

```
Milestone 1 Self-Check — ✓ ALL PASS
Milestone 2 Self-Check — ✓ ALL PASS
Milestone 3 Self-Check — ✓ ALL PASS
  [PASS] worldEvents.emit is a function
  [PASS] worldEvents.on is a function
  [PASS] worldEvents.off is a function
  [PASS] worldEvents event round-trip fires handler
  [PASS] carpetMove emitted during flight update
  [PASS] terrain collision: y never below getHeight + CLEARANCE
  [PASS] keyboard forward input sets forward=1
  [PASS] left-stick simulation produces forward motion
  [PASS] touch UI elements mounted — SKIP (desktop)
  [PASS] pointer-lock overlay present in DOM
[M3 FUN-CHECK] human sign-off required — is flying the island enjoyable?

[PASS] FPS deform-spam (5s) ≥30 — XX fps (600 deforms)
```

## Flight model constants

| Constant | Value | Notes |
|---|---|---|
| `THRUST` | 20 m/s² | Horizontal acceleration |
| `MAX_HSPEED` | 28 m/s | Horizontal speed cap |
| `DRAG` | 0.88/frame | Frame-rate-independent via `pow(DRAG, dt×60)` |
| `GRAVITY` | 2.5 m/s² | Gentle downward pull |
| `CLEARANCE` | 1.5 m | Hard floor above terrain surface |
| `MAX_BANK` | 0.42 rad | ~24° max visual roll |
| `ALT_SCALE` | 14 | Pitch-to-vertical-velocity multiplier |

## World & grid conventions (unchanged)

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
| Carpet entity with arcade physics | ✓ momentum, drag, gravity, speed cap |
| Frame-rate-independent drag | ✓ `pow(DRAG, dt×60)` |
| Visual banking on strafe | ✓ cosmetic roll, `MAX_BANK = 0.42 rad` |
| Soft terrain collision | ✓ `pos.y ≥ terrain.getHeight + CLEARANCE` |
| Desktop pointer-lock + WASD + mouse-look | ✓ |
| Touch VirtualJoystick + right-drag look | ✓ |
| Touch cast buttons + spell bar | ✓ |
| Follow camera (yaw-only pivot, no roll) | ✓ TransformNode yawPivot |
| §10.6 `worldEvents` bus | ✓ emit/on/off, `carpetMove` emitted each frame |
| Self-check all M1/M2/M3 assertions | ✓ |
