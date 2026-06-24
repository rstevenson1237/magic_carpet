import { Terrain } from './terrain.js';
import { generateIsland, BAND_COLORS, BAND_VARIANTS } from './generator.js';

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
hemi.intensity = 0.65;
hemi.groundColor = new BABYLON.Color3(0.28, 0.22, 0.12);

const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.6, -1, -0.5), scene);
sun.intensity = 0.85;
sun.diffuse = new BABYLON.Color3(1, 0.95, 0.85);

// ── Terrain ───────────────────────────────────────────────────────────────────

const terrain = new Terrain(scene);
// Disable the M1 default rolling-hills material; we'll set vertex colours below
terrain.mesh.material.diffuseColor = new BABYLON.Color3(1, 1, 1);

// ── Water Plane ──────────────────────────────────────────────────────────────

const water = BABYLON.MeshBuilder.CreateGround('water', { width: 160, height: 160 }, scene);
water.position.y = 0.02;
const waterMat = new BABYLON.StandardMaterial('waterMat', scene);
waterMat.diffuseColor = new BABYLON.Color3(0.08, 0.32, 0.72);
waterMat.specularColor = new BABYLON.Color3(0.4, 0.5, 0.7);
waterMat.specularPower = 64;
waterMat.alpha = 0.6;
waterMat.backFaceCulling = false;
water.material = waterMat;
water.renderingGroupId = 1;

// ── Brush State ───────────────────────────────────────────────────────────────

const brush = { radius: 8, strength: 1.0, mode: 'raise' };
let pointerDown = false;

// ── Constants (must match generator.js) ──────────────────────────────────────

const GRID       = 128;
const STEP       = 128 / 127;
const HALF       = 64;
const MAX_HEIGHT = 20;

// ── Band Vertex Colouring ─────────────────────────────────────────────────────
// Applied once after island generation; brush deformation leaves colours static
// (M4 will re-colour on spell impact if desired).

function applyBandColors(islandResult) {
  const colors = new Float32Array(GRID * GRID * 4); // RGBA per vertex
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const wx = -HALF + i * STEP;
      const wz = -HALF + j * STEP;
      const h   = islandResult.heights[j * GRID + i];
      const idx = (j * GRID + i) * 4;

      if (h < 0) {
        // Submerged: sandy/murky bottom visible through water
        colors[idx]   = 0.22;
        colors[idx+1] = 0.35;
        colors[idx+2] = 0.42;
        colors[idx+3] = 1;
        continue;
      }

      const band    = islandResult.bandAt(wx, wz);
      const variant = islandResult.variantAt(wx, wz);
      const palette = BAND_COLORS[band];
      const base    = palette[variant] ?? Object.values(palette)[0];

      // Subtle height-based shading: valleys slightly darker, peaks slightly lighter
      const shade = 0.82 + Math.max(0, Math.min(0.22, h / MAX_HEIGHT * 0.22));
      colors[idx]   = base[0] * shade;
      colors[idx+1] = base[1] * shade;
      colors[idx+2] = base[2] * shade;
      colors[idx+3] = 1;
    }
  }
  terrain.mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, colors, true);
}

// ── Island Apply ──────────────────────────────────────────────────────────────

let currentIsland = null;

function applyIsland(seed) {
  currentIsland = generateIsland(seed);
  terrain.applyHeightmap(currentIsland.heights);
  terrain.mesh.material.diffuseColor = new BABYLON.Color3(1, 1, 1);
  applyBandColors(currentIsland);
}

// ── GUI ───────────────────────────────────────────────────────────────────────

function buildGUI() {
  const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI');

  // ── Left panel: terrain brush controls ───────────────────────────────────

  const leftPanel = new BABYLON.GUI.StackPanel();
  leftPanel.width = '220px';
  leftPanel.isVertical = true;
  leftPanel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  leftPanel.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  leftPanel.paddingTop  = '12px';
  leftPanel.paddingLeft = '12px';
  ui.addControl(leftPanel);

  function addLabel(panel, text) {
    const lbl = new BABYLON.GUI.TextBlock();
    lbl.text  = text;
    lbl.color = 'white';
    lbl.fontSize = 13;
    lbl.height   = '20px';
    lbl.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.addControl(lbl);
    return lbl;
  }

  function addSlider(panel, min, max, value, step, onChange) {
    const s = new BABYLON.GUI.Slider();
    s.minimum = min; s.maximum = max; s.value = value; s.step = step;
    s.height = '20px'; s.width = '200px';
    s.color = '#8af'; s.background = '#334';
    s.onValueChangedObservable.add(onChange);
    panel.addControl(s);
    return s;
  }

  const radiusLabel = addLabel(leftPanel, `Brush Radius: ${brush.radius.toFixed(1)}`);
  addSlider(leftPanel, 1, 20, brush.radius, 0.5, v => {
    brush.radius = v;
    radiusLabel.text = `Brush Radius: ${v.toFixed(1)}`;
  });

  const strengthLabel = addLabel(leftPanel, `Brush Strength: ${brush.strength.toFixed(2)}`);
  addSlider(leftPanel, 0.1, 5.0, brush.strength, 0.1, v => {
    brush.strength = v;
    strengthLabel.text = `Brush Strength: ${v.toFixed(2)}`;
  });

  const modeBtn = BABYLON.GUI.Button.CreateSimpleButton('modeBtn', 'Mode: RAISE');
  modeBtn.width = '200px'; modeBtn.height = '30px';
  modeBtn.color = 'white'; modeBtn.background = '#3a6';
  modeBtn.fontSize = 13; modeBtn.paddingTop = '6px';
  modeBtn.onPointerClickObservable.add(() => {
    brush.mode = brush.mode === 'raise' ? 'lower' : 'raise';
    modeBtn.textBlock.text = `Mode: ${brush.mode.toUpperCase()}`;
    modeBtn.background = brush.mode === 'raise' ? '#3a6' : '#a44';
  });
  leftPanel.addControl(modeBtn);

  const fpsLabel = addLabel(leftPanel, 'FPS: --');
  fpsLabel.paddingTop = '8px';
  scene.registerBeforeRender(() => {
    fpsLabel.text = `FPS: ${engine.getFps().toFixed(0)}`;
  });

  const help = new BABYLON.GUI.TextBlock();
  help.text  = 'LMB drag: paint  RMB drag: opposite\nWASD + mouse: fly';
  help.color = 'rgba(255,255,255,0.65)';
  help.fontSize = 11;
  help.height   = '36px';
  help.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  help.paddingTop = '8px';
  leftPanel.addControl(help);

  // ── Right panel: seed / generation controls ───────────────────────────────

  const rightPanel = new BABYLON.GUI.StackPanel();
  rightPanel.width = '220px';
  rightPanel.isVertical = true;
  rightPanel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  rightPanel.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  rightPanel.paddingTop   = '12px';
  rightPanel.paddingRight = '12px';
  ui.addControl(rightPanel);

  addLabel(rightPanel, 'Island Seed');

  const seedInput = new BABYLON.GUI.InputText();
  seedInput.width = '200px'; seedInput.height = '30px';
  seedInput.text = '42';
  seedInput.color = 'white';
  seedInput.background = '#223';
  seedInput.focusedBackground = '#334';
  seedInput.fontSize = 14;
  rightPanel.addControl(seedInput);

  const regenBtn = BABYLON.GUI.Button.CreateSimpleButton('regen', 'Regenerate Island');
  regenBtn.width = '200px'; regenBtn.height = '32px';
  regenBtn.color = 'white'; regenBtn.background = '#48a';
  regenBtn.fontSize = 13; regenBtn.paddingTop = '6px';
  regenBtn.onPointerClickObservable.add(() => {
    const s = parseInt(seedInput.text, 10);
    applyIsland(isNaN(s) ? 42 : s);
  });
  rightPanel.addControl(regenBtn);

  // Feature slot legend
  const legend = new BABYLON.GUI.TextBlock();
  legend.text  = 'Feature slots (debug spheres):\n● Red = castle\n● Blue = spawn\n● Yellow = trigger\n● Cyan = portal';
  legend.color = 'rgba(255,255,255,0.7)';
  legend.fontSize = 11;
  legend.height   = '72px';
  legend.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  legend.paddingTop = '10px';
  rightPanel.addControl(legend);
}

buildGUI();

// ── Debug Feature Markers ─────────────────────────────────────────────────────

const KIND_COLORS = {
  castle:  new BABYLON.Color3(1, 0.15, 0.1),
  spawn:   new BABYLON.Color3(0.2, 0.4, 1),
  trigger: new BABYLON.Color3(1, 0.9, 0.1),
  portal:  new BABYLON.Color3(0.1, 0.9, 0.9),
};

let featureMarkers = [];

function showFeatureMarkers(slots) {
  featureMarkers.forEach(m => m.dispose());
  featureMarkers = [];
  for (let idx = 0; idx < slots.length; idx++) {
    const slot   = slots[idx];
    const sphere = BABYLON.MeshBuilder.CreateSphere(`feat_${slot.kind}_${idx}`, { diameter: 1.5 }, scene);
    const h = terrain.getHeight(slot.x, slot.z);
    sphere.position.set(slot.x, h + 2, slot.z);
    const mat = new BABYLON.StandardMaterial(`featMat_${slot.kind}`, scene);
    mat.emissiveColor = KIND_COLORS[slot.kind] ?? new BABYLON.Color3(1, 1, 1);
    sphere.material = mat;
    featureMarkers.push(sphere);
  }
}

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
  const pick = scene.pick(scene.pointerX, scene.pointerY, m => m === terrain.mesh);
  if (pick.hit && pick.pickedPoint) {
    const { x, z } = pick.pickedPoint;
    paintAt(x, z, event && event.button === 2);
  }
}

scene.onPointerObservable.add(info => {
  if (info.type === BABYLON.PointerEventTypes.POINTERDOWN) {
    pointerDown = true;
    tryPaint(info.event);
  } else if (info.type === BABYLON.PointerEventTypes.POINTERUP) {
    pointerDown = false;
  } else if (info.type === BABYLON.PointerEventTypes.POINTERMOVE && pointerDown) {
    tryPaint(info.event);
  }
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

// ── Self-checks ───────────────────────────────────────────────────────────────

function runM1Check() {
  const R = [];
  let ok = true;
  const chk = (label, pass, detail = '') => {
    if (!pass) ok = false;
    R.push({ label, pass, detail });
  };

  chk('heights is Float32Array length 16384',
    terrain.heights instanceof Float32Array && terrain.heights.length === 16384);

  const h0 = terrain.getHeight(0, 0);
  chk('getHeight(0,0) returns number', typeof h0 === 'number' && !isNaN(h0));

  const before = terrain.getHeight(5, 5);
  terrain.raise(5, 5, 5, 3);
  chk('raise increases getHeight', terrain.getHeight(5, 5) > before);

  terrain.lower(15, 15, 3, 20);
  chk('lower past zero → isSubmerged true', terrain.isSubmerged(15, 15));
  chk('isSubmerged false above sea level', !terrain.isSubmerged(5, 5));

  const flat = new Float32Array(16384).fill(5);
  terrain.applyHeightmap(flat);
  chk('applyHeightmap sets heights', Math.abs(terrain.getHeight(0, 0) - 5) < 0.02);

  ['raise','lower','getHeight','applyHeightmap','isSubmerged'].forEach(fn =>
    chk(`terrain.${fn} is a function`, typeof terrain[fn] === 'function')
  );

  return { label: 'Milestone 1', results: R, ok };
}

function runM2Check(island) {
  const R = [];
  let ok = true;
  const chk = (label, pass, detail = '') => {
    if (!pass) ok = false;
    R.push({ label, pass, detail });
  };

  // Determinism: same seed must produce byte-identical heights
  const a = generateIsland(42);
  const b = generateIsland(42);
  let identical = a.heights.length === b.heights.length;
  if (identical) {
    for (let i = 0; i < a.heights.length; i++) {
      if (a.heights[i] !== b.heights[i]) { identical = false; break; }
    }
  }
  chk('generateIsland(42) is deterministic (byte-identical)', identical);

  // Contract shape
  chk('heights is Float32Array', island.heights instanceof Float32Array);
  chk('heights length === 16384', island.heights.length === 16384);
  chk('bandAt is a function',    typeof island.bandAt    === 'function');
  chk('variantAt is a function', typeof island.variantAt === 'function');
  chk('featureSlots is an Array', Array.isArray(island.featureSlots));

  // Island sanity: corners submerged, centroid above sea
  const corners = [
    island.heights[0],             // (0,0)
    island.heights[127],           // (127,0)
    island.heights[127 * 128],     // (0,127)
    island.heights[127 * 128 + 127], // (127,127)
  ];
  chk('all 4 corners below y=0', corners.every(h => h < 0),
    `corners: ${corners.map(h => h.toFixed(2)).join(', ')}`);

  const centroidH = island.heights[63 * 128 + 63];
  chk('centroid (63,63) above y=0', centroidH > 0, `h=${centroidH.toFixed(2)}`);

  // featureSlots has at least one castle on land
  const castles = island.featureSlots.filter(s => s.kind === 'castle');
  chk('featureSlots has at least one castle', castles.length > 0);
  if (castles.length > 0) {
    const c = castles[0];
    const ch = terrain.getHeight(c.x, c.z);
    chk('castle slot is on land (height > 0)', ch > 0, `h=${ch.toFixed(2)}`);
  }

  // Band validity: 200 random samples, variantAt must be in band's allowed set
  let bandValid = true;
  for (let n = 0; n < 200; n++) {
    const x = (Math.random() * 2 - 1) * 60;
    const z = (Math.random() * 2 - 1) * 60;
    const band    = island.bandAt(x, z);
    const variant = island.variantAt(x, z);
    const allowed = BAND_VARIANTS[band];
    if (!allowed) { bandValid = false; break; }
    if (!allowed.includes(variant)) { bandValid = false; break; }
  }
  chk('200 random cells: variantAt ∈ bandAt\'s allowed set', bandValid);

  // Valid band return values
  const VALID_BANDS = new Set(['beach','grass','rock','snow']);
  let bandsOk = true;
  for (let n = 0; n < 50; n++) {
    const x = (Math.random() * 2 - 1) * 60;
    const z = (Math.random() * 2 - 1) * 60;
    if (!VALID_BANDS.has(island.bandAt(x, z))) { bandsOk = false; break; }
  }
  chk('bandAt only returns valid band strings', bandsOk);

  // Integration: applyHeightmap from generator must not throw
  let integOk = true;
  try { terrain.applyHeightmap(island.heights); } catch (e) { integOk = false; }
  chk('terrain.applyHeightmap(island.heights) runs without error', integOk);

  return { label: 'Milestone 2', results: R, ok };
}

function printCheckGroup(group) {
  console.group(`%c${group.label} Self-Check — ${group.ok ? '✓ ALL PASS' : '✗ FAILURES'}`,
    `font-weight:bold;font-size:13px;color:${group.ok ? '#4c8' : '#f44'}`);
  for (const { label, pass, detail } of group.results) {
    const d = detail ? ` (${detail})` : '';
    console.log(`%c[${pass ? 'PASS' : 'FAIL'}] ${label}${d}`,
      `color:${pass ? '#4c8' : '#f44'}`);
  }
  console.groupEnd();
}

// ── Render Loop & Init ────────────────────────────────────────────────────────

engine.runRenderLoop(() => { scene.render(); });
window.addEventListener('resize', () => engine.resize());

scene.executeWhenReady(() => {
  // Generate the default island first
  const DEFAULT_SEED = 42;
  applyIsland(DEFAULT_SEED);
  showFeatureMarkers(currentIsland.featureSlots);

  setTimeout(() => {
    // M1 check runs against current terrain state
    const m1 = runM1Check();
    printCheckGroup(m1);

    // Restore island after M1 side-effects (raise/lower/applyHeightmap calls)
    applyIsland(DEFAULT_SEED);
    showFeatureMarkers(currentIsland.featureSlots);

    // M2 check
    const m2 = runM2Check(currentIsland);
    printCheckGroup(m2);

    // FPS deform-spam (5s) — shared across both milestones
    let count = 0;
    const start = performance.now();
    const iv = setInterval(() => {
      terrain.raise(0, 0, 8, 0.01);
      terrain.lower(5, 5, 8, 0.01);
      count += 2;
      if ((performance.now() - start) / 1000 >= 5) {
        clearInterval(iv);
        const fps = engine.getFps();
        const pass = fps >= 30;
        console.log(
          `%c[${pass ? 'PASS' : 'FAIL'}] FPS deform-spam (5s) ≥30 — ${fps.toFixed(0)} fps (${count} deforms)`,
          `color:${pass ? '#4c8' : '#f44'};font-weight:bold`
        );
        // Regenerate island after spam so scene looks good
        applyIsland(DEFAULT_SEED);
        showFeatureMarkers(currentIsland.featureSlots);
      }
    }, 1000 / 60);
  }, 600);
});
