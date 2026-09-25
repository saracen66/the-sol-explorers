import * as THREE from 'three';
import { CostGrid } from './pathfinding.js';
import { EVA_DEFAULTS, budget, verdict, o2KgPerSec, walkSpeed, metabolicW } from './eva.js';
import { dayLength, formatHM, earthMarsLightTime } from '../lib/marstime.js';
import { fmtDist, fmtDur, fmtNum } from '../lib/geo.js';

const GRID = 512;

export class Planner {
  constructor(app, view, pois) {
    this.app = app;
    this.view = view;
    this.pois = pois;
    this.params = { ...EVA_DEFAULTS };
    this.waypoints = [];
    this.returnToStart = true;
    this.addMode = false;
    this.result = null;
    this.sim = null;
    this.follow = true;
  }

  init() {
    const v = this.view, m = v.meta;
    const W = m.width, H = m.height, h = v.cfg.heights;
    const gw = GRID, gh = Math.round(GRID * H / W);
    const fx = W / gw, fy = H / gh;
    const elev = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let s = 0, n = 0;
      for (let yy = Math.floor(y * fy); yy < Math.floor((y + 1) * fy); yy++) for (let xx = Math.floor(x * fx); xx < Math.floor((x + 1) * fx); xx++) { s += h[yy * W + xx]; n++; }
      elev[y * gw + x] = m.min + (s / n / 65535) * (m.max - m.min);
    }
    // max-pool the fine slope map onto the grid
    const sd = v.slopeData;
    const fine = new Float32Array(gw * gh);
    const sx = sd.w / gw, sy = sd.h / gh;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let mx = 0;
      // 90th percentile would be kinder; max keeps astronauts off cliff bands
      for (let yy = Math.floor(y * sy); yy < Math.floor((y + 1) * sy); yy++) for (let xx = Math.floor(x * sx); xx < Math.floor((x + 1) * sx); xx++) {
        mx = Math.max(mx, sd.data[(yy * sd.w + xx) * 4] * 0.25);
      }
      fine[y * gw + x] = mx;
    }
    this.gw = gw; this.gh = gh;
    this.grid = new CostGrid(elev, gw, gh, v.sizeX * 1000 / gw, v.sizeZ * 1000 / gh, fine);
  }

  cellOf(x, z) {
    const v = this.view;
    return [
      THREE.MathUtils.clamp(Math.floor((x / v.sizeX + 0.5) * this.gw), 0, this.gw - 1),
      THREE.MathUtils.clamp(Math.floor((z / v.sizeZ + 0.5) * this.gh), 0, this.gh - 1),
    ];
  }

  cellXZ(cx, cy) {
    const v = this.view;
    return { x: ((cx + 0.5) / this.gw - 0.5) * v.sizeX, z: ((cy + 0.5) / this.gh - 0.5) * v.sizeZ };
  }

  setPlan(ids) {
    this.waypoints = ids.map((id) => {
      const p = this.pois.find((q) => q.id === id);
      const { x, z } = this.view.lonlatToXZ(p.lat, p.lon);
      return { name: p.name, x, z, poi: p };
    });
    this.compute();
  }

  addAt(x, z) {
    const n = this.waypoints.length;
    this.waypoints.push({ name: `Stop ${n}`, x, z });
    this.userEdit = true;
    this.compute();
  }

  addPOI(poi) {
    if (this.waypoints.some((w) => w.poi && w.poi.id === poi.id)) return false;
    const { x, z } = this.view.lonlatToXZ(poi.lat, poi.lon);
    this.waypoints.push({ name: poi.name, x, z, poi });
    this.userEdit = true;
    this.compute();
    return true;
  }

  remove(i) {
    this.waypoints.splice(i, 1);
    this.userEdit = true;
    this.compute();
  }

  compute() {
    this.stopSim();
    const v = this.view;
    const wps = this.waypoints;
    if (wps.length < 2) {
      this.result = null;
      this.lastVerdict = null;
      v.setRoute(null);
      this.renderMarkers();
      this.app.hud.renderPlanner(this);
      return;
    }
    const stops = [...wps];
    if (this.returnToStart) stops.push(wps[0]);
    const route = [];
    const stopDist = [];
    let failed = false;
    const t0 = performance.now();
    for (let i = 0; i < stops.length - 1; i++) {
      const [ax, ay] = this.cellOf(stops[i].x, stops[i].z);
      const [bx, by] = this.cellOf(stops[i + 1].x, stops[i + 1].z);
      const path = this.grid.find(ax, ay, bx, by, this.params);
      if (!path) { failed = true; break; }
      const pts = path.map(([cx, cy]) => this.cellXZ(cx, cy));
      pts[0] = { x: stops[i].x, z: stops[i].z };
      pts[pts.length - 1] = { x: stops[i + 1].x, z: stops[i + 1].z };
      const smooth = chaikin(chaikin(pts));
      if (route.length) smooth.shift();
      route.push(...smooth);
      stopDist.push(route.length - 1);
    }
    this.computeMs = performance.now() - t0;
    if (failed) {
      this.result = { failed: true };
      this.lastVerdict = 'nogo';
      v.setRoute(null);
      this.app.hud.renderPlanner(this);
      return;
    }
    // dense resample for budget + profile (every ~4 m)
    const samples = resample(route, 0.004, (x, z) => v.elevAt(x, z));
    const stopAtD = [];
    // map stop indices to distances (stops = waypoints 1..n, excluding the final return to start)
    let acc = 0;
    const cum = [0];
    for (let i = 1; i < route.length; i++) { acc += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z) * 1000; cum.push(acc); }
    stopDist.forEach((idx, i) => { if (!(this.returnToStart && i === stopDist.length - 1)) stopAtD.push(cum[idx]); });
    const b = budget(samples, stopAtD, this.params);

    // straight-line comparison
    const direct = [];
    for (let i = 0; i < stops.length - 1; i++) direct.push({ x: stops[i].x, z: stops[i].z });
    direct.push({ x: stops.at(-1).x, z: stops.at(-1).z });
    const dSamples = resample(direct, 0.004, (x, z) => v.elevAt(x, z));
    let directMaxFine = 0;
    for (const s of dSamples) directMaxFine = Math.max(directMaxFine, v.slopeAt(s.x, s.z) || 0);
    let routeMaxFine = 0;
    for (const s of samples) routeMaxFine = Math.max(routeMaxFine, v.slopeAt(s.x, s.z) || 0);
    b.maxSlope = Math.max(b.maxSlope, 0);
    b.fineMax = routeMaxFine;

    const sun = this.sunWindow(b);

    this.result = {
      route, samples, stopAtD, budget: b, sun,
      direct: { distance: dSamples.at(-1).d, maxFine: directMaxFine },
    };
    this.result.pnr = this.pointOfNoReturn(this.result);
    this.buildEvents(this.result);
    // where the suit runs dry (null when the plan fits in the tank) and where the reserve starts
    this.result.o2Out = this.findO2(this.result, this.params.o2CapKg);
    this.result.reserveAt = this.findO2(this.result, this.params.o2CapKg - b.reserveKg);
    this.result.verdict = this.judge(this.result);
    const out = this.result.o2Out;
    const lost = out ? samples.filter((s, i) => s.d >= out.d && (i % 3 === 0 || i === samples.length - 1)) : null;
    if (lost) lost.unshift({ x: out.x, z: out.z });
    v.setRoute(route, direct, lost && lost.length > 1 ? lost : null);
    this.renderMarkers();
    const prev = this.lastVerdict;
    this.lastVerdict = this.result.verdict.lvl;
    this.app.hud.renderPlanner(this);
    if (this.userEdit && this.lastVerdict === 'go' && prev !== 'go') { this.app.hud.banner('MARSWALK READY', 'go'); this.app.sound?.go(); }
    else if (this.userEdit && this.lastVerdict === 'nogo' && prev !== 'nogo') { this.app.hud.banner('NO-GO · REPLAN', 'nogo'); this.app.sound?.nogo(); }
    this.userEdit = false;
  }

  judge(r) {
    const vd = verdict(r.budget, r.sun, this.params);
    if (r.o2Out) {
      vd.issues.unshift({ lvl: 'nogo', msg: `O₂ runs out at ${(r.o2Out.d / 1000).toFixed(2)} km, ${fmtDur(r.o2Out.t)} into the EVA: EV1 would not survive this plan` });
      vd.lvl = 'nogo';
    }
    if (r.pnr) {
      vd.issues.unshift({ lvl: 'nogo', msg: `Point of no return at ${(r.pnr.d / 1000).toFixed(2)} km: past it, an abort can't reach the airlock with the O₂ reserve` });
      vd.lvl = 'nogo';
    }
    return vd;
  }

  /**
   * Point of no return: the first point on the route where the O2 already used
   * plus the O2 to walk straight back to the airlock would eat into the reserve.
   * Only the outbound part counts (on the last leg you are already heading home).
   */
  pointOfNoReturn(r) {
    const p = this.params, b = r.budget;
    const home = this.waypoints[0];
    const vFlat = walkSpeed(0, p);
    const o2PerM = o2KgPerSec(metabolicW(vFlat, 0, p)) / vFlat * 1.25; // detour + terrain allowance
    const stopKg = o2KgPerSec(p.stopW) * p.stopMin * 60;
    const lastOut = this.returnToStart ? (r.stopAtD.at(-1) ?? 0) : b.distance;
    const limit = p.o2CapKg - b.reserveKg;
    for (let i = 0; i < r.samples.length; i++) {
      const s = r.samples[i];
      if (s.d > lastOut + 0.5) break;
      const walked = interp(b.timeline, 'd', s.d, 'o2');
      const stops = r.stopAtD.filter((d) => d <= s.d + 0.5).length * stopKg;
      const back = Math.hypot(s.x - home.x, s.z - home.z) * 1000 * o2PerM;
      if (walked + stops + back > limit) return { d: s.d, x: s.x, z: s.z, need: walked + stops + back, limit };
    }
    return null;
  }

  sunWindow(b) {
    const v = this.view;
    const dl = dayLength(v.lat0, v.decl);
    const start = v.ltst;
    const end = start + b.totalT / 3698.9; // Earth seconds → Mars hours
    return { start, end, sunset: dl.set, endMarginH: dl.set - end };
  }

  refreshSun() {
    const r = this.result;
    if (!r || r.failed) return;
    r.sun = this.sunWindow(r.budget);
    r.verdict = this.judge(r);
    this.app.hud.renderPlanner(this);
  }

  renderMarkers() {
    const labels = this.app.labels;
    labels.clear('wp');
    this.wpItems = this.waypoints.map((w, i) => {
      // named places already carry their own label; custom stops get a small one
      const lb = w.poi ? '' : `<div class="lb wr">${w.name} · science stop</div>`;
      const it = labels.add('wp', {
        className: 'wpn', html: `<div class="dot"></div><div class="num">${i + 1}</div>${lb}`,
        world: new THREE.Vector3(w.x, 0, w.z), priority: 8,
      });
      it.xz = w;
      return it;
    });
    const pnr = this.result && this.result.pnr;
    if (pnr) {
      const it = labels.add('wp', {
        className: 'pnr', html: '<div class="dot"></div><div class="lb">POINT OF NO RETURN<small>abort limit with O₂ reserve</small></div>',
        world: new THREE.Vector3(pnr.x, 0, pnr.z), priority: 9,
      });
      it.xz = { x: pnr.x, z: pnr.z };
      this.wpItems.push(it);
    }
    const out = this.result && this.result.o2Out;
    if (out) {
      const it = labels.add('wp', {
        className: 'o2out', html: '<div class="dot"></div><div class="lb">O₂ RUNS OUT<small>EV1 would not survive past here</small></div>',
        world: new THREE.Vector3(out.x, 0, out.z), priority: 9,
      });
      it.xz = { x: out.x, z: out.z };
      this.wpItems.push(it);
      this.o2Item = it;
    } else this.o2Item = null;
    if (!this.evaItem) {
      this.evaItem = labels.add('eva', { className: 'eva', html: '<div class="dot"></div><div class="lb">EV1</div>', world: new THREE.Vector3() });
      this.hoverItem = labels.add('eva', { className: 'eva', html: '<div class="dot" style="width:8px;height:8px;left:-4px;top:-4px"></div>', world: new THREE.Vector3() });
    }
    this.evaItem.hiddenByUser = true;
    this.hoverItem.hiddenByUser = true;
  }

  showHover(d) {
    if (!this.result || d == null) { if (this.hoverItem) this.hoverItem.hiddenByUser = true; return; }
    const s = sampleAt(this.result.samples, d);
    const v = this.view;
    this.hoverItem.world.set(s.x, v.yAt(s.x, s.z) + v.markerLift(), s.z);
    this.hoverItem.hiddenByUser = false;
  }

  // ------------------------------------------------------------------ EVA playback
  startSim(speed = 480) {
    if (!this.result || this.result.failed) return;
    this.stopSim();
    this.sim = { t: 0, speed, pastPnr: false, inReserve: false, dead: false };
    this.evaItem.hiddenByUser = !!this.app.fpv?.active;
    this.setEvaLook(false);
    this.app.hud.toast('EVA SIMULATION · EV1 EGRESS');
    this.app.sound?.lock();
    this.app.fpv?.onSimStart(this);
  }

  stopSim() {
    const had = !!this.sim;
    this.sim = null;
    if (this.evaItem) { this.evaItem.hiddenByUser = true; this.setEvaLook(false); }
    this.view.autoFollow = null;
    clearTimeout(this._mayday);
    if (had) { this.app.hud.updateSim(this, null, null); this.app.fpv?.onSimStop(this); }
  }

  setEvaLook(dead) {
    const it = this.evaItem;
    if (!it) return;
    it.el.classList.toggle('dead', dead);
    it.lb.innerHTML = dead ? 'EV1 · O₂ 0.00 kg<small>suit out of oxygen</small>' : 'EV1';
    it.lbW = null;
  }

  /** Walk / stop timeline of the EVA, with O₂ used at the start and end of each segment. */
  buildEvents(r) {
    const b = r.budget, p = this.params;
    const stopDur = p.stopMin * 60;
    const ev = [];
    let tt = 0, lastD = 0, o2 = 0;
    const tl = b.timeline;
    const walkTimeAt = (d) => interp(tl, 'd', d, 't');
    const walkO2At = (d) => interp(tl, 'd', d, 'o2');
    for (const sd of r.stopAtD) {
      ev.push({ kind: 'walk', t0: tt, t1: tt + walkTimeAt(sd) - walkTimeAt(lastD), d0: lastD, d1: sd, o0: o2, o1: o2 + walkO2At(sd) - walkO2At(lastD) });
      tt = ev.at(-1).t1; o2 = ev.at(-1).o1;
      ev.push({ kind: 'stop', t0: tt, t1: tt + stopDur, d0: sd, d1: sd, o0: o2, o1: o2 + o2KgPerSec(p.stopW) * stopDur });
      tt = ev.at(-1).t1; o2 = ev.at(-1).o1; lastD = sd;
    }
    const end = b.distance;
    ev.push({ kind: 'walk', t0: tt, t1: tt + walkTimeAt(end) - walkTimeAt(lastD), d0: lastD, d1: end, o0: o2, o1: o2 + walkO2At(end) - walkO2At(lastD) });
    r.events = ev;
  }

  /** distance along the route inside event e at fraction f of its duration */
  distIn(e, f) {
    if (e.kind !== 'walk') return e.d0;
    const tl = this.result.budget.timeline;
    const w0 = interp(tl, 'd', e.d0, 't');
    const w1 = interp(tl, 'd', e.d1, 't');
    return interp(tl, 't', w0 + (w1 - w0) * f, 'd');
  }

  /** First moment the cumulative O₂ use reaches `level` kg, or null if it never does. */
  findO2(r, level) {
    for (const e of r.events) {
      if (e.o1 < level) continue;
      const f = e.o1 > e.o0 ? THREE.MathUtils.clamp((level - e.o0) / (e.o1 - e.o0), 0, 1) : 0;
      const t = e.t0 + (e.t1 - e.t0) * f;
      const d = this.distIn(e, f);
      const s = sampleAt(r.samples, d);
      return { t, d, x: s.x, z: s.z, kind: e.kind };
    }
    return null;
  }

  /** position on route for simulated EVA time (s), including pauses at stops */
  stateAt(t) {
    const r = this.result;
    if (!r.events) this.buildEvents(r);
    const e = r.events.find((x) => t <= x.t1) || r.events.at(-1);
    const f = e.t1 > e.t0 ? THREE.MathUtils.clamp((t - e.t0) / (e.t1 - e.t0), 0, 1) : 1;
    return { d: this.distIn(e, f), o2: e.o0 + (e.o1 - e.o0) * f, kind: e.kind, done: t >= r.events.at(-1).t1 };
  }

  update(dt) {
    if (!this.sim || !this.result) return;
    const s = this.sim, r = this.result;
    const hud = this.app.hud, snd = this.app.sound;
    if (s.dead) return; // frozen where the O₂ ran out until the plan changes or the sim is stopped
    s.t += dt * s.speed;
    let dies = false;
    if (r.o2Out && s.t >= r.o2Out.t) { s.t = r.o2Out.t; dies = true; }
    const st = this.stateAt(s.t);
    if (dies) st.o2 = this.params.o2CapKg;
    const pos = sampleAt(r.samples, st.d);
    const v = this.view;
    const y = v.yAt(pos.x, pos.z);
    this.evaItem.world.set(pos.x, y + v.markerLift(), pos.z);
    s.pos = pos;
    if (this.follow && !this.app.fpv?.active) {
      v.cam.target.x += (pos.x - v.cam.target.x) * Math.min(1, dt * 2.5);
      v.cam.target.z += (pos.z - v.cam.target.z) * Math.min(1, dt * 2.5);
    }
    s.state = st;

    // milestones along the way
    if (r.pnr && !s.pastPnr && st.d >= r.pnr.d) {
      s.pastPnr = true;
      hud.toast('▲ PAST THE POINT OF NO RETURN', 3400);
      snd?.alarm(1);
    }
    if (r.reserveAt && !s.inReserve && s.t >= r.reserveAt.t && !dies) {
      s.inReserve = true;
      hud.toast('▲ O₂ RESERVE REACHED · SUIT CAUTION', 3400);
      snd?.alarm(2);
    }
    hud.updateSim(this, s.t, st);
    if (dies) { this.die(pos); return; }
    if (st.done) {
      const home = this.returnToStart;
      const breached = r.budget.remaining < r.budget.reserveKg;
      hud.toast(home ? (breached ? 'EV1 BACK AT LZ-A · O₂ RESERVE BREACHED' : 'EV1 BACK AT LZ-A · INGRESS') : `EV1 AT ${this.waypoints.at(-1).name.toUpperCase()}`, 3400);
      if (!breached) snd?.go();
      this.sim = null;
      this.app.fpv?.onSimStop(this, true);
      setTimeout(() => { if (!this.sim && this.evaItem) this.evaItem.hiddenByUser = true; }, 2500);
      hud.updateSim(this, null, null);
    }
  }

  /** O₂ reached zero: freeze EV1 where it happened and tell the story of the mayday. */
  die(pos) {
    const s = this.sim, v = this.view, hud = this.app.hud;
    s.dead = true;
    s.deadAt = { ...pos, t: s.t, lt: earthMarsLightTime().seconds, fromLZ: Math.hypot(pos.x - this.waypoints[0].x, pos.z - this.waypoints[0].z) * 1000 };
    this.setEvaLook(true);
    if (this.o2Item) this.o2Item.hiddenByUser = true; // EV1's red marker takes its place
    this.evaItem.hiddenByUser = !!this.app.fpv?.active; // in the helmet you are EV1
    hud.banner('EV1 LOST · O₂ EXHAUSTED', 'nogo', 4600);
    hud.flash(0.55, 1400, 'red');
    this.app.sound?.flatline();
    if (this.app.fpv?.active) this.app.fpv.onDeath(s.deadAt);
    else v.flyTo({ target: new THREE.Vector3(pos.x, v.yAt(pos.x, pos.z), pos.z), dist: 0.9, el: 0.78 }, 2.2);
    hud.updateSim(this, s.t, s.state);
    clearTimeout(this._mayday);
    this._mayday = setTimeout(() => {
      if (this.sim !== s) return;
      const m = Math.round(s.deadAt.lt / 60);
      hud.toast(`MAYDAY SENT · EARTH HEARS IT IN ${m} MIN · TOO LATE`, 4200);
    }, 3200);
  }

  frame() {
    // keep waypoint markers glued to terrain (exaggeration changes)
    const v = this.view;
    const lift = v.markerLift(1.5);
    for (const it of this.wpItems || []) it.world.set(it.xz.x, v.yAt(it.xz.x, it.xz.z) + lift, it.xz.z);
  }
}

// ------------------------------------------------------------------ helpers
function chaikin(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
  }
  out.push(pts.at(-1));
  return out;
}

/** resample polyline (km) every `step` km; returns [{x,z,d(m),e(m)}] */
function resample(pts, step, elevAt) {
  const out = [];
  let d = 0;
  out.push({ x: pts[0].x, z: pts[0].z, d: 0, e: elevAt(pts[0].x, pts[0].z) });
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
      out.push({ x, z, d: (d + len * f) * 1000, e: elevAt(x, z) });
    }
    d += len;
  }
  return out;
}

export function sampleAt(samples, d) {
  let lo = 0, hi = samples.length - 1;
  if (d <= 0) return samples[0];
  if (d >= samples[hi].d) return samples[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].d < d) lo = m; else hi = m; }
  const a = samples[lo], b = samples[hi];
  const f = (d - a.d) / (b.d - a.d || 1);
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, d, e: a.e + (b.e - a.e) * f };
}

function interp(arr, kIn, v, kOut) {
  let lo = 0, hi = arr.length - 1;
  if (v <= arr[0][kIn]) return arr[0][kOut];
  if (v >= arr[hi][kIn]) return arr[hi][kOut];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m][kIn] < v) lo = m; else hi = m; }
  const a = arr[lo], b = arr[hi];
  const f = (v - a[kIn]) / (b[kIn] - a[kIn] || 1);
  return a[kOut] + (b[kOut] - a[kOut]) * f;
}

export { fmtDist, fmtDur, fmtNum, formatHM, walkSpeed, metabolicW };
