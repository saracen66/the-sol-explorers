// Helmet view: stand on the HiRISE terrain at eye height and walk it.
//
// - Relief at true scale (exaggeration 1), eye 1.8 m above the 1 m DTM.
// - Mars sky dome with the Sun at its real position for the chosen local time.
// - The horizon is not painted: for every compass direction we march the CTX
//   crater DEM outward (with Mars curvature) and keep the highest angle, so the
//   crater rim and delta scarp sit where they really are.
// - Walking burns suit O₂ with the same Pandolf model the planner uses, sped up
//   by an honest, displayed time warp.
// - During an EVA simulation the camera rides with EV1.
import * as THREE from 'three';
import { skyVert, skyFrag, ringVert, ringFrag } from './shaders.js';
import { walkSpeed, metabolicW, o2KgPerSec } from './eva.js';
import { formatHM, earthMarsLightTime } from '../lib/marstime.js';
import { fmtDist, fmtNum, fmtLat, fmtLon } from '../lib/geo.js';
import { sampleAt } from './Planner.js';
import { Joystick } from '../ui/Joystick.js';

const EYE = 0.0018;          // km
const RING_R = 8;            // km, radius of the horizon ring (moves with the camera)
const R_MARS_M = 3389500;
const WARPS = [1, 4, 8, 16, 32];
const MARS_HOUR_S = 3698.9;  // Earth seconds in one Mars hour
const _fwd = new THREE.Vector3();

export class FirstPerson {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.yaw = 0;
    this.pitch = -0.05;
    this.fov = 62;
    this.pos = { x: 0, z: 0 };
    this.warpIdx = 2;
    this.walkTo = null;
    this.follow = false;
    this.dead = null;
    this.o2Used = 0;
    this.walked = 0;
    this.hudAt = 0;
  }

  get view() { return this.app.site; }
  get warp() { return WARPS[this.warpIdx]; }

  // ------------------------------------------------------------------ build (once)
  build() {
    if (this.sky) return;
    const v = this.view;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(30, 48, 24), new THREE.ShaderMaterial({
      vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false,
      uniforms: { uSun: v.uniforms.uSun },
    }));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.ring = new THREE.Mesh(this.horizonGeometry(), new THREE.ShaderMaterial({
      vertexShader: ringVert, fragmentShader: ringFrag, side: THREE.DoubleSide,
      uniforms: { uSun: v.uniforms.uSun, uFogCol: v.uniforms.uFogCol },
    }));
    this.ring.frustumCulled = false;
    this.ring.renderOrder = -5;
    this.buildHud();
  }

  /** Real skyline from the CTX DEM around the Marswalk zone. */
  horizonGeometry() {
    const c = this.app.crater, s = this.view;
    const ll = s.xzToLonLat(0, 0);
    const o = c.lonlatToXZ(ll.lat, ll.lon);
    const eye = s.h0 + 2;
    const N = 360;
    const pos = [], dist = [], top = [], idx = [];
    this.skyline = new Float32Array(N);
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2; // bearing clockwise from north
      const dx = Math.sin(th), dz = -Math.cos(th);
      let best = -0.25, bestD = 20;
      for (let d = 2.6; d <= 46; d += 0.12) {
        const x = o.x + dx * d, z = o.z + dz * d;
        if (Math.abs(x) > c.sizeX / 2 || Math.abs(z) > c.sizeZ / 2) break;
        const dm = d * 1000;
        const drop = (dm * dm) / (2 * R_MARS_M);
        const a = Math.atan2(c.elevAt(x, z) - eye - drop, dm);
        if (a > best) { best = a; bestD = d; }
      }
      if (i < N) this.skyline[i] = best;
      const yTop = RING_R * Math.tan(best), yBot = -RING_R * Math.tan(0.3);
      pos.push(dx * RING_R, yTop, dz * RING_R, dx * RING_R, yBot, dz * RING_R);
      dist.push(bestD, bestD);
      top.push(1, 0);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
    g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
    g.setIndex(idx);
    return g;
  }

  buildHud() {
    const el = document.createElement('div');
    el.id = 'helmet';
    el.className = 'helmet';
    el.innerHTML = `
      <div class="visor"></div>
      <div class="h-compass"><div class="h-tape" id="h-tape"></div><i class="h-caret"></i><b id="h-hdg">000°</b></div>
      <button class="btn ghost h-exit" id="h-exit">✕ EXIT HELMET VIEW</button>
      <div class="h-cross"></div>
      <div class="h-suit" id="h-suit"></div>
      <div class="h-nav" id="h-nav"></div>
      <div class="h-warp" id="h-warp"><button data-w="-1" aria-label="Slower time warp" title="Slower ( [ )">−</button><span id="h-warp-v">TIME ×8</span><button data-w="1" aria-label="Faster time warp" title="Faster ( ] )">+</button></div>
      <div class="h-note" id="h-note"></div>
      <div class="h-dead" id="h-dead"></div>
      <div class="h-rotate" id="h-rotate"><b>⟲</b><span>Turn your phone sideways.<small>The helmet view has joysticks made for two thumbs.</small></span><div class="btn-row"><button class="btn small" id="h-portrait">STAY IN PORTRAIT</button><button class="btn small" id="h-rot-exit">✕ EXIT HELMET VIEW</button></div></div>`;
    document.getElementById('hud').appendChild(el);
    this.el = el;
    el.querySelector('#h-exit').onclick = () => this.exit();
    el.querySelector('#h-warp').onclick = (e) => {
      const b = e.target.closest('[data-w]');
      if (b) this.setWarp(this.warpIdx + +b.dataset.w);
    };
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.stopPropagation(); });
    el.querySelector('#h-portrait').onclick = () => document.body.classList.add('fpv-portrait-ok');
    el.querySelector('#h-rot-exit').onclick = () => this.exit();
    // phones and tablets: game-style twin sticks, left walks, right looks
    if (this.app.touch) {
      this.moveStick = new Joystick(el, 'left', 'MOVE');
      this.lookStick = new Joystick(el, 'right', 'LOOK');
    }
  }

  /** On phones, go fullscreen and lock to landscape where the browser allows it (Android).
   *  Elsewhere (iPhone Safari) the rotate prompt asks instead. Needs a user tap. */
  async goLandscape() {
    if (!this.app.touch || Math.min(this.app.w, this.app.h) > 600 || !navigator.userActivation?.isActive) return; // phones only
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        this.ownFullscreen = true;
      }
      await screen.orientation?.lock?.('landscape');
    } catch { /* not allowed here: the rotate prompt covers it */ }
  }

  leaveLandscape() {
    try { screen.orientation?.unlock?.(); } catch { /* ignore */ }
    if (this.ownFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    this.ownFullscreen = false;
  }

  // ------------------------------------------------------------------ enter / exit
  /** Stand at (x, z). Facing: toward the next plan stop, else north-west over the delta. */
  enter(x, z, yaw) {
    const a = this.app, v = this.view;
    if (a.mode !== 'site' || a.busy) return;
    this.build();
    this.goLandscape();
    a.pin?.close();
    a.planner.addMode = false;
    if (x == null) { const lz = a.planner.waypoints[0] || { x: 0, z: 0 }; x = lz.x; z = lz.z; }
    this.pos = { x, z };
    if (yaw == null) {
      const next = a.planner.waypoints[1];
      yaw = next ? Math.atan2(next.x - x, -(next.z - z)) : -0.8;
    }
    this.yaw = yaw;
    this.pitch = -0.04;
    this.walkTo = null;
    this.dead = null;
    this.o2Used = 0;
    this.walked = 0;
    this.warned = false;
    this.clock = v.ltst;
    this.prevExag = v.exagTarget;
    this.active = true;
    v.fpvOn = true;
    v.exagTarget = 1;
    v.exag = 1;
    v.uniforms.uExag.value = 1;
    v.baseY = ((v.meta.min - v.h0) / 1000) - v.sizeX * 0.04;
    v.wallUniforms.uBaseY.value = v.baseY;
    v.uniforms.uFpv.value = 1;
    v.walls.visible = false;
    v.floor.visible = false;
    v.stalks.visible = false;
    v.scene.background = null;
    v.scene.add(this.sky, this.ring);
    v.directMat.visible = false; // the straight-line comparison is a map tool; at eye level it is a streak
    v.refreshRouteHeights();
    v.updateStalks();
    this.camY = v.yAt(x, z) + EYE;
    document.body.classList.add('fpv');
    this.el.classList.add('show');
    this.el.classList.remove('dead');
    a.hud.closeSheet();
    a.hud.toast('HELMET VIEW · TRUE-SCALE HiRISE TERRAIN');
    a.sound?.windLevel(0.07);
    a.sound?.breathing(true, 15);
    a.sound?.lock();
    this.follow = !!(a.planner.sim && !a.planner.sim.dead);
    if (this.follow) this.onSimStart(a.planner);
    a.hud.renderPlanner(a.planner);
    this.renderWarp();
  }

  exit() {
    if (!this.active) return;
    const a = this.app, v = this.view;
    this.active = false;
    this.follow = false;
    v.fpvOn = false;
    v.exagTarget = this.prevExag ?? v.cfg.exag;
    v.uniforms.uFpv.value = 0;
    v.walls.visible = true;
    v.floor.visible = true;
    v.stalks.visible = true;
    v.scene.background = new THREE.Color(0x050507);
    v.scene.remove(this.sky, this.ring);
    v.directMat.visible = true;
    v.refreshRouteHeights();
    v.camera.fov = this.baseFov();
    v.camera.updateProjectionMatrix();
    // come back to the map looking at where you stood
    v.cam.target.set(this.pos.x, v.yAt(this.pos.x, this.pos.z), this.pos.z);
    v.cam.az = this.yaw + Math.PI;
    v.cam.el = 0.6;
    v.cam.dist = 1.2;
    v.flyTo({ dist: 2.4, el: 0.8 }, 1.4);
    document.body.classList.remove('fpv');
    this.el.classList.remove('show', 'dead');
    this.moveStick?.reset();
    this.lookStick?.reset();
    this.leaveLandscape();
    a.sound?.windLevel(0.035);
    a.sound?.breathing(false);
    if (a.planner.evaItem && a.planner.sim) a.planner.evaItem.hiddenByUser = false;
    a.hud.renderPlanner(a.planner);
  }

  baseFov() {
    const a = this.app;
    const aspect = a.w / a.h;
    return aspect >= 1 ? 40 : Math.min(78, (2 * Math.atan(Math.tan((40 * Math.PI) / 360) / aspect) * 180) / Math.PI);
  }

  // ------------------------------------------------------------------ planner EVA hooks
  onSimStart(pl) {
    if (!this.active) return;
    this.follow = true;
    this.dead = null;
    this.el.classList.remove('dead');
    pl.sim.speed = this.warp * 5; // riding along: slower than the map playback
    pl.evaItem.hiddenByUser = true;
    this.lookOffset = 0;
  }

  onSimStop(pl, finished) {
    if (!this.active) return;
    this.follow = false;
    if (finished) this.app.hud.toast('EVA COMPLETE · YOU CAN WALK FREELY', 3000);
  }

  /** O₂ reached zero while in the helmet. */
  onDeath(info) {
    if (!this.active || this.dead) return;
    this.dead = { t: 0, info };
    this.walkTo = null;
    if (info.x != null) this.pos = { x: info.x, z: info.z };
    this.o2Used = this.app.planner.params.o2CapKg;
    this.el.classList.add('dead');
    const lt = info.lt ?? earthMarsLightTime().seconds;
    const m = Math.round(lt / 60);
    document.getElementById('h-dead').innerHTML = `<b>O₂ EXHAUSTED</b>
      <span>${fmtDist(info.fromLZ)} from the airlock · a mayday reaches Earth in ${m} min, a reply in ${m * 2} min</span>
      <button class="btn primary" id="h-respawn">↻ BACK TO LZ-A</button>`;
    document.getElementById('h-respawn').onclick = () => {
      this.app.planner.stopSim();
      const lz = this.app.planner.waypoints[0];
      this.exit();
      this.enter(lz?.x, lz?.z);
    };
    this.app.sound?.breathing(false);
  }

  // ------------------------------------------------------------------ input
  onDrag(dx, dy) {
    if (this.dead) return;
    const k = (this.fov / 62) * 0.0042;
    // grab-the-world, like a street-level photo viewer
    if (this.follow) this.lookOffset = (this.lookOffset || 0) - dx * k;
    else this.yaw -= dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, -1.2, 1.1);
    this.lastLook = performance.now();
  }

  onWheel(e) {
    const dy = e.deltaY * (e.deltaMode === 1 ? 30 : 1);
    this.fov = THREE.MathUtils.clamp(this.fov * Math.exp(dy * 0.0012), 12, 80);
  }

  /** click / tap without drag: walk there */
  onClick() {
    if (this.dead || this.follow) return;
    const v = this.view;
    const p = v.pick();
    if (!p) return;
    const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    if (d < 0.004) return;
    this.walkTo = { x: p.x, z: p.z };
    v.pulse(p.x, p.z);
    this.app.sound?.blip();
  }

  setWarp(i) {
    this.warpIdx = THREE.MathUtils.clamp(i, 0, WARPS.length - 1);
    const pl = this.app.planner;
    if (this.follow && pl.sim) pl.sim.speed = this.warp * 5;
    this.renderWarp();
  }

  /** Update the time-warp readout. The buttons are built once: re-creating them every HUD
   *  tick replaced the button between mouse-down and mouse-up, so desktop clicks never landed. */
  renderWarp() {
    const w = this.el?.querySelector('#h-warp');
    if (!w) return;
    const txt = `TIME ×${this.follow ? this.warp * 5 : this.warp}`;
    const v = w.querySelector('#h-warp-v');
    if (v.textContent !== txt) v.textContent = txt;
    const [dn, up] = w.querySelectorAll('button');
    dn.disabled = this.warpIdx === 0;
    up.disabled = this.warpIdx === WARPS.length - 1;
  }

  onKey(k) {
    if (k === '[' || k === '-') { this.setWarp(this.warpIdx - 1); return true; }
    if (k === ']' || k === '=' || k === '+') { this.setWarp(this.warpIdx + 1); return true; }
    return false;
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    if (!this.active) return;
    const a = this.app, v = this.view, pl = a.planner;
    const keys = a.keys;
    let speed = 0, grade = 0;

    const L = this.lookStick?.value;
    if (L && !this.dead && Math.hypot(L.x, L.y) > 0.06) {
      const k = (this.fov / 62) * dt;
      // square the input: fine aim near the centre, fast turns at the rim
      const lx = L.x * Math.abs(L.x), ly = L.y * Math.abs(L.y);
      if (this.follow) this.lookOffset = (this.lookOffset || 0) + lx * 2.2 * k;
      else this.yaw += lx * 2.2 * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch - ly * 1.5 * k, -1.2, 1.1);
      this.lastLook = performance.now();
    }
    this.moveStick?.el.classList.toggle('off', !!(this.follow || this.dead));

    if (this.dead) {
      this.dead.t += dt;
    } else if (this.follow && pl.sim && pl.sim.pos) {
      // ride with EV1: face along the route a few metres ahead
      const r = pl.result, st = pl.sim.state;
      const p = pl.sim.pos;
      const ahead = sampleAt(r.samples, Math.min(r.budget.distance, st.d + 12));
      const back = sampleAt(r.samples, Math.max(0, st.d - 2));
      const hd = Math.hypot(ahead.x - back.x, ahead.z - back.z) > 1e-6 ? Math.atan2(ahead.x - back.x, -(ahead.z - back.z)) : this.yaw;
      if (st.kind === 'walk') this.yaw = lerpAngle(this.yaw, hd, Math.min(1, dt * 2.2));
      if (performance.now() - (this.lastLook || 0) > 2500) this.lookOffset = (this.lookOffset || 0) * Math.max(0, 1 - dt * 1.5);
      const moved = Math.hypot(p.x - this.pos.x, p.z - this.pos.z) * 1000;
      this.pos = { x: p.x, z: p.z };
      speed = st.kind === 'walk' && dt > 0 ? Math.min(moved / dt / Math.max(1, pl.sim.speed), 3) : 0;
      this.o2Used = st.o2;
    } else if (!this.follow) {
      // free walk: WASD / arrows, or walk to a clicked point
      let f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
      let s = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      let run = keys.has('shift') ? 3 : 1;
      const M = this.moveStick?.value;
      const mm = M ? Math.min(1, Math.hypot(M.x, M.y)) : 0;
      if (mm > 0.08) {
        // analogue: a light push walks slowly, three quarters is normal pace, full push jogs (×3)
        f = -M.y; s = M.x;
        run = mm <= 0.75 ? mm / 0.75 : 1 + ((mm - 0.75) / 0.25) * 2;
      }
      const turn = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0);
      this.yaw += turn * dt * 1.2;
      let mx = 0, mz = 0;
      if (f || s) {
        this.walkTo = null;
        const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
        mx = sy * f + cy * s;
        mz = -cy * f + sy * s;
      } else if (this.walkTo) {
        const dx = this.walkTo.x - this.pos.x, dz = this.walkTo.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.002) this.walkTo = null;
        else {
          mx = dx / d; mz = dz / d;
          this.yaw = lerpAngle(this.yaw, Math.atan2(dx, -dz), Math.min(1, dt * 3));
        }
      }
      const len = Math.hypot(mx, mz);
      if (len > 0) {
        mx /= len; mz /= len;
        // real walking speed on this grade (Tobler-style), sped up by the displayed time warp
        const e0 = v.elevAt(this.pos.x, this.pos.z);
        const e1 = v.elevAt(this.pos.x + mx * 0.002, this.pos.z + mz * 0.002);
        grade = Math.atan2(e1 - e0, 2);
        const vw = walkSpeed(grade);
        const step = (vw * this.warp * run * dt) / 1000; // km
        const nx = this.pos.x + mx * step, nz = this.pos.z + mz * step;
        const slope = v.slopeAt(nx, nz) ?? 0;
        const hx = v.sizeX / 2 - 0.01, hz = v.sizeZ / 2 - 0.01;
        if (slope > pl.params.maxSlope + 8) {
          this.note('TOO STEEP TO WALK · ' + slope.toFixed(0) + '°');
          this.walkTo = null;
        } else if (Math.abs(nx) > hx || Math.abs(nz) > hz) {
          this.note('EDGE OF THE HiRISE ELEVATION MODEL');
          this.walkTo = null;
        } else {
          this.pos = { x: nx, z: nz };
          speed = vw * run;
          this.walked += step * 1000;
          // the suit pays for it: Pandolf metabolic rate → O₂, in simulated seconds
          this.o2Used += o2KgPerSec(metabolicW(speed, Math.tan(grade) * 100)) * dt * this.warp;
        }
      } else {
        this.o2Used += o2KgPerSec(metabolicW(0, 0)) * dt * this.warp; // standing still still costs O₂
      }
      this.clock += (dt * this.warp) / MARS_HOUR_S;
      if (Math.abs(this.clock - v.ltst) > 0.02) v.setTime(this.clock); // re-bake shadows only every ~1 Mars minute
      const cap = pl.params.o2CapKg;
      if (this.o2Used >= cap) {
        this.o2Used = cap;
        a.hud.banner('O₂ EXHAUSTED', 'nogo', 4200);
        a.hud.flash(0.55, 1400, 'red');
        a.sound?.flatline();
        const lz = pl.waypoints[0] || { x: 0, z: 0 };
        this.onDeath({ fromLZ: Math.hypot(this.pos.x - lz.x, this.pos.z - lz.z) * 1000 });
      } else if (!this.warned && this.o2Used >= cap * (1 - pl.params.reservePct / 100)) {
        this.warned = true;
        a.hud.toast('▲ O₂ RESERVE · HEAD BACK TO THE AIRLOCK', 3600);
        a.sound?.alarm(2);
      }
    }
    this.speed = speed;
    this.grade = grade;
    const cap = pl.params.o2CapKg;
    const lowO2 = 1 - this.o2Used / cap;
    a.sound?.breathing(!this.dead, 13 + speed * 6 + (lowO2 < 0.25 ? 10 : 0));
    this.renderHud();
  }

  applyCamera(dt) {
    const v = this.view, cam = v.camera;
    let eye = EYE, roll = 0, pitch = this.pitch;
    if (this.dead) {
      // collapse
      const k = Math.min(1, this.dead.t / 2.2);
      const e = k * k * (3 - 2 * k);
      eye = EYE * (1 - 0.8 * e);
      roll = 0.5 * e;
      pitch = THREE.MathUtils.lerp(this.pitch, -0.55, e);
    }
    const gy = v.yAt(this.pos.x, this.pos.z) + eye;
    this.camY = this.camY == null ? gy : THREE.MathUtils.lerp(this.camY, gy, Math.min(1, dt * 10));
    const bob = this.speed > 0.1 && !this.dead ? Math.sin(performance.now() / 1000 * 7.5) * 0.00004 * Math.min(1, this.speed) : 0;
    cam.position.set(this.pos.x, this.camY + bob, this.pos.z);
    const yaw = this.yaw + (this.follow ? this.lookOffset || 0 : 0);
    _fwd.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    cam.up.set(0, 1, 0);
    cam.lookAt(cam.position.x + _fwd.x, cam.position.y + _fwd.y, cam.position.z + _fwd.z);
    if (roll) cam.rotateZ(roll);
    cam.near = 0.0004;
    cam.far = 40;
    // portrait phones: widen the vertical angle so the horizontal view isn't a slit
    const aspect = this.app.w / this.app.h;
    cam.fov = aspect >= 1 ? this.fov : Math.min(100, (2 * Math.atan((Math.tan((this.fov * Math.PI) / 360) * 0.8) / aspect) * 180) / Math.PI);
    cam.updateProjectionMatrix();
    this.sky.position.copy(cam.position);
    this.ring.position.set(cam.position.x, cam.position.y, cam.position.z);
    this.heading = ((yaw * 180) / Math.PI % 360 + 360) % 360;
  }

  note(msg) {
    const n = document.getElementById('h-note');
    if (!n) return;
    n.textContent = msg;
    n.classList.add('show');
    clearTimeout(this._nt);
    this._nt = setTimeout(() => n.classList.remove('show'), 1600);
  }

  // ------------------------------------------------------------------ helmet HUD
  renderHud() {
    const now = performance.now();
    if (now - this.hudAt < 66) return;
    this.hudAt = now;
    const a = this.app, v = this.view, pl = a.planner;
    const hdg = this.heading ?? 0;
    // compass tape
    const fov = this.fov * (a.w / a.h);
    const pxDeg = (Math.min(a.w, 720) * 0.9) / Math.max(40, fov);
    const marks = [];
    for (let d = 0; d < 360; d += 15) {
      const rel = ((d - hdg + 540) % 360) - 180;
      if (Math.abs(rel) > 60) continue;
      const lab = { 0: 'N', 90: 'E', 180: 'S', 270: 'W', 45: 'NE', 135: 'SE', 225: 'SW', 315: 'NW' }[d];
      marks.push(`<i class="${lab ? 'm' : ''}" style="left:calc(50% + ${(rel * pxDeg).toFixed(0)}px)">${lab || ''}</i>`);
    }
    const targets = [];
    const lz = pl.waypoints[0];
    const add = (x, z, label, cls, showD) => {
      const b = (Math.atan2(x - this.pos.x, -(z - this.pos.z)) * 180) / Math.PI;
      const rel = ((b - hdg + 540) % 360) - 180;
      const d = Math.hypot(x - this.pos.x, z - this.pos.z) * 1000;
      if (d < 3) return;
      const px = Math.max(-58, Math.min(58, rel)) * pxDeg;
      targets.push({ px, cls: cls + (Math.abs(rel) > 58 ? ' off' : ''), html: `${label}${showD ? `<small>${fmtDist(d)}</small>` : ''}` });
    };
    if (lz) add(lz.x, lz.z, 'LZ', 'tl', true);
    if (this.follow && pl.sim?.state) {
      const st = pl.sim.state;
      const idx = pl.result.stopAtD.findIndex((d) => d > st.d + 1);
      const w = idx >= 0 ? pl.waypoints[idx + 1] : null;
      if (w) add(w.x, w.z, String(idx + 2), 'tw', true);
    } else if (this.walkTo) add(this.walkTo.x, this.walkTo.z, '▼', 'tw', true);
    else pl.waypoints.slice(1).forEach((w, i) => add(w.x, w.z, String(i + 2), 'tw', i === 0));
    // stack labels that would overlap onto a second row
    targets.sort((p, q) => p.px - q.px);
    let lastPx = -1e9, row = 0;
    const tags = targets.map((t) => {
      row = t.px - lastPx < 70 ? 1 - row : 0;
      lastPx = t.px;
      return `<em class="${t.cls}" style="left:calc(50% + ${t.px.toFixed(0)}px);top:${18 + row * 17}px">${t.html}</em>`;
    });
    document.getElementById('h-tape').innerHTML = marks.join('') + tags.join('');
    document.getElementById('h-hdg').textContent = `${String(Math.round(hdg) % 360).padStart(3, '0')}°`;

    // suit
    const cap = pl.params.o2CapKg;
    const left = Math.max(0, cap - this.o2Used);
    const pct = (left / cap) * 100;
    const reserve = pl.params.reservePct;
    const col = pct <= 0.01 ? 'dead' : pct < reserve ? 'crit' : pct < reserve + 15 ? 'warn' : '';
    const W = this.follow && pl.sim?.state ? (pl.sim.state.kind === 'stop' ? pl.params.stopW : metabolicW(this.speed || 0.8, 0)) : metabolicW(this.speed, Math.tan(this.grade || 0) * 100);
    const burn = o2KgPerSec(W) * 3600 * 1000; // g/h
    document.getElementById('h-suit').innerHTML = `
      <div class="hk">SUIT · EV1</div>
      <div class="o2 ${col}"><span>O₂</span><b>${left.toFixed(3)}<small> kg</small></b></div>
      <div class="bar ${col}"><i style="width:${pct.toFixed(1)}%"></i><u style="left:${reserve}%"></u></div>
      <div class="row"><span>METABOLIC</span><b>${fmtNum(W)} W</b></div>
      <div class="row"><span>O₂ BURN</span><b>${burn.toFixed(0)} g/h</b></div>
      <div class="row"><span>SUIT P</span><b>29.6 kPa</b></div>`;

    // navigation
    const e = v.elevAt(this.pos.x, this.pos.z);
    const sl = v.slopeAt(this.pos.x, this.pos.z) ?? 0;
    const ll = v.xzToLonLat(this.pos.x, this.pos.z);
    const clock = this.follow && pl.sim ? pl.result.sun.start + pl.sim.t / MARS_HOUR_S : this.clock;
    const toLZ = lz ? Math.hypot(lz.x - this.pos.x, lz.z - this.pos.z) * 1000 : 0;
    const slc = sl >= pl.params.maxSlope ? 'crit' : sl >= v.cfg.slopeLim[0] ? 'warn' : '';
    document.getElementById('h-nav').innerHTML = `
      <div class="hk">NAV · ${formatHM(clock)} LTST</div>
      <div class="row"><span>POSITION</span><b>${fmtLat(ll.lat)} ${fmtLon(ll.lon)}</b></div>
      <div class="row"><span>ELEVATION</span><b>${fmtNum(e)} m</b></div>
      <div class="row"><span>SLOPE</span><b class="${slc}">${sl.toFixed(0)}°</b></div>
      <div class="row"><span>TO AIRLOCK</span><b>${fmtDist(toLZ)}</b></div>
      <div class="row"><span>SPEED</span><b>${(this.speed || 0).toFixed(2)} m/s</b></div>
      <div class="row"><span>SUN</span><b>${v.sun ? v.sun.elevation.toFixed(0) : '—'}° el</b></div>`;
    this.renderWarp();
  }

  readout() {
    return [['HELMET', this.follow ? 'riding with EV1' : 'free walk'], ['FOV', `${this.fov.toFixed(0)}°`]];
  }
}

function lerpAngle(a, b, t) {
  const d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * t;
}
