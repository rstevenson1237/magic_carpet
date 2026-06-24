# Magic Carpet Clone — v1 Implementation Plan

> **Purpose of this document:** A complete, self-contained build plan intended to be handed to an agentic AI coding system. It is written so that an agent can execute milestone-by-milestone with no load-bearing ambiguity. Where a decision could reasonably go several ways, this document makes the call and states the fallback. **If you (the agent) find a genuine gap, prefer the simplest option consistent with the constraints in §2 and note the assumption in your output — do not silently invent large new systems.**

---

## 1. Project Brief

Build a modern, browser-based, low-poly homage to Bullfrog's *Magic Carpet* (1994). This is **not** a 1:1 recreation. The goal is to capture the elements that made the original engaging — momentum flight, destructive spell combat, real-time deformable terrain, a mana economy, and a find-and-destroy objective — at a deliberately reduced **single-island, single-session** scope.

The signature mechanic is **real-time, smooth terrain deformation as a byproduct of destructive spells** (craters, cleaved ground, raised earth). This is the heart of the clone; if it is cut or feels bad, the project fails its goal. It must be **smooth/continuous morphing, not terraced/stepped** — this matches the original engine's behavior.

---

## 2. Hard Constraints

| Constraint | Value |
|---|---|
| Language | JavaScript |
| Hosting | Static, self-hosted (GitHub Pages or local). **No backend server in v1.** |
| Build | No build step required; CDN-loaded libraries preferred. A lightweight Vite setup is acceptable if it stays static-exportable. |
| Players | Single-player v1. Multiplayer is a post-v1 stretch only. |
| Aesthetic | Low-poly. Flat/simple shading, chunky models. Low-poly is *correct*, not a compromise. |
| Platforms | Desktop **and** touch/mobile, designed in parallel. |
| Asset generation | Agentic-AI / free-tier-tool driven (see §3). |

---

## 3. Technology Stack

### 3.1 Engine — DECIDED: **Babylon.js**

The engine is **locked to Babylon.js**, resolved by the Milestone 0 capability audit (a desk check, not a build — see Milestone 0 for the full audit and rationale). Both engines are fully capable; neither was eliminable. The decision was made on **feasibility + extensibility across the later milestones**, explicitly *not* on "which is more fun" (fun is a function of game design, not the rendering library, and is gated later at Milestone 3 instead).

Why Babylon won — every *discriminating* capability points the same direction, and each is a system a later milestone needs:
- **Touch controls / GUI (M3):** Babylon ships a built-in `VirtualJoystick` class for touch plus a 2D GUI system (buttons, panels). Our entire §8 touch scheme maps onto native Babylon features; in Three.js all of it is hand-rolled or third-party.
- **Spatial audio + music (M8):** Babylon 8.0 (2025) ships a rewritten WebAudio-based audio engine where spatial sound is a single flag (`spatialSound: true`) and the audio listener auto-tracks the camera. Three.js leans on raw Web Audio / Howler with manual listener management.
- **Debugging velocity (solo + agentic):** Babylon's built-in Inspector / Scene Explorer materially speeds up diagnosing scene/asset issues — valuable for an agentic workflow. Three.js relies on third-party tools or browser devtools.
- **The non-discriminator:** real-time vertex-buffer terrain deformation (the highest-risk mechanic) is a genuine tie — equivalent effort in both — so it does not pull against the above.

### 3.2 Supporting tech
- **Audio:** Babylon's built-in (v2) audio engine — `spatialSound: true`, camera-tracked listener. No external audio library needed.
- **Physics:** Avoid a full physics engine for the carpet (custom arcade flight model). Babylon's bundled Havok integration may be used *only* if projectile/mana-ball motion genuinely needs it; prefer custom kinematics first.
- **Multiplayer (stretch only):** WebRTC P2P via PeerJS, 2-player, no server.

### 3.3 Asset pipeline
- **3D models — DEFAULT: CC0 low-poly packs** (Kenney.nl, Quaternius) for speed and consistency. **Hero assets only** (carpet, enemy castle) may use text-to-3D (Meshy / Tripo3D / Rodin free tiers) for distinctiveness, followed by Blender decimation/cleanup. *Rationale: the text-to-3D cleanup loop is the slowest, least predictable link; CC0 packs de-risk the schedule.*
- **Textures / 2D art / skyboxes:** Gemini.
- **Sound effects:** ElevenLabs (free-tier SFX mode).
- **Music:** Suno or Udio (free tiers); generate multiple takes for seamless looping.

---

## 4. Core Gameplay Loops

**Primary — Fly, Fight, Reshape:** Fly with momentum/banking/altitude. Cast destructive spells at creatures and structures. *Some* spells deform terrain on impact as a side effect (not a dedicated sculpt tool). The player creatively repurposes that deformation — e.g. lower land below sea level to flood and drown enemies, or pile earth into a causeway.

**Secondary — Mana economy:** Gather mana to fuel casting. Scarcity forces tactical choices.

**Objective — Find and destroy the enemy castle/lair:** The island's win condition.

**Connective — Triggers and portals:** Location-based trigger volumes (enter area → spawn enemies / change state / open access) and portals linking zones, optionally gated by trigger conditions. This is the puzzle backbone, distinct from terrain mechanics.

---

## 5. Key Systems Glossary (authoritative definitions)

- **Heightfield:** A single deformable mesh, 128×128 grid for v1 (revisit upward only after perf is confirmed). Stored as a 2D height array; deformation writes vertex Y values directly into the position buffer, then recomputes normals. **No camera-relative LOD/streaming** (not needed at single-island scope).
- **Deformation:** Smooth/continuous. A brush radius under the spell impact point raises/lowers heights with falloff. Some spells deform (tagged `deforms: true`), others are pure damage.
- **Water:** **v1 = a single flat translucent plane at sea level `y = 0`.** Any terrain below `y = 0` reads as submerged. This gives "flood by lowering land" almost for free. *(Stretch: true flood-fill into below-sea-level basins.)*
- **Material/resistance (optional, nice-to-have):** Elevation bands may carry a deformation-resistance value (rock resists, grass/sand yields) reusing band data. Cut if it complicates Milestone 1.
- **Mana:** Collectible spheres. Gathering adds to a pool; casting spends from it; slow passive regen. Mana balls **roll downhill** toward valleys (simple gravity-on-slope, not full physics).
- **Combat:** Player spells damage creatures/castle. Creatures damage the player. Player has health; reaching zero = lose-state (restart island). No permadeath/save in v1.
- **Triggers:** Invisible volumes that fire a scripted state change on entry (spawn wave, open portal, reveal castle weak point).
- **Portals:** Paired teleport volumes; entering one moves the carpet to its linked exit. May be gated by a trigger condition.

---

## 6. Concrete v1 Content Specification

### 6.1 Spell loadout (5 spells, fixed)
| # | Spell | Type | Deforms terrain? | Effect |
|---|---|---|---|---|
| 1 | **Fireball** | Offensive (precision) | No | Direct-damage projectile vs. creatures/castle. The reliable workhorse. |
| 2 | **Meteor** | Offensive (AoE) | **Yes** | Large impact: heavy damage + a crater (lowers terrain in a radius). Primary terraform tool. |
| 3 | **Quake** | Utility/terrain | **Yes** | Cleaves/lowers a line or area of ground; modest damage. Used to make moats/flood channels. |
| 4 | **Shield** | Defensive | No | Temporary damage reduction / projectile block on the carpet. |
| 5 | **Gather** | Utility | No | Claims/pulls nearby mana spheres to the player. |

Each spell record carries: `name, type, manaCost, cooldown, deforms (bool), deformRadius, deformDelta, damage, projectileSpeed`.

### 6.2 Enemies
- **Ground melee** — chases the player/own structures, attacks at close range. Idle + one blended attack animation.
- **Ranged** — keeps distance, fires projectiles, kites. Idle + one blended attack animation.

### 6.3 Objective & win/lose
- **Win:** Destroy the enemy castle (castle has health / a weak point exposed via a trigger).
- **Lose:** Player health reaches zero → restart the island.

### 6.4 Explicit scope cuts (conscious, not omissions)
- **Player's own castle / mana-quota balloon loop is CUT for v1.** Replaced by direct mana collection + enemy-castle destruction. *(Original's true core loop; reinstate in a later version.)*
- No save/load (single session, world resets on restart).
- No weather, day/night, or anaglyph/VR modes.
- No multiplayer (stretch).

---

## 7. Performance & Platform Targets

- **Target frame rate:** 60 FPS desktop; **≥ 30 FPS on a mid-range 2022-era phone**.
- **Triangle budget (rough):** terrain ~32k tris (128×128); keep total scene comfortably under ~150k tris on mobile. Decimate imported models aggressively.
- **Watch item:** flat regions of the heightfield waste vertices; keep the grid uniform for v1 but avoid pushing resolution past 128×128 until profiled on a phone.
- **World units convention:** 1 unit = 1 meter. Sea level at `y = 0`. Carpet cruising altitude ~5–15 units. Document and keep consistent.

---

## 8. Controls Specification

**Desktop:** WASD = move (forward/back/strafe), mouse = look/bank, left-click = cast selected spell, right-click = secondary/alt cast, number keys 1–5 = select spell.

**Touch (parallel, equal priority):**
- Left thumb zone: virtual stick = movement.
- Right side: drag = look/bank.
- Bottom-right fixed button cluster (thumb-reachable without abandoning look-drag): primary + secondary cast.
- Spell selection: tap-to-select radial/row UI (a deliberate separate tap — **not** a held modifier; this is the one place touch intentionally diverges from desktop, and that's acceptable).

---

## 9. Global Coding Conventions (apply to every milestone)

1. Each milestone produces a **runnable artifact** (open in browser, no build step ideally) plus a short README of what it does and how to test it.
2. Keep systems modular: terrain, generation, flight, input, spells, mana, combat, AI, triggers/portals, audio, UI each in their own module.
3. State that *might* later need network sync (positions, terrain edits, spawns) should be funneled through clear update functions, not scattered — keeps the multiplayer stretch cheap without designing for it now.
4. No browser `localStorage`/`sessionStorage` reliance for core state in v1.
5. Comment the non-obvious math (deformation falloff, normal recompute, flight kinematics).
6. After each milestone, **stop and report**: what was built, how to test, what (if anything) was assumed, and any acceptance criteria not met.

---

## 10. Shared Interface Contract (cross-module — DO NOT diverge)

> These are the **seams between modules** — the data shapes and function signatures that more than one milestone touches. They are fixed *contracts*, not implementation guidance: an agent must honor these exact shapes so a later milestone's module plugs into an earlier one's without translation. **The interior of each module (algorithms, private data structures, helper functions) is deliberately left to the agent** — do not over-specify internals. If a contract below genuinely needs to change mid-build, change it *here first* and note it, so all dependent milestones stay consistent.

### 10.1 Coordinate & world conventions
- Right-handed, Y-up. 1 unit = 1 meter. Sea level `y = 0`. Terrain spans the XZ plane, centered on origin.
- Grid indices `(i, j)` run `0..127` on X and Z. World position of a grid cell and the inverse (world→cell) must be exposed as helpers; everything else uses world coordinates, not grid indices, at module boundaries.

### 10.2 Terrain module (produced M1, consumed by M2/M4/M6/M7)
```
heights: Float32Array        // length 128*128, row-major, index = j*128 + i, value = height in world units
terrain.getHeight(x, z) -> number            // bilinear-sampled world height at a world XZ
terrain.raise(x, z, radius, strength) -> void   // smooth radial falloff, recomputes normals
terrain.lower(x, z, radius, strength) -> void   // strength is positive; lower subtracts
terrain.applyHeightmap(heights) -> void      // swap in a full 128*128 Float32Array (used by generator)
terrain.isSubmerged(x, z) -> boolean         // true if getHeight < 0
```
- `raise`/`lower` take **world** XZ and **world-unit** radius/strength, not grid units.
- After any edit, normals are recomputed inside the module; callers never touch normals.

### 10.3 Generator output (produced M2, consumed by M1 + M7)
```
generateIsland(seed) -> {
  heights: Float32Array,     // 128*128, drops straight into terrain.applyHeightmap
  bandAt(x, z) -> 'beach'|'grass'|'rock'|'snow',     // primary elevation band
  variantAt(x, z) -> string, // secondary biome variant within the band's allowed set
  featureSlots: Array<{ x, z, kind: 'castle'|'portal'|'trigger'|'spawn', meta? }>  // M2 fills this hook; M7 consumes
}
```
- Same `seed` must reproduce identical output (deterministic).

### 10.4 Spell record (defined M4, referenced by M6/M8)
```
Spell = { id, name, type, manaCost, cooldown, deforms: boolean,
          deformRadius, deformDelta, damage, projectileSpeed }
```
- Deforming spells call `terrain.raise/lower` at impact world XZ using `deformRadius`/`deformDelta`. Non-deforming spells must not touch the terrain module.

### 10.5 Entity & combat contract (M6/M7)
```
damageable.takeDamage(amount, sourceId?) -> void
damageable.health -> number        // <= 0 means destroyed (creature) or lost (player) or won (castle)
spawnCreature(kind, x, z) -> id     // kind: 'melee'|'ranged'
```

### 10.6 World-state event bus (M3 onward — enables the multiplayer stretch cheaply)
All state changes that another module (or, later, a network peer) must observe go through **one** dispatch point, never scattered mutations:
```
worldEvents.emit(type, payload)     // types: 'terrainEdit','spellCast','spawn','damage','portalUse','win','lose'
worldEvents.on(type, handler)
```
- Milestone 3 stands this up; every later milestone routes its cross-module state changes through it. This is the §9.3 convention made concrete — honoring it is what keeps Milestone 10 (multiplayer) near-free.

---

## 11. Development Milestones

Each milestone below includes a ready-to-use **AGENT PROMPT** block and an **agent-runnable self-check**. Run them in order. **A milestone is "done" only when its self-check passes** — the agent runs the self-check itself before reporting completion; do not advance on human-judged impressions alone.

---

### Milestone 0 — Engine Decision — ✅ COMPLETE (Babylon.js)

**Status:** Resolved by capability audit (desk check). **No build was required** and none should be done — the audit was decisive, so the conditional spike was not triggered.

**Method:** Feasibility + extensibility audit, mapping every system the later milestones require against both engines (native / library / hand-rolled). The target was "which engine lets an agent build the deformation core *and* carry it through the later systems with the fewest bolt-ons," **not** "which is more fun" (fun depends on game design, not the library, and is gated at Milestone 3).

**Result:** No row eliminated either engine — both are fully capable. But every *discriminating* row pointed to Babylon.js, and each is a system a later milestone needs:

| Discriminating system | Verdict |
|---|---|
| Touch controls / GUI (M3, §8) | **Babylon** — built-in `VirtualJoystick` + 2D GUI buttons; Three.js hand-rolls all of it |
| Spatial audio + music (M8) | **Babylon** — v2 audio engine, `spatialSound:true`, camera-tracked listener; Three.js uses raw Web Audio/Howler |
| Debugging velocity (solo+agentic) | **Babylon** — built-in Inspector / Scene Explorer; Three.js third-party only |
| Terrain deformation (M1, highest risk) | **Tie** — equivalent effort both; does not pull against the above |

**Decision: Babylon.js, locked.** All subsequent milestones target Babylon.

> **No agent action required for this milestone.** Proceed directly to Milestone 1. (If, during M1, the deformation loop in Babylon proves unexpectedly problematic — not anticipated — the only fallback worth revisiting would be a Three.js deformation spike, but treat that as a remote contingency, not a planned step.)

---

### Milestone 1 — Terrain Deformation Core

**Goal:** Production-quality smooth, real-time deformable heightfield in Babylon.js.

**Build:** A reusable terrain module: 128×128 grid, 2D height array backing store, brush-based raise/lower with configurable radius/strength/falloff, correct normal recompute, smooth (never terraced) result. Add a flat translucent water plane at `y=0` and treat sub-zero terrain as submerged. Include a debug fly camera and on-screen brush controls.

**Acceptance:** Deformation is smooth and responsive at 128×128 with no major frame drops on a mid-range phone; lowering terrain below `y=0` visibly floods (plane occludes it); module exposes the §10.2 contract exactly.

**Self-check (agent-runnable):**
- Assert the module exposes `getHeight`, `raise`, `lower`, `applyHeightmap`, `isSubmerged` with the §10.2 signatures.
- Script: record `getHeight(x,z)`, call `raise(x,z,5,3)`, assert new `getHeight` increased; call `lower` past zero, assert `isSubmerged(x,z) === true`.
- Assert `heights` is a `Float32Array` of length 16384.
- Log measured FPS over a 5-second deform-spam loop; assert ≥30 on a throttled (4×-CPU) profile.
- Visual smoke: render a frame after a deform and confirm normals updated (no flat-shaded artifact at the crater rim).

> **AGENT PROMPT — Milestone 1:**
> "Using Babylon.js, build a reusable terrain module: a 128×128 deformable heightfield backed by a 2D height array, with `raise(x,z,radius,strength)` and `lower(...)` functions that write vertex Y values (via `updateVerticesData`) with smooth radial falloff and recompute normals each edit. Deformation must be smooth/continuous — never terraced. Add a flat translucent water plane at y=0 so any terrain pushed below y=0 appears submerged. Provide a debug fly camera and simple Babylon GUI sliders for brush radius/strength. Target ≥30 FPS on a mid-range phone. Output a runnable artifact + README."

---

### Milestone 2 — Procedural Generation Pipeline

**Goal:** Generate the v1 island, feeding the Milestone 1 terrain.

**Build:** A 4-stage generator: (1) **heightmap** via Simplex/Perlin noise; (2) **broad layout** — single-island via radial island-mask falloff (architect cleanly so multi-island/landlocked could be added later, but only implement single-island); (3) **terrain typing** — elevation bands (beach→grass→rock→snow) as the *primary* authoritative signal, plus a *secondary* lower-frequency noise map that selects a biome *variant within the band's allowed set* (e.g. grass→forest/plain/swamp), so the two systems never conflict (elevation is strictly dominant); (4) **feature-placement hook** — a stubbed, well-defined insertion point for castle/portals/triggers/spawns (full placement designed in M7). Optional: per-band deformation-resistance value.

**Acceptance:** Generator reliably outputs a playable single island (land in the middle, water at edges); bands and biome variants render distinctly; output matches the §10.3 contract and drops directly into `terrain.applyHeightmap`; a seed reproduces the same island.

**Self-check (agent-runnable):**
- Determinism: call `generateIsland(42)` twice; assert the two `heights` arrays are byte-identical.
- Contract: assert returned object has `heights` (Float32Array len 16384), `bandAt`, `variantAt`, `featureSlots`.
- Island sanity: assert the 4 map corners are below `y=0` (water) and the centroid is above `y=0` (land); assert `featureSlots` contains at least one `'castle'`-eligible slot on land above `y=0`.
- Band validity: sample 200 random cells; assert every `variantAt` is within its `bandAt`'s allowed-variant set (no snow-swamp, etc.).
- Integration: feed `heights` into a Milestone-1 terrain instance via `applyHeightmap` without error.

> **AGENT PROMPT — Milestone 2:**
> "Build a procedural island generator that outputs a height array compatible with the Milestone 1 terrain module. Stages: (1) noise-based heightmap (Simplex/Perlin, seedable); (2) single-island layout using a radial island-mask falloff — structure the code so other layout types could be added later, but implement only single-island; (3) elevation-band terrain typing (beach→grass→rock→snow) as the primary signal, plus a secondary low-frequency noise map that picks a biome *variant within each band's allowed set* so elevation always dominates and the two never conflict; (4) a clearly-marked, stubbed feature-placement hook for later castle/portal/trigger/spawn insertion. Make generation reproducible from a seed. Output a runnable demo showing a generated, colored island in the M1 terrain, plus README."

---

### Milestone 3 — Flight & Dual-Platform Controls

**Goal:** Momentum flight that feels good on desktop and touch, over generated terrain.

**Build:** Arcade flight controller (velocity, banking, drag, altitude) — *not* realistic. Desktop input (WASD + mouse-look + click) and touch layer (dual virtual stick + fixed cast buttons + tap-to-select radial) per §8. Carpet collides softly with terrain (no clipping through mountains; gentle push-up or stop, no harsh physics). **Early fun-check:** flying around the generated island must already feel good here.

**Acceptance:** Flight reads as arcadey (not floaty/twitchy) on both schemes; touch controls are comfortable one-thumb-per-zone; carpet doesn't clip through terrain; the §10.6 `worldEvents` bus exists and at least one event (e.g. carpet move or a test `terrainEdit`) flows through it; an informal "is this fun to fly?" check passes before proceeding.

**Self-check (agent-runnable):**
- Assert `worldEvents.emit` / `worldEvents.on` exist; register a listener, emit a test event, assert the handler fired with the payload intact.
- Collision: script the carpet flying toward a raised peak; assert its `y` never drops below `terrain.getHeight(x,z)` plus the clearance constant.
- Dual-input parity: assert both a simulated key event and a simulated virtual-stick delta move the carpet (neither input path is dead).
- Touch presence: on a touch-emulated viewport, assert the left stick, look-zone, cast buttons, and spell radial are all mounted in the DOM/GUI.
- The "is it fun?" gate stays human-judged and is called out as such — it does not block the automated checks but must be consciously signed off.

> **AGENT PROMPT — Milestone 3:**
> "Build an arcade flight controller for the carpet over the generated island (momentum, banking, drag, altitude control — arcadey, not a realistic flight sim). Implement both input schemes in parallel: desktop (WASD move, mouse look/bank, left-click cast, 1–5 select) and touch (left virtual stick move, right-side drag look, bottom-right fixed cast buttons, tap-to-select spell radial). Add soft terrain collision so the carpet can't clip through mountains. Output a runnable artifact where flying over the M2 island already feels good on both desktop and touch, plus README."

---

### Milestone 4 — Spell System, Mana & Deformation Coupling

**Goal:** The 5-spell loadout, the mana economy, and the spell→terrain-deformation link.

**Build:** Spell data records per §6.1. Casting spends mana; mana spheres are collectible, roll downhill, and regen slowly. Deforming spells (Meteor, Quake) call the M1 `raise/lower` functions at impact; non-deforming spells (Fireball, Shield, Gather) do not. Wire spell selection to both input schemes.

**Acceptance:** All 5 spells castable on both platforms; mana cost/regen feels meaningful; Meteor visibly craters terrain and Quake cleaves it; lowering terrain below `y=0` with these spells floods the area; Gather pulls nearby mana; spell casts emit through `worldEvents` ('spellCast').

**Self-check (agent-runnable):**
- Assert exactly 5 spell records exist, each matching the §10.4 shape; assert `deforms` is true only for Meteor and Quake.
- Mana: set pool to a known value, cast a spell, assert pool decreased by exactly `manaCost`; assert a cast is rejected when pool < `manaCost`.
- Deform coupling: cast Meteor at `(x,z)`; assert `terrain.getHeight(x,z)` dropped by ~`deformDelta` within `deformRadius`, and that a non-deforming spell (Fireball) leaves `getHeight` unchanged.
- Flood: cast Quake to push a patch below 0; assert `terrain.isSubmerged` flips true there.
- Gather: place mana spheres near the player, cast Gather, assert their count-in-pool rose; assert spheres on a slope have non-zero downhill displacement over time.
- Assert each cast fired one `worldEvents` 'spellCast'.

> **AGENT PROMPT — Milestone 4:**
> "Implement the 5-spell system (Fireball, Meteor, Quake, Shield, Gather) per the spell table, each with manaCost/cooldown/damage and a `deforms` flag. Build the mana economy: collectible mana spheres that roll downhill toward valleys, a spend-on-cast pool, and slow passive regen. Deforming spells (Meteor, Quake) must call the Milestone 1 raise/lower functions at their impact point with the spell's radius/delta; lowering terrain below y=0 should flood it. Wire spell selection + casting to both desktop (1–5 + click) and touch (radial + buttons). Output a runnable artifact + README."

---

### Milestone 5 — Asset Pipeline Production

**Goal:** The actual v1 art, low-poly and mobile-budget.

**Build:** Source/produce: carpet, 2 creature types, enemy castle, mana sphere, basic environment props. **Default to CC0 packs (Kenney/Quaternius); use text-to-3D only for hero assets (carpet, castle), then decimate in Blender.** Each creature needs idle + one blended attack animation. Generate textures/skybox (Gemini). Confirm all imports at target tri-budget.

**Acceptance:** All required assets in-engine, low-poly, within the §7 tri-budget, ≥30 FPS on mobile with full scene; creatures animate (idle + attack); a documented import/cleanup workflow exists. **If text-to-3D output proves too messy to clean efficiently, fall back fully to CC0 packs.**

**Self-check (agent-runnable):**
- Asset presence: assert carpet, melee creature, ranged creature, castle, and mana sphere meshes all load without error.
- Tri-budget: sum scene triangle count with one of everything placed; assert total < 150k; assert each imported model is under its per-asset cap.
- Animation: assert each creature exposes named `idle` and `attack` animation groups, and that switching between them runs without throwing.
- Perf: load the full asset set and log FPS on a throttled profile; assert ≥30.
- Provenance: assert a manifest file lists each asset's source (CC0 pack vs text-to-3D) and license.

> **AGENT PROMPT — Milestone 5:**
> "Assemble the v1 low-poly art set: carpet, two creature types (melee, ranged), enemy castle, mana sphere, and a few environment props. Prefer CC0 low-poly packs (Kenney, Quaternius) for speed/consistency; use text-to-3D (Meshy/Tripo/Rodin free tier) only for the carpet and castle, decimated in Blender to fit the triangle budget in §7. Give each creature an idle and one attack animation. Generate ground/rock textures and a skybox. Import everything into the engine, confirm ≥30 FPS on mobile with the full scene, and document the import/cleanup steps. If text-to-3D cleanup is too costly, use CC0 assets throughout."

---

### Milestone 6 — Creature AI & Combat

**Goal:** Two distinct, threatening enemies and full combat resolution.

**Build:** Melee AI (seek + close-range attack) and ranged AI (kite + projectile) using simple steering + line-of-sight (no heavy pathfinding at this scope). Combat: player spells damage creatures; creatures damage the player; player health + lose-state (restart island) per §6.3. Hook attack animations from M5.

**Acceptance:** Both creature types behave distinctly and pose a real threat; combat resolves cleanly both ways; player death restarts the island; no pathfinding stalls; damage flows through the §10.5 contract and emits `worldEvents` ('damage').

**Self-check (agent-runnable):**
- Contract: assert creatures and the player implement `takeDamage`/`health`; assert `spawnCreature('melee'|'ranged', x, z)` returns an id.
- Melee behavior: spawn a melee creature distant from the player; assert its distance-to-player decreases over time (it seeks).
- Ranged behavior: spawn a ranged creature; assert it maintains a standoff distance (doesn't close to melee range) and that it emits projectile events.
- Damage resolution: apply player spell damage to a creature; assert `health` dropped and at `<=0` the creature despawns. Apply creature damage to the player; assert player `health` dropped and at `<=0` a `worldEvents` 'lose' fires and the island restarts.
- Stall guard: run 60s headless with several creatures; assert no frame exceeds a time budget (no pathfinding hang).

> **AGENT PROMPT — Milestone 6:**
> "Implement two enemy AIs over the island: a melee type (steer toward target, attack at close range) and a ranged type (maintain distance, fire projectiles, kite), using simple steering + line-of-sight rather than full pathfinding. Implement combat resolution: player spells damage enemies, enemies damage the player, the player has health, and reaching zero restarts the island. Trigger the M5 attack/idle animations appropriately. Output a runnable artifact + README."

---

### Milestone 7 — Castle, Triggers, Portals & Win Condition

**Goal:** The objective and the puzzle/connective layer; fill the M2 feature-placement hook.

**Build:** Place the enemy castle via the generator's feature hook (algorithmic: flat-enough ground, minimum distance from spawn). Castle has health / a weak point exposed by a trigger. Implement trigger volumes (entry → spawn wave / state change / reveal weak point) and paired portals (teleport, optionally trigger-gated). Win on castle destruction.

**Acceptance:** Full loop completable — fly → use terrain/spells to navigate and fight → trigger fires → portal/weak-point opens → destroy castle → win screen. Castle never spawns underwater or unreachable. Triggers/portals/win route through `worldEvents`.

**Self-check (agent-runnable):**
- Placement: across 10 seeds, assert the castle slot is always on land (`getHeight > 0`) and at least the minimum distance from spawn; assert no seed places it submerged.
- Trigger: script entering a trigger volume; assert the bound effect fires exactly once and emits `worldEvents` (e.g. 'spawn' or weak-point reveal).
- Portal: enter portal A; assert the carpet's position is teleported to portal B's exit; assert a gated portal does nothing until its trigger condition is met.
- Win path: script the full sequence (reach trigger → expose weak point → apply damage to castle until `health<=0`); assert a single `worldEvents` 'win' fires and the win screen mounts.
- Reachability: assert a path exists (flight-reachable, not blocked by impassable water) from spawn to the castle on each tested seed.

> **AGENT PROMPT — Milestone 7:**
> "Fill the Milestone 2 feature-placement hook: place the enemy castle algorithmically (flat-enough ground, minimum distance from player spawn, never underwater). Give the castle health and a weak point that a trigger exposes. Implement trigger volumes (on entry: spawn a creature wave, change state, or reveal the weak point) and paired teleport portals (optionally gated behind a trigger). Add a win condition + win screen on castle destruction. Ensure the full loop — fly, fight, trigger, destroy castle — is completable. Output a runnable artifact + README."

---

### Milestone 8 — Audio & Atmosphere

**Goal:** Make the island feel alive.

**Build:** Ambient music bed (Suno/Udio), spell/combat/creature SFX (ElevenLabs), spatial audio for positional cues, ambient wind/water loop. Optional: a combat-vs-calm music shift like the original.

**Acceptance:** Looping ambient track (seamless), spell casts and creature actions have audio feedback, spatial audio places sounds correctly.

**Self-check (agent-runnable):**
- Assert the ambient track is configured to loop and that its loop start/end produce no gap (duration matches the buffer; loop flag set).
- Event-to-sound wiring: subscribe a test listener; emit `worldEvents` 'spellCast' and 'damage'; assert a sound instance is triggered for each.
- Spatial: place a positioned sound at a world point, move the camera/listener closer, assert the computed gain increases (attenuation responds to distance).
- Assert no audio asset fails to load and total audio payload is within a stated size budget.

> **AGENT PROMPT — Milestone 8:**
> "Add audio: a seamless ambient fantasy music loop (Suno/Udio), spell-cast and impact SFX, creature attack/death SFX, and ambient wind/water (ElevenLabs free-tier SFX). Use the engine's spatial audio for positional cues. Optionally shift to a tenser track during combat. Output the integrated build + README listing the audio assets and tools used."

---

### Milestone 9 — Polish, Balance & Generator Tuning

**Goal:** Ship-quality v1.

**Build:** Tune the generator so it *reliably* produces a fun island (a genuine terrain/flood opportunity AND a genuine combat set-piece, not incidental coexistence). Balance mana costs, spell damage, enemy difficulty, castle health. Full performance pass on desktop and a real phone. Bug pass. Add minimal onboarding (the original taught nothing — a *little* more is fine: a one-line objective prompt).

**Acceptance:** Multiple generated seeds each yield a playable, fun, completable island; balance feels fair; ≥30 FPS mobile / 60 FPS desktop sustained; no blocking bugs.

**Self-check (agent-runnable):**
- Completability sweep: across ≥10 seeds, run the M7 win-path script headlessly; assert every seed is completable (castle reachable, win reachable).
- Content guarantee: per seed, assert at least one below-sea-level-adjacent region exists (terrain/flood opportunity) AND at least one creature cluster near the objective (combat set-piece).
- Perf: sustained 60s capture on desktop and a throttled mobile profile; assert FPS floors hold (≥30 mobile / ≥60 desktop) with no single frame over budget.
- Regression: re-run the M1–M8 self-checks; assert all still pass after balance/tuning changes.
- The subjective "fun/fair" judgment remains human-signed-off and is flagged as the one non-automatable gate.

> **AGENT PROMPT — Milestone 9:**
> "Polish pass: tune the generator across multiple seeds so each reliably produces a completable, fun island with at least one terrain/flood opportunity and one combat set-piece. Balance mana costs, spell damage, enemy difficulty, and castle health. Profile and fix performance to sustain 60 FPS desktop / ≥30 FPS on a real mid-range phone. Fix blocking bugs. Add a minimal one-line objective prompt at island start. Output the polished build + a short release-notes README."

---

### Milestone 10 — Multiplayer (STRETCH, post-v1 only)

**Goal:** Optional 2-player mode, only if v1 is stable.

**Build:** WebRTC P2P (PeerJS), 2-player co-op or competitive. Sync carpet positions, spell casts, terrain edits, spawns by mirroring the §10.6 `worldEvents` bus across the connection. No dedicated server.

**Acceptance:** Two browsers connect P2P; both see synced terrain deformation, flight, and combat with acceptable latency. **Do not start unless v1 is shipped and stable.**

**Self-check (agent-runnable):**
- Assert that mirroring `worldEvents` from peer A produces the same emitted events on peer B (terrainEdit, spellCast, spawn, damage replay identically).
- Loopback test: connect two local clients; deform terrain on A; assert B's `terrain.heights` converges to A's within a tolerance.
- Assert single-player still passes all its M1–M9 self-checks with the multiplayer module disabled (strictly additive).

> **AGENT PROMPT — Milestone 10 (only after v1 ships):**
> "Add an optional 2-player WebRTC P2P mode via PeerJS (no server). Sync carpet positions, spell casts, terrain deformation, and enemy spawns through the existing state-update functions. Support co-op or simple competitive play. Keep it strictly additive — must not destabilize single-player. Output the build + connection instructions."

---

## 12. Open Design Items (decide as encountered, low risk)
- Exact deformation falloff curve (linear vs. smoothstep) — pick smoothstep; tune by feel.
- Whether per-band deformation resistance ships in v1 — include only if free; else cut.
- Secondary/right-click desktop action — default to "alt-cast of selected spell"; revisit if a clearer use emerges.
- True flood-fill water — stretch; flat plane is the v1 answer.
