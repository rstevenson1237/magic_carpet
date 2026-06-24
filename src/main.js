import { Terrain } from './terrain.js';

// ── Engine & Scene ───────────────────────────────────────────────────────────

const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true });
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.48, 0.68, 0.92, 1.0);

// ── Camera ───────────────────────────────────────────────────────────────────

const camera = new BABYLON.FlyCamera('flyCamera', new BABYLON.Vector3(0, 30, -50), scene);
camera.setTarget(BABYLON.Vector3.Zero());
camera.speed = 0.5;
camera.rollCorrect = 10;
camera.bankedTurn = true;
camera.bankedTurnLimit = Math.PI / 4;
camera.bankedTurnMultiplier = 0.5;
camera.attachControl(canvas, true);

// ── Lighting ─────────────────────────────────────────────────────────────────

const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
hemi.intensity = 0.7;
hemi.groundColor = new BABYLON.Color3(0.3, 0.25, 0.15);

const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.6, -1, -0.5), scene);
sun.intensity = 0.9;
sun.diffuse = new BABYLON.Color3(1, 0.95, 0.85);

// ── Terrain ───────────────────────────────────────────────────────────────────

const terrain = new Terrain(scene);

// ── Water Plane ──────────────────────────────────────────────────────────────

const water = BABYLON.MeshBuilder.CreateGround('water', { width: 160, height: 160 }, scene);
water.position.y = 0.02; // tiny offset avoids z-fighting at exact sea level
const waterMat = new BABYLON.StandardMaterial('waterMat', scene);
waterMat.diffuseColor = new BABYLON.Color3(0.08, 0.32, 0.72);
waterMat.specularColor = new BABYLON.Color3(0.4, 0.5, 0.7);
waterMat.specularPower = 64;
waterMat.alpha = 0.6;
waterMat.backFaceCulling = false;
water.material = waterMat;
// Water renders on top of terrain where terrain is below y=0
water.renderingGroupId = 1;

// ── Brush State ───────────────────────────────────────────────────────────────

const brush = { radius: 8, strength: 1.0, mode: 'raise' };
let pointerDown = false;

// ── GUI ───────────────────────────────────────────────────────────────────────

function buildGUI() {
  const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI');

  // Semi-transparent panel in top-left
  const panel = new BABYLON.GUI.StackPanel();
  panel.width = '220px';
  panel.isVertical = true;
  panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  panel.paddingTop = '12px';
  panel.paddingLeft = '12px';
  ui.addControl(panel);

  function makeLabel(text) {
    const lbl = new BABYLON.GUI.TextBlock();
    lbl.text = text;
    lbl.color = 'white';
    lbl.fontSize = 13;
    lbl.height = '20px';
    lbl.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.addControl(lbl);
    return lbl;
  }

  function makeSlider(min, max, initial, step, onChange) {
    const s = new BABYLON.GUI.Slider();
    s.minimum = min;
    s.maximum = max;
    s.value = initial;
    s.step = step;
    s.height = '20px';
    s.width = '200px';
    s.color = '#8af';
    s.background = '#334';
    s.onValueChangedObservable.add(onChange);
    panel.addControl(s);
    return s;
  }

  const radiusLabel = makeLabel(`Brush Radius: ${brush.radius.toFixed(1)}`);
  makeSlider(1, 20, brush.radius, 0.5, (v) => {
    brush.radius = v;
    radiusLabel.text = `Brush Radius: ${v.toFixed(1)}`;
  });

  const strengthLabel = makeLabel(`Brush Strength: ${brush.strength.toFixed(2)}`);
  makeSlider(0.1, 5.0, brush.strength, 0.1, (v) => {
    brush.strength = v;
    strengthLabel.text = `Brush Strength: ${v.toFixed(2)}`;
  });

  // Mode toggle button
  const btn = BABYLON.GUI.Button.CreateSimpleButton('modeBtn', 'Mode: RAISE');
  btn.width = '200px';
  btn.height = '30px';
  btn.color = 'white';
  btn.background = '#3a6';
  btn.fontSize = 13;
  btn.paddingTop = '6px';
  btn.onPointerClickObservable.add(() => {
    brush.mode = brush.mode === 'raise' ? 'lower' : 'raise';
    btn.textBlock.text = `Mode: ${brush.mode.toUpperCase()}`;
    btn.background = brush.mode === 'raise' ? '#3a6' : '#a44';
  });
  panel.addControl(btn);

  // FPS counter
  const fpsLabel = makeLabel('FPS: --');
  fpsLabel.paddingTop = '8px';
  scene.registerBeforeRender(() => {
    fpsLabel.text = `FPS: ${engine.getFps().toFixed(0)}`;
  });

  // Help text
  const help = new BABYLON.GUI.TextBlock();
  help.text = 'LMB drag: paint  RMB drag: opposite\nWASD + mouse: fly';
  help.color = 'rgba(255,255,255,0.7)';
  help.fontSize = 11;
  help.height = '36px';
  help.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  help.paddingTop = '8px';
  panel.addControl(help);
}

buildGUI();

// ── Pointer / Brush Interaction ───────────────────────────────────────────────

function paintAt(x, z, altMode) {
  const mode = altMode ? (brush.mode === 'raise' ? 'lower' : 'raise') : brush.mode;
  if (mode === 'raise') {
    terrain.raise(x, z, brush.radius, brush.strength);
  } else {
    terrain.lower(x, z, brush.radius, brush.strength);
  }
}

function tryPaint(event) {
  // Pick against terrain mesh
  const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === terrain.mesh);
  if (pick.hit && pick.pickedPoint) {
    const { x, z } = pick.pickedPoint;
    paintAt(x, z, event && event.button === 2);
  }
}

scene.onPointerObservable.add((info) => {
  if (info.type === BABYLON.PointerEventTypes.POINTERDOWN) {
    pointerDown = true;
    tryPaint(info.event);
  } else if (info.type === BABYLON.PointerEventTypes.POINTERUP) {
    pointerDown = false;
  } else if (info.type === BABYLON.PointerEventTypes.POINTERMOVE && pointerDown) {
    tryPaint(info.event);
  }
});

// Prevent right-click context menu on canvas
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ── Self-Check ────────────────────────────────────────────────────────────────

function runSelfCheck() {
  const results = [];
  let allPass = true;

  function check(label, pass, detail = '') {
    const status = pass ? 'PASS' : 'FAIL';
    if (!pass) allPass = false;
    results.push(`[M1 CHECK] ${label} — ${status}${detail ? ' (' + detail + ')' : ''}`);
  }

  // 1. heights is Float32Array of length 16384
  check('heights is Float32Array length 16384',
    terrain.heights instanceof Float32Array && terrain.heights.length === 16384);

  // 2. getHeight returns a number
  const h0 = terrain.getHeight(0, 0);
  check('getHeight(0,0) returns number', typeof h0 === 'number' && !isNaN(h0));

  // 3. raise increases height
  const before = terrain.getHeight(10, 10);
  terrain.raise(10, 10, 5, 3);
  const after = terrain.getHeight(10, 10);
  check('raise increases getHeight', after > before, `${before.toFixed(3)} → ${after.toFixed(3)}`);

  // 4. lower past zero → isSubmerged
  // Force a point well below 0
  terrain.lower(20, 20, 3, 20);
  const submerged = terrain.isSubmerged(20, 20);
  check('lower past zero → isSubmerged true', submerged,
    `height=${terrain.getHeight(20, 20).toFixed(3)}`);

  // 5. isSubmerged false for raised terrain
  check('isSubmerged false above sea level', !terrain.isSubmerged(10, 10));

  // 6. applyHeightmap swaps the array
  const flat = new Float32Array(16384).fill(5.0);
  terrain.applyHeightmap(flat);
  const apex = terrain.getHeight(0, 0);
  check('applyHeightmap sets heights', Math.abs(apex - 5.0) < 0.01, `got ${apex.toFixed(4)}`);

  // Restore a visible terrain after the test
  for (let j = 0; j < 128; j++) {
    for (let i = 0; i < 128; i++) {
      const wx = -64 + i * (128 / 127);
      const wz = -64 + j * (128 / 127);
      flat[j * 128 + i] =
        3 * Math.sin(wx * 0.05) * Math.cos(wz * 0.05) +
        1.5 * Math.sin(wx * 0.12 + 0.3) * Math.cos(wz * 0.09) +
        0.5 * Math.sin(wx * 0.22) * Math.cos(wz * 0.18);
    }
  }
  terrain.applyHeightmap(flat);

  // 7. Interfaces exposed
  check('terrain.raise is a function', typeof terrain.raise === 'function');
  check('terrain.lower is a function', typeof terrain.lower === 'function');
  check('terrain.getHeight is a function', typeof terrain.getHeight === 'function');
  check('terrain.applyHeightmap is a function', typeof terrain.applyHeightmap === 'function');
  check('terrain.isSubmerged is a function', typeof terrain.isSubmerged === 'function');

  // Print results
  console.group('%cMilestone 1 Self-Check', 'font-weight:bold;font-size:14px');
  results.forEach((r) => {
    const pass = r.includes('PASS');
    console.log(`%c${r}`, `color:${pass ? '#4c8' : '#f44'}`);
  });
  console.log(`%cOverall: ${allPass ? '✓ ALL PASS' : '✗ FAILURES PRESENT'}`,
    `font-weight:bold;color:${allPass ? '#4c8' : '#f44'}`);
  console.groupEnd();

  // 8. FPS deform-spam test (runs after a short warm-up)
  let deformCount = 0;
  const deformStart = performance.now();
  const deformInterval = setInterval(() => {
    terrain.raise(0, 0, 8, 0.01);
    terrain.lower(5, 5, 8, 0.01);
    deformCount += 2;
    const elapsed = (performance.now() - deformStart) / 1000;
    if (elapsed >= 5) {
      clearInterval(deformInterval);
      const avgFps = engine.getFps();
      const pass = avgFps >= 30;
      console.log(
        `%c[M1 CHECK] FPS deform-spam (5s) ≥30 — ${pass ? 'PASS' : 'FAIL'} (measured: ${avgFps.toFixed(0)} fps, ${deformCount} deforms)`,
        `color:${pass ? '#4c8' : '#f44'};font-weight:bold`
      );
    }
  }, 1000 / 60); // ~60 deforms per second
}

// ── Render Loop ───────────────────────────────────────────────────────────────

engine.runRenderLoop(() => { scene.render(); });
window.addEventListener('resize', () => engine.resize());

// Run self-check after the first frame so the GPU is warm
scene.executeWhenReady(() => {
  setTimeout(runSelfCheck, 500);
});
