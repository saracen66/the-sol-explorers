import * as THREE from 'three';

export const R_MARS_KM = 3389.5;
export const DEG = Math.PI / 180;

/** Unit vector on the planet (object space). +Y = north pole, lon increases toward -Z. */
export function llToVec(lat, lon, r = 1, out = new THREE.Vector3()) {
  const la = lat * DEG, lo = lon * DEG;
  return out.set(Math.cos(la) * Math.cos(lo) * r, Math.sin(la) * r, -Math.cos(la) * Math.sin(lo) * r);
}

export function vecToLL(v) {
  const n = v.clone().normalize();
  return { lat: Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)) / DEG, lon: Math.atan2(-n.z, n.x) / DEG };
}

export function fmtLat(lat) { return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`; }
export function fmtLon(lon) {
  const l = ((lon + 540) % 360) - 180;
  return `${Math.abs(l).toFixed(4)}°${l >= 0 ? 'E' : 'W'}`;
}
export function fmtNum(v, d = 0) {
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export function fmtDist(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km` : `${Math.round(m)} m`;
}
export function fmtDur(sec) {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}

export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * t;
}
export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
};
export const damp = (dt, rate) => 1 - Math.exp(-dt * rate);

/** Simple tween runner: returns a promise resolved at the end. */
export class Tweens {
  constructor() { this.list = []; }
  add(duration, fn, easing = ease.inOut) {
    return new Promise((resolve) => this.list.push({ t: 0, duration, fn, easing, resolve }));
  }
  update(dt) {
    for (const tw of this.list) {
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      tw.fn(tw.easing(tw.t), tw.t);
      if (tw.t >= 1) tw.done = true;
    }
    this.list = this.list.filter((tw) => { if (tw.done) tw.resolve(); return !tw.done; });
  }
  clear() { this.list.forEach((t) => t.resolve()); this.list = []; }
  get busy() { return this.list.length > 0; }
}
