import * as THREE from 'three';
import { CostGrid } from './pathfinding.js';
import { EVA_DEFAULTS, budget, verdict, o2KgPerSec, walkSpeed, metabolicW } from './eva.js';
import { dayLength, formatHM } from '../lib/marstime.js';
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
    this.result.verdict = this.judge(this.result);
    v.setRoute(route, direct);
    this.renderMarkers();
    const prev = this.lastVerdict;
    this.lastVerdict = this.result.verdict.lvl;
    this.app.hud.renderPlanner(this);
    if (this.userEdit && this.lastVerdict === 'go' && prev !== 'go') this.app.hud.banner('MARSWALK READY', 'go');
    else if (this.userEdit && this.lastVerdict === 'nogo' && prev !== 'nogo') this.app.hud.banner('NO-GO · REPLAN', 'nogo');
    this.userEdit = false;
  }

  judge(r) {
    const vd = verdict(r.budget, r.sun, this.params);
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
    const step = Math.max(1, Math.floor(r.samples.length / 600));
    for (let i = 0; i < r.samples.length; i += step) {
      const s = r.samples[i];
      if (s.d > lastOut) break;
      const walked = interp(b.timeline, 'd', s.d, 'o2');
      const stops = r.stopAtD.filter((d) => d <= s.d).length * stopKg;
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
    r.events = null;
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
    this.hoverItem.world.set(s.x, v.yAt(s.x, s.z) + v.sizeX * 0.002, s.z);
    this.hoverItem.hiddenByUser = false;
  }

  // ------------------------------------------------------------------ EVA playback
  startSim(speed = 480) {
    if (!this.result || this.result.failed) return;
    this.sim = { t: 0, speed, stopIdx: 0 };
    this.evaItem.hiddenByUser = false;
    this.app.hud.toast('EVA SIMULATION · EV1 EGRESS');
  }

  stopSim() {
    this.sim = null;
    if (this.evaItem) this.evaItem.hiddenByUser = true;
    this.view.autoFollow = null;
  }

  /** position on route for simulated EVA time (s) — includes pauses at stops */
  stateAt(t) {
    const r = this.result, b = r.budget, p = this.params;
    const stopDur = p.stopMin * 60;
    // build an event list once
    if (!r.events) {
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
    const e = r.events.find((x) => t <= x.t1) || r.events.at(-1);
    const f = e.t1 > e.t0 ? THREE.MathUtils.clamp((t - e.t0) / (e.t1 - e.t0), 0, 1) : 1;
    let d;
    if (e.kind === 'walk') {
      const w0 = interp(b.timeline, 'd', e.d0, 't');
      const w1 = interp(b.timeline, 'd', e.d1, 't');
      d = interp(b.timeline, 't', w0 + (w1 - w0) * f, 'd');
    } else d = e.d0;
    return { d, o2: e.o0 + (e.o1 - e.o0) * f, kind: e.kind, done: t >= r.events.at(-1).t1 };
  }

  update(dt) {
    if (!this.sim || !this.result) return;
    const s = this.sim;
    s.t += dt * s.speed;
    const st = this.stateAt(s.t);
    const pos = sampleAt(this.result.samples, st.d);
    const v = this.view;
    const y = v.yAt(pos.x, pos.z);
    this.evaItem.world.set(pos.x, y + v.sizeX * 0.002, pos.z);
    if (this.follow) {
      v.cam.target.x += (pos.x - v.cam.target.x) * Math.min(1, dt * 2.5);
      v.cam.target.z += (pos.z - v.cam.target.z) * Math.min(1, dt * 2.5);
    }
    s.state = st;
    this.app.hud.updateSim(this, s.t, st);
    if (st.done) {
      this.app.hud.toast('EV1 BACK AT LZ-A · INGRESS');
      this.sim = null;
      setTimeout(() => this.evaItem && (this.evaItem.hiddenByUser = true), 2500);
      this.app.hud.updateSim(this, null, null);
    }
  }

  frame() {
    // keep waypoint markers glued to terrain (exaggeration changes)
    const v = this.view;
    for (const it of this.wpItems || []) it.world.set(it.xz.x, v.yAt(it.xz.x, it.xz.z) + v.sizeX * 0.003, it.xz.z);
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
