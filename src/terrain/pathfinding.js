// A* over a heightfield grid. Cost = metabolic energy (so the route minimises O2),
// with hard no-go cells where the fine-scale slope map exceeds the walking limit.
import { stepCost, EVA_DEFAULTS } from './eva.js';

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

export class CostGrid {
  /**
   * @param {Float32Array} elev  metres, row-major, row 0 = north
   * @param {number} w, h        grid size
   * @param {number} cellX, cellY cell size (m)
   * @param {Float32Array} fineSlope  max fine-scale slope per cell (deg) or null
   */
  constructor(elev, w, h, cellX, cellY, fineSlope = null) {
    Object.assign(this, { elev, w, h, cellX, cellY, fineSlope });
  }

  find(ax, ay, bx, by, params = EVA_DEFAULTS) {
    const { w, h, elev, cellX, cellY, fineSlope } = this;
    const N = w * h;
    const g = new Float64Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const start = ay * w + ax, goal = by * w + bx;
    const maxTan = Math.tan(params.maxSlope * Math.PI / 180);
    const flatJPerM = stepCost(1, 0, params) * 0.98;
    const heur = (i) => {
      const x = i % w, y = (i / w) | 0;
      return Math.hypot((x - bx) * cellX, (y - by) * cellY) * flatJPerM;
    };
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const heap = new Heap();
    g[start] = 0;
    heap.push(heur(start), start);
    let iter = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      if (cur === goal) break;
      closed[cur] = 1;
      if (++iter > 2e6) break;
      const cx = cur % w, cy = (cur / w) | 0;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (closed[ni]) continue;
        const dist = Math.hypot(dx * cellX, dy * cellY);
        const dh = elev[ni] - elev[cur];
        let pen = 1;
        if (Math.abs(dh) / dist > maxTan) pen = 40; // too steep between cells: allowed only as last resort
        if (fineSlope) {
          const fs = fineSlope[ni];
          if (fs > params.maxSlope) pen = Math.max(pen, 25);
          else if (fs > params.maxSlope * 0.7) pen = Math.max(pen, 1.6);
        }
        const c = g[cur] + stepCost(dist, dh, params) * pen;
        if (c < g[ni]) {
          g[ni] = c;
          from[ni] = cur;
          heap.push(c + heur(ni), ni);
        }
      }
    }
    if (from[goal] === -1 && goal !== start) return null;
    const path = [];
    for (let i = goal; i !== -1; i = from[i]) path.push([i % w, (i / w) | 0]);
    return path.reverse();
  }
}
