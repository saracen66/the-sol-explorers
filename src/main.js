import './styles.css';
import * as THREE from 'three';
import { loadAssets } from './core/assets.js';
import { detectTier, checkGPU, Governor, isTouchDevice } from './core/quality.js';
import { Crossfade, Streaks } from './core/Crossfade.js';
import { Director } from './core/Director.js';
import { OrbitView } from './orbit/OrbitView.js';
import { TerrainView } from './terrain/TerrainView.js';
import { Planner } from './terrain/Planner.js';
import { PinTool } from './terrain/Pin.js';
import { FirstPerson } from './terrain/FirstPerson.js';
import { Labels } from './ui/labels.js';
import { Hud } from './ui/hud.js';
import { Sound } from './ui/sound.js';
import { CRATER_VIEW_POIS, SITE_POIS, DEFAULT_PLAN } from './data/places.js';
import { fmtNum } from './lib/geo.js';

const TOP = Math.PI / 2 - 0.0015;
const BASE_FOV = 40; // vertical FOV in landscape; portrait screens widen it so the horizontal view stays usable

class App {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.touch = isTouchDevice();
    let tier = detectTier();
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: tier.antialias, powerPreference: 'high-performance' });
    this.tier = tier = checkGPU(tier, this.renderer);
    document.body.classList.add(`tier-${tier.name}`);
    if (this.touch) document.body.classList.add('touch');
    this.governor = new Governor(tier, (pr) => this.setPixelRatio(pr));
    this.renderer.setPixelRatio(this.governor.pr);
    this.maxDt = 0.05;
    this.lastFrameAt = 0;
    this.readoutAt = 0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.labels = new Labels(document.getElementById('labels'));
    this.crossfade = new Crossfade(this.renderer);
    this.streaks = new Streaks(document.getElementById('fx'));
    this.director = new Director(this);
    this.sound = new Sound();
    this.hud = new Hud(this);
    this.mode = 'boot';
    this.busy = false;
    this.fade = null;
    this.keys = new Set();
    this.timer = new THREE.Timer();
    this.resize();
    // debounce: phone browsers fire resize while the address bar slides
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => this.resize(), 120); });
  }

  setPixelRatio(pr) {
    this.renderer.setPixelRatio(pr);
    this.resize();
    if (this.orbit) this.orbit.starUniforms.uPixelRatio.value = pr;
  }

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    const pr = this.renderer.getPixelRatio();
    this.renderer.setSize(this.w, this.h, false);
    this.crossfade.setSize(this.w, this.h, pr);
    this.streaks.resize(this.w, this.h, pr);
    const compact = this.w <= 760 || (this.touch && this.h <= 500);
    document.body.classList.toggle('compact', compact);
    document.body.classList.toggle('landscape', compact && this.w > this.h);
    const aspect = this.w / this.h;
    // portrait: keep ~40 deg horizontally instead of squeezing the view to a slit
    const fov = aspect >= 1 ? BASE_FOV : Math.min(78, (2 * Math.atan(Math.tan((BASE_FOV * Math.PI) / 360) / aspect) * 180) / Math.PI);
    for (const v of [this.orbit, this.crater, this.site]) {
      if (!v) continue;
      v.camera.aspect = aspect;
      v.camera.fov = fov;
      v.camera.updateProjectionMatrix();
    }
  }

  async start() {
    const log = document.getElementById('loader-log');
    const fill = document.getElementById('loader-fill');
    const lines = [];
    this.assets = await loadAssets(this.renderer, this.tier, (p, label) => {
      fill.style.width = `${(p * 100).toFixed(0)}%`;
      lines.push(`<div><span class="ok">✔</span> ${label}</div>`);
      log.innerHTML = lines.slice(-5).join('');
    });
    const { manifest, tex, heights } = this.assets;

    this.orbit = new OrbitView(this);
    this.orbit.build(this.assets);
    const tier = this.tier;

    this.crater = new TerrainView(this, {
      id: 'crater', meta: manifest.crater, heights: heights.crater,
      tex: { visible: tex.c_visible, normal: tex.c_normal, slope: tex.c_slope, thermal: tex.c_thermal },
      pois: CRATER_VIEW_POIS, exag: 2.2, contour: [50, 250], gridKm: 5, dist: [2.5, 210], strata: 140,
      overview: { dist: 118, el: 0.78, az: 0.3, target: { lat: 18.42, lon: 77.62 } },
      lat0: 18.44, lon0: 77.6, slopeLim: [10, 20, 30], childEnterDist: 11,
      meshStep: tier.meshStep, shadowSteps: tier.shadowSteps,
    });
    this.crater.build();
    this.crater.loadSlopeData();

    this.site = new TerrainView(this, {
      id: 'site', meta: manifest.site, heights: heights.site,
      tex: { visible: tex.s_visible, normal: tex.s_normal, slope: tex.s_slope, thermal: tex.s_thermal },
      pois: SITE_POIS, exag: 1.6, contour: [5, 25], gridKm: 0.5, dist: [0.12, 13], strata: 14,
      overview: { dist: 7.4, el: 0.86, az: 0.2 },
      lat0: 18.445, lon0: 77.462, slopeLim: [10, 20, 30], ltst: 9.25,
      meshStep: tier.meshStep, shadowSteps: tier.shadowSteps,
    });
    this.site.build();
    this.site.loadSlopeData();

    // Marswalk zone box on the crater
    const s = manifest.site;
    const a = this.crater.lonlatToXZ(s.lat[1], s.lon[0]), b = this.crater.lonlatToXZ(s.lat[0], s.lon[1]);
    this.zone = { x0: a.x, z0: a.z, x1: b.x, z1: b.z, cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2 };
    this.crater.uniforms.uBox.value.set(a.x, a.z, b.x, b.z);
    this.crater.uniforms.uBoxOn.value = 1;
    this.zoneLabel = this.labels.add('crater', {
      className: 'zone', world: new THREE.Vector3(this.zone.cx, 0, this.zone.z0),
      html: '<div class="lb">▣ MARSWALK ZONE<small>HiRISE 25 cm · click to enter</small></div>',
      onClick: () => this.enterSite(), priority: 10,
    });

    this.planner = new Planner(this, this.site, SITE_POIS);
    this.planner.init();
    this.planner.setPlan(DEFAULT_PLAN); // route solved now, so its line shaders compile during loading
    this.pin = new PinTool(this);
    this.fpv = new FirstPerson(this);

    // Warm up behind the loading screen: compile every shader, upload every texture,
    // bake the first shadows and allocate the transition buffers, so nothing of that
    // lands in the middle of the first zoom.
    this.resize();
    const rt = new THREE.WebGLRenderTarget(64, 64);
    for (const v of [this.orbit, this.crater, this.site]) {
      if (v.overview) { const o = v.overview(); v.cam.target.copy(o.target); v.cam.dist = o.dist; v.cam.el = o.el; v.cam.az = o.az; }
      v.update(0.016);
      this.renderer.setRenderTarget(rt);
      this.renderer.render(v.scene, v.camera);
    }
    this.renderer.setRenderTarget(null);
    rt.dispose();
    this.crossfade.render(this.orbit, this.crater, 0.5);
    this.crossfade.render(this.crater, this.site, 0.5);

    this.setActive(this.orbit, 'orbit');
    this.hud.renderOrbit(this.orbit);
    this.bindInput();
    document.getElementById('loader').classList.add('done');
    this.hud.caption('SOL ATLAS', this.touch ? 'Pinch to zoom toward Jezero. Drag to spin Mars.' : 'Scroll to zoom toward Jezero. Drag to spin Mars.', 5000);
    this.renderer.setAnimationLoop((t) => this.frame(t));
    if (new URLSearchParams(location.search).has('autopilot')) setTimeout(() => this.director.start(), 1200);
  }

  setActive(view, mode) {
    this.active = view;
    this.mode = mode;
    this.labels.setVisible('orbit', mode === 'orbit');
    this.labels.setVisible('crater', mode === 'crater');
    for (const g of ['site', 'wp', 'eva', 'pin']) this.labels.setVisible(g, mode === 'site');
    if (mode !== 'site') { this.pin?.close(); if (this.fpv?.active) this.fpv.exit(); }
  }

  fillDist(view) {
    const t = Math.tan((view.camera.fov * Math.PI) / 360);
    const aspect = this.w / this.h;
    return 0.96 * Math.min(view.sizeZ / (2 * t), view.sizeX / (2 * t * aspect));
  }

  crossfadeTo(a, b, dur = 1.1) {
    return new Promise((resolve) => { this.fade = { a, b, t: 0, dur, resolve }; });
  }

  // ------------------------------------------------------------------ transitions
  async descendToJezero() {
    if (this.mode !== 'orbit' || this.busy) return;
    this.busy = true;
    this.hud.clearPanels();
    this.hud.prompt(null);
    this.hud.reticle(true);
    await this.orbit.flyToJezero(0.26);
    this.hud.toast('TARGET LOCKED · JEZERO CRATER');
    this.sound.lock();
    this.sound.whoosh(3.2);
    const handover = this.fillDist(this.crater);
    this.streaksOn = true;
    await this.orbit.dive(handover, (km) => {
      this.hud.prompt(`<span class="big">ALT ${fmtNum(km)} KM</span>DESCENDING TO SURVEY ALTITUDE`);
    });
    this.crater.topDown(0, 0, handover);
    this.crater.mode = 'transit';
    this.streaksOn = false;
    this.hud.reticle(false);
    await this.crossfadeTo(this.orbit, this.crater, 1.2);
    this.hud.prompt(null);
    this.setActive(this.crater, 'crater');
    this.crater.mode = 'idle';
    this.crater.pulse(0, 0);
    this.hud.renderTerrain(this.crater);
    await this.crater.flyTo(this.crater.overview(), 3.4);
    this.busy = false;
  }

  async enterSite() {
    if (this.mode !== 'crater' || this.busy) return;
    this.busy = true;
    this.hud.prompt(null);
    const c = this.crater;
    const D = this.fillDist(this.site);
    this.hud.reticle(true);
    this.sound.whoosh(2.6);
    await c.flyTo({ target: new THREE.Vector3(this.zone.cx, c.yAt(this.zone.cx, this.zone.cz), this.zone.cz), dist: D, el: TOP, az: 0 }, 2.4);
    this.site.topDown(0, 0, D);
    this.site.mode = 'transit';
    this.hud.reticle(false);
    await this.crossfadeTo(c, this.site, 1.2);
    this.setActive(this.site, 'site');
    this.site.mode = 'idle';
    this.site.pulse(0, 0);
    if (!this.planner.waypoints.length) this.planner.setPlan(DEFAULT_PLAN);
    this.hud.renderTerrain(this.site, () => this.hud.renderPlanner(this.planner));
    this.hud.toast('HiRISE · 25 CM PER PIXEL');
    await this.site.flyTo(this.site.overview(), 2.8);
    this.busy = false;
  }

  async exitUp(view = this.active) {
    if (this.busy) return;
    if (view === this.crater) {
      this.busy = true;
      this.hud.clearPanels();
      const handover = this.fillDist(this.crater);
      await this.crater.flyTo({ target: new THREE.Vector3(0, this.crater.yAt(0, 0), 0), dist: handover, el: TOP, az: 0 }, 2.0);
      const o = this.orbit;
      const tile = o.cTile();
      o.spin = o.spinFor(tile);
      o.pitch = (tile.lat * Math.PI) / 180;
      o.alt = handover / 3389.5;
      o.mode = 'transit';
      o.update(0);
      await this.crossfadeTo(this.crater, o, 1.0);
      this.setActive(o, 'orbit');
      this.hud.renderOrbit(o);
      await o.climb(handover, (km) => this.hud.prompt(km < 1500 ? `<span class="big">ALT ${fmtNum(km)} KM</span>CLIMBING TO ORBIT` : null));
      this.hud.prompt(null);
      this.busy = false;
    } else if (view === this.site) {
      if (this.fpv.active) { this.fpv.exit(); return; }
      this.busy = true;
      this.planner.stopSim();
      this.hud.clearPanels();
      const D = this.fillDist(this.site);
      await this.site.flyTo({ target: new THREE.Vector3(0, this.site.yAt(0, 0), 0), dist: D, el: TOP, az: 0 }, 1.8);
      this.crater.topDown(this.zone.cx, this.zone.cz, D);
      this.crater.mode = 'transit';
      await this.crossfadeTo(this.site, this.crater, 1.0);
      this.setActive(this.crater, 'crater');
      this.crater.mode = 'idle';
      this.hud.renderTerrain(this.crater);
      await this.crater.flyTo({ dist: 34, el: 0.82, az: 0.3 }, 2.2);
      this.busy = false;
    }
  }

  async goTo(mode) {
    const order = ['orbit', 'crater', 'site'];
    while (order.indexOf(this.mode) > order.indexOf(mode) && !this.busy) await this.exitUp();
    if (mode === 'crater' && this.mode === 'orbit') await this.descendToJezero();
    if (mode === 'site' && this.mode === 'crater') await this.enterSite();
  }

  orbitLookAt(site) {
    const o = this.orbit;
    const s0 = o.spin, s1 = o.spinFor(site), p0 = o.pitch, p1 = (site.lat * Math.PI) / 180;
    o.lastUser = o.time + 3;
    o.tweens.add(1.6, (t) => {
      o.spin = s0 + (((s1 - s0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * t;
      o.pitch = p0 + (p1 - p0) * t;
    });
    o.altTarget = Math.max(o.altTarget, 1.4);
    this.hud.toast(`${site.name.toUpperCase()} · ${site.status === 'fiction' ? 'FICTIONAL SITE' : 'LOCKED IN PHASE 1'}`);
  }

  setOrbitLayer(id) {
    this.orbit.setLayer(id);
    this.sound.click();
    this.hud.renderOrbit(this.orbit);
  }

  toggleTerrainLayer(id, on) {
    const v = this.active;
    if (!(v instanceof TerrainView)) return;
    v.toggleLayer(id, on);
    this.hud.terrainLegend(v);
    this.sound.click();
  }

  onPOIClick(view, poi) {
    if (view === this.site && poi.id !== 'lz') {
      this.planner.addMode = false;
      if (this.planner.addPOI(poi)) { this.hud.toast(`STOP ADDED · ${poi.name.toUpperCase()}`); this.sound.pin(); return; }
    }
    const { x, z } = view.lonlatToXZ(poi.lat, poi.lon);
    view.pulse(x, z);
    view.flyTo({ target: new THREE.Vector3(x, view.yAt(x, z), z), dist: view === this.site ? 1.1 : 13, el: 0.72 }, 1.8);
  }

  resetPlan() {
    this.planner.returnToStart = true;
    this.planner.setPlan(DEFAULT_PLAN);
  }

  // ------------------------------------------------------------------ input
  bindInput() {
    let down = null;
    let pinch = null;
    const pts = new Map();
    const c = this.canvas;
    const pinchInfo = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    };
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      c.setPointerCapture(e.pointerId);
      this.director.interrupt();
      if (pts.size === 2) {
        pinch = pinchInfo(); // second finger: switch from drag to pinch / two-finger pan
        if (down) down.moved = true;
        return;
      }
      down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, b: e.button === 2 ? 2 : 1, moved: false, touch: e.pointerType === 'touch' };
    });
    c.addEventListener('pointermove', (e) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        const now = pinchInfo();
        this.active?.onPointerMove(now.cx, now.cy);
        if (!this.busy && !this.fade) {
          // spreading fingers = zoom in; mapped onto the same code path as the mouse wheel
          const deltaY = Math.log(pinch.d / Math.max(now.d, 1)) * 720;
          if (Math.abs(deltaY) > 0.5) this.active.onWheel({ deltaY, deltaMode: 0 });
          if (this.active instanceof TerrainView) this.active.onDrag(now.cx - pinch.cx, now.cy - pinch.cy, 2, false);
        }
        pinch = now;
        return;
      }
      this.active?.onPointerMove(e.clientX, e.clientY);
      if (!down) return;
      const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
      down.lx = e.clientX; down.ly = e.clientY;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > (down.touch ? 10 : 4)) down.moved = true;
      if (down.moved && !this.busy) this.active.onDrag(dx, dy, down.b, e.shiftKey);
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 1 && down) { const p = [...pts.values()][0]; down.lx = p.x; down.ly = p.y; } // no jump when one finger lifts
      if (e.type === 'pointerup' && down && !down.moved && pts.size === 0) {
        this.active?.onPointerMove(e.clientX, e.clientY);
        this.onCanvasClick(e);
      }
      if (pts.size === 0) down = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    // iOS Safari: stop the page itself from pinch-zooming
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (e.target.closest('.panel, .modal')) return;
      e.preventDefault();
      this.director.interrupt();
      if (!this.busy && !this.fade) this.active?.onWheel(e);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      this.keys.add(e.key.toLowerCase());
      this.onKey(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  onCanvasClick() {
    if (document.body.classList.contains('sheet-open')) { this.hud.closeSheet(); return; }
    if (this.busy) return;
    if (this.mode === 'site' && this.fpv.active) { this.fpv.onClick(); return; }
    if (this.mode === 'site') {
      const p = this.site.pick();
      if (this.planner.addMode) {
        if (p) { this.planner.addMode = false; this.planner.addAt(p.x, p.z); }
      } else if (this.pin.open) this.pin.close(); // like a map app: a second click clears the pin
      else if (p) this.pin.drop(p.x, p.z);
    } else if (this.mode === 'crater') {
      const p = this.crater.pick();
      const z = this.zone;
      if (p && p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1) this.enterSite();
    } else if (this.mode === 'orbit' && this.orbit.locked) {
      this.descendToJezero();
    }
  }

  onKey(e) {
    const k = e.key.toLowerCase();
    if (k === 'c') { this.director.toggle(); return; }
    if (k === 'h') { document.getElementById('hud').classList.toggle('hidden'); document.getElementById('labels').style.opacity = document.getElementById('hud').classList.contains('hidden') ? 0.0 : 1; return; }
    if (k === 'm') { this.hud.soundButton(this.sound.toggle()); return; }
    if (k === 'k') { this.director.captions = !this.director.captions; this.hud.toast(`CAPTIONS ${this.director.captions ? 'ON' : 'OFF'}`); return; }
    if (this.busy) return;
    if (k === 'escape' && this.pin?.open) { this.pin.close(); return; }
    if (this.mode === 'site' && this.fpv.active) {
      if (k === 'escape' || k === 'f') { this.fpv.exit(); return; }
      if (this.fpv.onKey(k)) return;
    } else if (this.mode === 'site' && k === 'f') { this.fpv.enter(); return; }
    if (k === 'escape' || k === 'backspace') { this.exitUp(); return; }
    if (this.mode === 'orbit') {
      if (['1', '2', '3'].includes(k)) this.setOrbitLayer(['visible', 'topo', 'thermal'][+k - 1]);
      if (k === 'g') { this.orbit.grid = this.orbit.grid > 0 ? 0 : 0.35; this.hud.renderOrbit(this.orbit); }
      if (k === ' ') { this.orbit.autoSpin = !this.orbit.autoSpin; this.hud.renderOrbit(this.orbit); }
      if (k === 'enter') this.descendToJezero();
    } else {
      const ids = ['visible', 'elev', 'slope', 'thermal', 'contour', 'holo'];
      if (/^[1-6]$/.test(k)) this.toggleTerrainLayer(ids[+k - 1]);
      if (k === 'enter' && this.mode === 'crater') this.enterSite();
      if (k === ' ' && this.mode === 'site') { e.preventDefault(); this.planner.sim ? this.planner.stopSim() : this.planner.startSim(); }
    }
  }

  // ------------------------------------------------------------------ loop
  frame(now = performance.now()) {
    // phones: cap at 30 fps; halves GPU heat and keeps the UI responsive
    const cap = this.tier.fpsCap;
    if (cap && now - this.lastFrameAt < 1000 / cap - 4) return;
    if (this.lastFrameAt) this.governor.tick(now - this.lastFrameAt);
    this.lastFrameAt = now;
    this.timer.update(now);
    const dt = Math.min(this.maxDt, this.timer.getDelta());
    const v = this.active;

    if (v === this.site && this.fpv.active) this.fpv.update(dt);
    else if (v instanceof TerrainView && !this.busy) {
      const kx = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
      const kz = (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0);
      if (kx || kz) v.onKeyPan(kx, kz, dt);
    }

    if (this.fade) {
      const f = this.fade;
      f.t = Math.min(1, f.t + dt / f.dur);
      f.a.update(dt);
      f.b.update(dt);
      this.crossfade.render(f.a, f.b, f.t);
      if (f.t >= 1) { this.fade = null; f.resolve(); }
    } else {
      v.update(dt);
      this.renderer.render(v.scene, v.camera);
    }

    if (this.mode === 'site') { this.planner.update(dt); this.planner.frame(); this.pin.frame(); }
    const groups = this.mode === 'orbit' ? ['orbit'] : this.mode === 'crater' ? ['crater'] : ['site', 'wp', 'eva', 'pin'];
    for (const g of groups) this.labels.update(g, v.camera, this.w, this.h);

    this.streaks.intensity += ((this.streaksOn ? 1 : 0) - this.streaks.intensity) * Math.min(1, dt * 3);
    this.streaks.update(dt);
    if (now - this.readoutAt > 100) { this.readoutAt = now; this.hud.readout(this.fpv?.active ? this.fpv.readout() : v.readout()); }
    if (!this.busy) this.updatePrompts();
    this.director.update(dt);
  }

  updatePrompts() {
    if (this.mode === 'orbit') {
      const o = this.orbit;
      this.hud.reticle(o.locked);
      if (o.locked) this.hud.prompt(`<span class="big">JEZERO CRATER</span>TARGET LOCKED · ${this.touch ? 'PINCH OR TAP' : 'SCROLL OR CLICK'} TO DESCEND<span class="chev">▼</span>`);
      else if (o.alt < 1.2) this.hud.prompt(`ZOOMING TOWARD JEZERO · KEEP ${this.touch ? 'PINCHING' : 'SCROLLING'}`);
      else this.hud.prompt(null);
    } else if (this.mode === 'crater') {
      const c = this.crater, z = this.zone, t = c.cam.target;
      const m = 1.5;
      const inBox = t.x > z.x0 - m && t.x < z.x1 + m && t.z > z.z0 - m && t.z < z.z1 + m;
      c.canEnterChild = inBox;
      this.hud.reticle(false);
      if (inBox && c.cam.dist < 26) this.hud.prompt(`<span class="big">MARSWALK ZONE</span>${this.touch ? 'PINCH OR TAP' : 'SCROLL OR CLICK'} TO ENTER · HiRISE 25 CM<span class="chev">▼</span>`);
      else this.hud.prompt(null);
      this.zoneLabel.world.set(z.cx, c.yAt(z.cx, z.z0) + c.stalkH() * 0.6, z.z0);
    } else {
      this.hud.reticle(false);
      if (this.fpv.active) { this.hud.prompt(null); return; }
      this.hud.prompt(this.planner.addMode ? `${this.touch ? 'TAP' : 'CLICK'} THE MAP TO ADD A STOP` : null);
    }
  }
}

const app = new App();
window.solAtlas = app;
app.start().catch((err) => {
  console.error(err);
  document.getElementById('loader-log').innerHTML = `<div style="color:#ff7b7b">Failed to start: ${err.message}</div>`;
});
