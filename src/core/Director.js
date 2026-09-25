// Autopilot: a scripted fly-through for recording the pitch video.
// Press C (or the ▶ AUTOPILOT button). Any mouse/scroll input hands control back.
// K toggles captions, H hides the HUD.
import * as THREE from 'three';

export class Director {
  constructor(app) {
    this.app = app;
    this.running = false;
    this.captions = true;
    this.token = 0;
  }

  toggle() { this.running ? this.stop() : this.start(); }

  interrupt() { if (this.running) this.stop('AUTOPILOT OFF · MANUAL CONTROL'); }

  stop(msg) {
    this.running = false;
    this.token++;
    document.body.classList.remove('cine');
    const a = this.app;
    if (a.crater) a.crater.autoOrbit = 0;
    if (a.site) a.site.autoOrbit = 0;
    a.hud.caption(null);
    if (msg) a.hud.toast(msg);
    const b = document.getElementById('btn-cine');
    if (b) b.textContent = '▶ AUTOPILOT';
  }

  cap(k, t, ms = 0) { if (this.captions) this.app.hud.caption(k, t, ms); }

  async wait(s) {
    const tok = this.token;
    await new Promise((r) => setTimeout(r, s * 1000));
    if (tok !== this.token) throw new Error('cancelled');
  }

  async until(fn, maxS = 20) {
    const tok = this.token;
    const t0 = performance.now();
    while (!fn() && performance.now() - t0 < maxS * 1000) {
      await new Promise((r) => setTimeout(r, 100));
      if (tok !== this.token) throw new Error('cancelled');
    }
  }

  async start() {
    const a = this.app;
    if (this.running || a.mode === 'boot') return;
    this.running = true;
    document.getElementById('btn-cine').textContent = '■ STOP AUTOPILOT';
    document.body.classList.add('cine');
    try {
      await this.script();
      this.stop();
    } catch (e) {
      if (e.message !== 'cancelled') console.error(e);
    }
  }

  async script() {
    const a = this.app;
    // back to orbit
    while (a.mode !== 'orbit') { await a.exitUp(); await this.until(() => !a.busy); }
    const o = a.orbit;
    o.autoSpin = true;
    o.lastUser = o.time + 1;
    o.altTarget = 3.0;
    a.setOrbitLayer('visible');

    this.cap('SOL ATLAS', 'Every NASA Mars mission, layered into one map', 4200);
    await this.wait(4.5);

    a.setOrbitLayer('topo');
    this.cap('LAYER · MARS GLOBAL SURVEYOR MOLA', 'Laser-altimeter topography of the whole planet', 3200);
    await this.wait(3.4);
    a.setOrbitLayer('thermal');
    this.cap('LAYER · MARS ODYSSEY THEMIS', 'Night infrared: rock stays warm, dust cools fast', 3200);
    await this.wait(3.4);
    a.setOrbitLayer('visible');
    await this.wait(1.0);

    this.cap('TARGET · JEZERO CRATER', '18.4° N 77.5° E: an ancient lake with a river delta', 4000);
    const alt0 = o.altTarget;
    await tween(3.2, (t) => { o.altTarget = Math.exp(THREE.MathUtils.lerp(Math.log(alt0), Math.log(0.42), t)); o.lastUser = o.time - 2; }, this);
    await this.wait(0.6);

    this.cap('DESCENT', 'Orbit to crater, straight down through the data', 3000);
    await a.descendToJezero();
    const c = a.crater;
    this.cap('MRO CONTEXT CAMERA · 5 m / PIXEL', 'On a 20 m stereo elevation model, relief ×2.2', 3600);
    c.autoOrbit = 0.035;
    await this.wait(3.8);
    a.toggleTerrainLayer('elev', true);
    a.toggleTerrainLayer('contour', true);
    this.cap('ELEVATION + CONTOURS', 'The crater floor sits 2.6 km below the Mars datum', 3200);
    await this.wait(3.4);
    a.toggleTerrainLayer('thermal', true);
    this.cap('GROUND FIRMNESS · MARS ODYSSEY THEMIS', 'Firm rock stays warm at night. Loose dust and sand cool fast', 3400);
    await this.wait(3.6);
    a.toggleTerrainLayer('slope', true);
    a.toggleTerrainLayer('contour', false);
    this.cap('SLOPE HAZARD', 'Green is walkable. Red is a cliff', 3000);
    await this.wait(3.2);
    a.toggleTerrainLayer('slope', false);
    c.autoOrbit = 0;

    this.cap('MARSWALK ZONE', 'Where Perseverance landed and cached 10 sample tubes', 3200);
    await a.enterSite();
    const s = a.site;
    this.cap('MRO HiRISE · 25 cm / PIXEL', 'On a 1 m elevation model: boulder-scale hazards', 3400);
    s.autoOrbit = 0.03;
    await this.wait(3.6);
    a.toggleTerrainLayer('slope', true);
    const r = a.planner.result;
    if (r && !r.failed) {
      const b = r.budget;
      this.cap('SAFEST ROUTE · A* ON THE HiRISE DTM', `${(b.distance / 1000).toFixed(1)} km loop from LZ-A via the Three Forks depot. Stays under ${b.fineMax.toFixed(0)}°; a straight line would hit ${r.direct.maxFine.toFixed(0)}°`, 4800);
    }
    await this.wait(5);
    a.toggleTerrainLayer('slope', false);
    s.autoOrbit = 0;

    // the Watney check, including a bad day
    const pl = a.planner;
    const cap0 = pl.params.o2CapKg;
    this.cap('WHAT IF THE SUIT CARRIED ONLY 0.20 kg OF O₂?', 'The planner finds the point of no return and calls NO-GO', 4200);
    pl.params.o2CapKg = 0.2;
    pl.userEdit = true;
    pl.compute();
    await this.wait(4.4);
    const bad = pl.result;
    if (bad && bad.o2Out) {
      this.cap('AND IF THEY WALK ANYWAY?', 'Simulated EVA on the same plan', 0);
      await s.flyTo({ dist: 2.2, el: 0.8 }, 1.2);
      pl.follow = true;
      pl.startSim(Math.max(900, bad.o2Out.t / 7));
      await this.until(() => pl.sim && pl.sim.dead, 14);
      a.hud.caption(null);
      await this.wait(2.8);
      const lt = pl.sim?.deadAt?.lt;
      if (lt) this.cap('EARTH CANNOT HELP IN TIME', `A mayday takes ${Math.round(lt / 60)} min to reach Earth. The plan has to be right before egress.`, 4200);
      await this.wait(4.4);
      pl.stopSim();
    }
    pl.params.o2CapKg = cap0;
    pl.userEdit = true;
    pl.compute();
    await this.wait(2.6);

    // EVA playback with a chase camera
    const r2 = pl.result;
    await s.flyTo({ dist: 1.6, el: 0.62 }, 1.4);
    pl.follow = true;
    pl.startSim(900);
    if (r2 && !r2.failed) {
      const b = r2.budget;
      this.cap('THE WATNEY CHECK', `${b.o2.toFixed(2)} kg of O₂ used out of ${pl.params.o2CapKg.toFixed(2)} kg: ${b.marginPct.toFixed(0)} % left at the airlock`, 0);
    }
    await this.until(() => !pl.sim, 22);
    pl.stopSim();
    a.hud.caption(null);

    // the one-take: pick a destination, Sol Atlas plans the walk
    await s.flyTo(s.overview(), 2.0);
    pl.waypoints = pl.waypoints.slice(0, 1);
    pl.compute();
    this.cap('PICK A DESTINATION', 'Three Forks sample depot', 2400);
    await this.wait(2.4);
    const depot = s.cfg.pois.find((p) => p.id === 'depot');
    a.onPOIClick(s, depot);
    await this.wait(3.2);

    a.toggleTerrainLayer('holo', true);
    a.toggleTerrainLayer('contour', true);
    s.autoOrbit = 0.05;
    this.cap('THE SOL EXPLORERS · NASA SPACE APPS 2026', 'Sol Atlas plans the walk. Every sol counts.', 0);
    await this.wait(6);
    a.toggleTerrainLayer('holo', false);
    a.toggleTerrainLayer('contour', false);
    s.autoOrbit = 0;
    a.hud.caption(null);
    a.resetPlan();
  }

  update() {}
}

function tween(dur, fn, dir) {
  const tok = dir.token;
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const step = () => {
      if (tok !== dir.token) { reject(new Error('cancelled')); return; }
      const t = Math.min(1, (performance.now() - t0) / 1000 / dur);
      fn(t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    step();
  });
}
