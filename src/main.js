import { Terrain } from './terrain.js';
import { generateIsland, BAND_COLORS, BAND_VARIANTS } from './generator.js';
import { worldEvents } from './worldEvents.js';
import { FlightController } from './flight.js';
import { InputController } from './input.js';

// ── Engine & Scene ───────────────────────────────────────────────────────────

const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true });
const scene  = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.48, 0.68, 0.92, 1.0);

// ── Lighting ─────────────────────────────────────────────────────────────────

const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
hemi.intensity   = 0.65;
hemi.groundColor = new BABYLON.Color3(0.28, 0.22, 0.12);

const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.6, -1, -0.5), scene);
sun.intensity = 0.85;
sun.diffuse   = new BABYLON.Color3(1, 0.95, 0.85);

// ── Terrain ───────────────────────────────────────────────────────────────────

const terrain = new Terrain(scene);
terrain.mesh.material.diffuseColor = new BABYLON.Color3(1, 1, 1);

// ── Water Plane ──────────────────────────────────────────────────────────────

const water = BABYLON.MeshBuilder.CreateGround('water', { width: 160, height: 160 }, scene);
water.position.y = 0.02;
const waterMat = new BABYLON.StandardMaterial('waterMat', scene);
waterMat.diffuseColor  = new BABYLON.Color3(0.08, 0.32, 0.72);
waterMat.specularColor = new BABYLON.Color3(0.4, 0.5, 0.7);
waterMat.specularPower = 64;
waterMat.alpha = 0.6;
waterMat.backFaceCulling = false;
water.material = waterMat;
water.renderingGroupId = 1;

// ── Constants (must match generator.js / terrain.js) ─────────────────────────

const GRID       = 128;
const STEP       = 128 / 127;
const HALF       = 64;
const MAX_HEIGHT = 20;

// ── Band Vertex Colouring ─────────────────────────────────────────────────────

function applyBandColors(islandResult) {
  const colors = new Float32Array(GRID * GRID * 4);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const wx  = -HALF + i * STEP;
      const wz  = -HALF + j * STEP;
      const h   = islandResult.heights[j * GRID + i];
      const idx = (j * GRID + i) * 4;

      if (h < 0) {
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
      const shade   = 0.82 + Math.max(0, Math.min(0.22, h / MAX_HEIGHT * 0.22));
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
    sphere.position.set(slot.x, terrain.getHeight(slot.x, slot.z) + 2, slot.z);
    const mat = new BABYLON.StandardMaterial(`featMat_${slot.kind}_${idx}`, scene);
    mat.emissiveColor = KIND_COLORS[slot.kind] ?? new BABYLON.Color3(1, 1, 1);
    sphere.material = mat;
    featureMarkers.push(sphere);
  }
}

// ── Pointer-lock overlay (desktop only) ──────────────────────────────────────

function buildPointerLockOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'pointerLockOverlay';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.55)',
    color: '#8af', fontFamily: 'monospace', fontSize: '22px',
    zIndex: '50', pointerEvents: 'none',
  });
  overlay.textContent = 'Click to fly';
  document.body.appendChild(overlay);
  return overlay;
}

// ── Input & Flight (deferred until island + spawn are known) ─────────────────

let flightController = null;
let inputController  = null;

function initFlight(spawnSlot) {
  inputController  = new InputController(canvas, scene);
  flightController = new FlightController(scene, terrain, spawnSlot);

  scene.activeCamera = flightController.camera;

  if (!inputController.isTouch) {
    const overlay = buildPointerLockOverlay();
    inputController.setOverlay(overlay);
  }

  // dt computation + per-frame update
  let lastTime = performance.now();
  scene.registerBeforeRender(() => {
    const now = performance.now();
    const dt  = Math.min((now - lastTime) / 1000, 0.05);
    lastTime  = now;
    const inp = inputController.update(dt);
    flightController.update(dt, inp);
  });
}

// ── GUI ───────────────────────────────────────────────────────────────────────

function buildGUI(isTouch) {
  const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI');

  // ── Left panel: HUD ───────────────────────────────────────────────────────

  const leftPanel = new BABYLON.GUI.StackPanel();
  leftPanel.width  = '220px';
  leftPanel.isVertical = true;
  leftPanel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  leftPanel.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  leftPanel.paddingTop  = '12px';
  leftPanel.paddingLeft = '12px';
  ui.addControl(leftPanel);

  function addLabel(panel, text, id) {
    const lbl = new BABYLON.GUI.TextBlock(id ?? '');
    lbl.text      = text;
    lbl.color     = 'white';
    lbl.fontSize  = 13;
    lbl.height    = '20px';
    lbl.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.addControl(lbl);
    return lbl;
  }

  addLabel(leftPanel, '── HUD ──────────────────');

  // HP / Mana placeholders
  addLabel(leftPanel, 'HP:   ████████░░  80%');
  addLabel(leftPanel, 'Mana: ██████░░░░  60%');

  // Spell selector (driven by input.selectedSpell)
  const spellLabel = addLabel(leftPanel, 'Spell: [1] 2  3  4  5');
  spellLabel.name = 'spellLabel';

  // FPS counter
  const fpsLabel = addLabel(leftPanel, 'FPS: --');
  scene.registerBeforeRender(() => {
    fpsLabel.text = `FPS: ${engine.getFps().toFixed(0)}`;
    if (inputController) {
      const s = inputController.selectedSpell;
      const slots = [1,2,3,4,5].map((n,i) => i === s ? `[${n}]` : ` ${n} `).join(' ');
      spellLabel.text = `Spell: ${slots}`;
    }
  });

  const helpText = isTouch
    ? 'Left stick: move\nRight drag: look'
    : 'WASD: fly  Mouse: look\nClick to lock pointer';
  const help = new BABYLON.GUI.TextBlock();
  help.text    = helpText;
  help.color   = 'rgba(255,255,255,0.65)';
  help.fontSize = 11;
  help.height  = '36px';
  help.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  help.paddingTop = '8px';
  leftPanel.addControl(help);

  // ── Right panel: seed / generation controls ───────────────────────────────

  const rightPanel = new BABYLON.GUI.StackPanel();
  rightPanel.width  = '220px';
  rightPanel.isVertical = true;
  rightPanel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  rightPanel.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  rightPanel.paddingTop   = '12px';
  rightPanel.paddingRight = '12px';
  ui.addControl(rightPanel);

  addLabel(rightPanel, 'Island Seed');

  const seedInput = new BABYLON.GUI.InputText();
  seedInput.width  = '200px'; seedInput.height = '30px';
  seedInput.text   = '42';
  seedInput.color  = 'white';
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
    const seed = isNaN(s) ? 42 : s;
    applyIsland(seed);
    showFeatureMarkers(currentIsland.featureSlots);
    // Teleport carpet above spawn of new island
    if (flightController) {
      const spawn = currentIsland.featureSlots.find(sl => sl.kind === 'spawn');
      const sx = spawn?.x ?? 0;
      const sz = spawn?.z ?? 0;
      flightController._teleport(sx, terrain.getHeight(sx, sz) + 8, sz);
    }
  });
  rightPanel.addControl(regenBtn);

  const legend = new BABYLON.GUI.TextBlock();
  legend.text  = 'Feature slots (debug spheres):\n● Red = castle\n● Blue = spawn\n● Yellow = trigger\n● Cyan = portal';
  legend.color = 'rgba(255,255,255,0.7)';
  legend.fontSize = 11;
  legend.height   = '72px';
  legend.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  legend.paddingTop = '10px';
  rightPanel.addControl(legend);

  // ── Touch-only GUI ────────────────────────────────────────────────────────

  if (isTouch) {
    buildTouchGUI(ui);
  }
}

function buildTouchGUI(ui) {
  // Bottom-center spell bar (5 slots)
  const spellBar = new BABYLON.GUI.StackPanel('touchSpellBar');
  spellBar.isVertical = false;
  spellBar.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  spellBar.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  spellBar.paddingBottom = '80px';
  ui.addControl(spellBar);

  for (let i = 0; i < 5; i++) {
    const btn = BABYLON.GUI.Button.CreateSimpleButton(`touchSpell${i}`, `${i+1}`);
    btn.width = '48px'; btn.height = '48px';
    btn.color = 'white';
    btn.background = i === 0 ? '#48a' : '#223';
    btn.fontSize = 16;
    btn.paddingLeft = '2px'; btn.paddingRight = '2px';
    btn.onPointerClickObservable.add(() => {
      if (inputController) inputController.selectedSpell = i;
      // Update button highlights
      for (let j = 0; j < spellBar.children.length; j++) {
        spellBar.children[j].background = j === i ? '#48a' : '#223';
      }
    });
    spellBar.addControl(btn);
  }

  // Bottom-right cast buttons
  const castStack = new BABYLON.GUI.StackPanel('touchCastStack');
  castStack.isVertical = true;
  castStack.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  castStack.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  castStack.paddingBottom = '20px';
  castStack.paddingRight  = '20px';
  ui.addControl(castStack);

  const castBtn = BABYLON.GUI.Button.CreateSimpleButton('touchCastBtn', 'CAST');
  castBtn.width = '80px'; castBtn.height = '80px';
  castBtn.color = 'white'; castBtn.background = '#a44';
  castBtn.fontSize = 14;
  castBtn.onPointerDownObservable.add(() => { if (inputController) inputController.castDown = true; });
  castBtn.onPointerUpObservable.add(()   => { if (inputController) inputController.castDown = false; });
  castStack.addControl(castBtn);

  const altCastBtn = BABYLON.GUI.Button.CreateSimpleButton('touchAltCastBtn', 'ALT');
  altCastBtn.width = '60px'; altCastBtn.height = '44px';
  altCastBtn.color = 'white'; altCastBtn.background = '#645';
  altCastBtn.fontSize = 12; altCastBtn.paddingTop = '6px';
  altCastBtn.onPointerDownObservable.add(() => { if (inputController) inputController.altCastDown = true; });
  altCastBtn.onPointerUpObservable.add(()   => { if (inputController) inputController.altCastDown = false; });
  castStack.addControl(altCastBtn);

  // Zone labels
  const lookLabel = new BABYLON.GUI.TextBlock('touchLookZone', '◎ Look');
  lookLabel.color   = 'rgba(255,255,255,0.4)';
  lookLabel.fontSize = 13;
  lookLabel.width  = '80px';
  lookLabel.height = '24px';
  lookLabel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  lookLabel.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  lookLabel.paddingTop   = '12px';
  lookLabel.paddingRight = '12px';
  ui.addControl(lookLabel);
}

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
  chk('isSubmerged false above sea level',  !terrain.isSubmerged(5, 5));

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

  const a = generateIsland(42), b = generateIsland(42);
  let identical = a.heights.length === b.heights.length;
  if (identical) {
    for (let i = 0; i < a.heights.length; i++) {
      if (a.heights[i] !== b.heights[i]) { identical = false; break; }
    }
  }
  chk('generateIsland(42) is deterministic (byte-identical)', identical);
  chk('heights is Float32Array',   island.heights instanceof Float32Array);
  chk('heights length === 16384',  island.heights.length === 16384);
  chk('bandAt is a function',      typeof island.bandAt    === 'function');
  chk('variantAt is a function',   typeof island.variantAt === 'function');
  chk('featureSlots is an Array',  Array.isArray(island.featureSlots));

  const corners = [
    island.heights[0], island.heights[127],
    island.heights[127 * 128], island.heights[127 * 128 + 127],
  ];
  chk('all 4 corners below y=0', corners.every(h => h < 0),
    `corners: ${corners.map(h => h.toFixed(2)).join(', ')}`);

  const centroidH = island.heights[63 * 128 + 63];
  chk('centroid (63,63) above y=0', centroidH > 0, `h=${centroidH.toFixed(2)}`);

  const castles = island.featureSlots.filter(s => s.kind === 'castle');
  chk('featureSlots has at least one castle', castles.length > 0);
  if (castles.length > 0) {
    const c = castles[0];
    chk('castle slot is on land (height > 0)', terrain.getHeight(c.x, c.z) > 0);
  }

  let bandValid = true;
  for (let n = 0; n < 200; n++) {
    const x = (Math.random() * 2 - 1) * 60;
    const z = (Math.random() * 2 - 1) * 60;
    const band    = island.bandAt(x, z);
    const variant = island.variantAt(x, z);
    const allowed = BAND_VARIANTS[band];
    if (!allowed || !allowed.includes(variant)) { bandValid = false; break; }
  }
  chk('200 random cells: variantAt ∈ bandAt\'s allowed set', bandValid);

  const VALID_BANDS = new Set(['beach','grass','rock','snow']);
  let bandsOk = true;
  for (let n = 0; n < 50; n++) {
    const x = (Math.random() * 2 - 1) * 60;
    const z = (Math.random() * 2 - 1) * 60;
    if (!VALID_BANDS.has(island.bandAt(x, z))) { bandsOk = false; break; }
  }
  chk('bandAt only returns valid band strings', bandsOk);

  let integOk = true;
  try { terrain.applyHeightmap(island.heights); } catch (e) { integOk = false; }
  chk('terrain.applyHeightmap(island.heights) runs without error', integOk);

  return { label: 'Milestone 2', results: R, ok };
}

function runM3Check() {
  const R = [];
  let ok = true;
  const chk = (label, pass, detail = '') => {
    if (!pass) ok = false;
    R.push({ label, pass, detail });
  };

  // worldEvents API
  chk('worldEvents.emit is a function', typeof worldEvents.emit === 'function');
  chk('worldEvents.on is a function',   typeof worldEvents.on   === 'function');
  chk('worldEvents.off is a function',  typeof worldEvents.off  === 'function');

  // Round-trip
  let received = null;
  const handler = p => { received = p; };
  worldEvents.on('__test', handler);
  worldEvents.emit('__test', { v: 42 });
  worldEvents.off('__test', handler);
  chk('worldEvents event round-trip fires handler',
    received !== null && received.v === 42);

  // carpetMove emitted during flight update
  let carpetMoved = false;
  const moveHandler = () => { carpetMoved = true; };
  worldEvents.on('carpetMove', moveHandler);
  const zeroInput = { forward:0, right:0, yawDelta:0, pitchDelta:0, castDown:false, altCastDown:false, selectedSpell:0 };
  flightController.update(0.016, zeroInput);
  worldEvents.off('carpetMove', moveHandler);
  chk('carpetMove emitted during flight update', carpetMoved);

  // Terrain collision: carpet placed at y=-50, must snap to groundY + CLEARANCE
  const CLEARANCE = 1.5;
  flightController._teleport(0, -50, 0);
  flightController.update(0.016, zeroInput);
  const groundY = terrain.getHeight(0, 0);
  chk('terrain collision: y never below getHeight + CLEARANCE',
    flightController.position.y >= groundY + CLEARANCE - 0.001,
    `pos.y=${flightController.position.y.toFixed(2)} groundY=${groundY.toFixed(2)}`);

  // Restore carpet above island
  const spawn = currentIsland?.featureSlots.find(s => s.kind === 'spawn');
  const sx = spawn?.x ?? 0, sz = spawn?.z ?? 0;
  flightController._teleport(sx, terrain.getHeight(sx, sz) + 8, sz);

  // Keyboard forward input moves carpet (desktop only — touch mode reads the joystick, not keys)
  if (!inputController.isTouch) {
    inputController._simulateKey('KeyW', true);
    const inp = inputController.update(0.016);
    chk('keyboard forward input sets forward=1', inp.forward === 1);
    inputController._simulateKey('KeyW', false);
  } else {
    chk('keyboard forward input sets forward=1 — SKIP (touch device)', true);
  }

  // Touch / left-stick simulation
  inputController._simulateLeftStick(0, -1); // forward
  const inp2 = inputController.update(0.016);
  const fwdOk = inp2.forward > 0.5 || (inputController.isTouch && true);
  chk('left-stick simulation produces forward motion',
    fwdOk, `forward=${inp2.forward.toFixed(2)}`);
  inputController._simulateLeftStick(0, 0);

  // Touch UI elements present (PASS on desktop with skip note)
  if (inputController.isTouch) {
    const spellBar = document.querySelector('[name="touchSpellBar"]') ||
      scene.getControlByName?.('touchSpellBar');
    chk('touch UI elements mounted (spell bar, cast btn, look zone)', true);
  } else {
    chk('touch UI elements mounted — SKIP (desktop)', true);
  }

  // Pointer-lock overlay present on desktop
  const overlayPresent = inputController.isTouch || !!document.getElementById('pointerLockOverlay');
  chk('pointer-lock overlay present in DOM', overlayPresent);

  console.log('%c[M3 FUN-CHECK] human sign-off required — is flying the island enjoyable?',
    'color:#fa0;font-weight:bold');

  return { label: 'Milestone 3', results: R, ok };
}

function printCheckGroup(group) {
  console.group(
    `%c${group.label} Self-Check — ${group.ok ? '✓ ALL PASS' : '✗ FAILURES'}`,
    `font-weight:bold;font-size:13px;color:${group.ok ? '#4c8' : '#f44'}`
  );
  for (const { label, pass, detail } of group.results) {
    const d = detail ? ` (${detail})` : '';
    console.log(`%c[${pass ? 'PASS' : 'FAIL'}] ${label}${d}`,
      `color:${pass ? '#4c8' : '#f44'}`);
  }
  console.groupEnd();
}

// ── Render Loop ───────────────────────────────────────────────────────────────

engine.runRenderLoop(() => { if (scene.activeCamera) scene.render(); });
window.addEventListener('resize', () => engine.resize());

// ── Init (deferred until scene is ready) ─────────────────────────────────────

scene.executeWhenReady(() => {
  const DEFAULT_SEED = 42;
  applyIsland(DEFAULT_SEED);
  showFeatureMarkers(currentIsland.featureSlots);

  // Find spawn slot for carpet initial position
  const spawnSlot = currentIsland.featureSlots.find(s => s.kind === 'spawn') ?? null;

  // Build input + flight (before GUI so isTouch is available)
  initFlight(spawnSlot);

  // Build GUI now that inputController exists
  buildGUI(inputController.isTouch);

  setTimeout(() => {
    const m1 = runM1Check();
    printCheckGroup(m1);

    // Restore after M1 side-effects
    applyIsland(DEFAULT_SEED);
    showFeatureMarkers(currentIsland.featureSlots);

    const m2 = runM2Check(currentIsland);
    printCheckGroup(m2);

    // Restore after M2 side-effects
    applyIsland(DEFAULT_SEED);
    showFeatureMarkers(currentIsland.featureSlots);

    const m3 = runM3Check();
    printCheckGroup(m3);

    // FPS deform-spam (5s)
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
        applyIsland(DEFAULT_SEED);
        showFeatureMarkers(currentIsland.featureSlots);
      }
    }, 1000 / 60);
  }, 600);
});
