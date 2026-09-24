import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { terrainVert, terrainFrag, wallVert, wallFrag, floorVert, floorFrag, bakeVert, bakeFrag } from './shaders.js';
import { Tweens, damp, ease, lerpAngle, fmtLat, fmtLon, fmtNum, R_MARS_KM } from '../lib/geo.js';
import { marsTime, sunPosition, localTime } from '../lib/marstime.js';

export const TERRAIN_LAYERS = [
  { id: 'visible', key: '1', name: 'Visible', srcCrater: 'MRO CTX 5 m mosaic (JPL)', srcSite: 'MRO HiRISE 25 cm mosaic', base: true },
  { id: 'elev', key: '2', name: 'Elevation', srcCrater: 'MRO CTX stereo DEM, 20 m', srcSite: 'MRO HiRISE DTM, 1 m' },
  { id: 'slope', key: '3', name: 'Slope hazard', srcCrater: 'Derived from CTX DEM', srcSite: 'Derived from HiRISE DTM' },
  { id: 'thermal', key: '4', name: 'Ground firmness', srcCrater: 'Mars Odyssey THEMIS · night IR', srcSite: 'Mars Odyssey THEMIS · night IR' },
  { id: 'contour', key: '5', name: 'Contours', srcCrater: 'from DEM', srcSite: 'from DTM' },
  { id: 'holo', key: '6', name: 'Holo mode', srcCrater: 'display style', srcSite: 'display style' },
  { id: 'minerals', key: '', name: 'Minerals', srcCrater: 'MRO CRISM · phase 2', srcSite: 'MRO CRISM · phase 2', locked: true },
  { id: 'weather', key: '', name: 'Live weather', srcCrater: 'Perseverance MEDA · phase 2', srcSite: 'Perseverance MEDA · phase 2', locked: true },
];

const _v = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _res = new THREE.Vector2();

export class TerrainView {
  /**
   * cfg: { id, meta, heights, tex:{visible,normal,slope,thermal}, pois, exag, contour:[minor,major], gridKm,
   *        dist:[min,max], overview:{dist,el,az}, strata, lat0 }
   */
  constructor(app, cfg) {
    this.app = app;
    this.cfg = cfg;
    this.id = cfg.id;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050507);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 4000);
    this.tweens = new Tweens();
    this.meta = cfg.meta;
    this.sizeX = cfg.meta.sizeM[0] / 1000;
    this.sizeZ = cfg.meta.sizeM[1] / 1000;
    this.exag = cfg.exag;
    this.exagTarget = cfg.exag;
    this.cam = { target: new THREE.Vector3(), dist: cfg.overview.dist, el: cfg.overview.el, az: cfg.overview.az };
    this.camGoal = null;
    this.time = 0;
    this.lastUser = -10;
    this.pushOut = 0;
    this.pushIn = 0;
    this.layers = { visible: true, elev: false, slope: false, thermal: false, contour: false, holo: false };
    this.w = { visible: 1, elev: 0, slope: 0, thermal: 0, contour: 0, holo: 0 };
    this.pointer = new THREE.Vector2(-9, -9);
    this.cursor = null;
    this.mode = 'idle';
    const mt = marsTime();
    this.decl = mt.decl;
    // Sun: the real current local time at Jezero if it is daytime, else the view's default.
    const now = localTime(mt, cfg.lon0).ltst;
    this.ltst = cfg.ltst ?? (now > 7.5 && now < 16.5 ? now : 15.8);
    this.shadows = true;
    this.lat0 = cfg.lat0;
  }

  // ------------------------------------------------------------------ geometry helpers
  lonlatToXZ(lat, lon) {
    const m = this.meta;
    const u = (lon - m.lon[0]) / (m.lon[1] - m.lon[0]);
    const v = (m.lat[1] - lat) / (m.lat[1] - m.lat[0]); // 0 north
    return { x: (u - 0.5) * this.sizeX, z: (v - 0.5) * this.sizeZ };
  }

  xzToLonLat(x, z) {
    const m = this.meta;
    const u = x / this.sizeX + 0.5, v = z / this.sizeZ + 0.5;
    return { lon: m.lon[0] + u * (m.lon[1] - m.lon[0]), lat: m.lat[1] - v * (m.lat[1] - m.lat[0]) };
  }

  /** elevation (m) at world x,z via bilinear lookup in the height grid */
  elevAt(x, z) {
    const { width: W, height: H, min, max } = this.meta;
    const u = THREE.MathUtils.clamp(x / this.sizeX + 0.5, 0, 1) * (W - 1);
    const v = THREE.MathUtils.clamp(z / this.sizeZ + 0.5, 0, 1) * (H - 1);
    const x0 = Math.floor(u), y0 = Math.floor(v), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
    const fx = u - x0, fy = v - y0, h = this.cfg.heights;
    const a = h[y0 * W + x0], b = h[y0 * W + x1], c = h[y1 * W + x0], d = h[y1 * W + x1];
    const q = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    return min + (q / 65535) * (max - min);
  }

  yAt(x, z, exag = this.exag) {
    return ((this.elevAt(x, z) - this.h0) / 1000) * exag - (x * x + z * z) * this.curv;
  }

  // ------------------------------------------------------------------ build
  build() {
    const { meta, tex, heights } = this.cfg;
    const W = meta.width, H = meta.height;
    const sorted = Float32Array.from(heights.filter((_, i) => i % 97 === 0)).sort();
    this.h0 = meta.min + (sorted[sorted.length >> 1] / 65535) * (meta.max - meta.min);
    this.curv = 1 / (2 * R_MARS_KM);
    this.texelKm = this.sizeX / W;

    const aH = new Float32Array(W * H);
    for (let i = 0; i < aH.length; i++) aH[i] = heights[i] / 65535;

    // terrain mesh: phones use every other sample (4x fewer vertices), resampled bilinearly
    const step = this.cfg.meshStep || 1;
    const Wm = Math.round((W - 1) / step) + 1, Hm = Math.round((H - 1) / step) + 1;
    const aHm = step === 1 ? aH : resampleGrid(aH, W, H, Wm, Hm);
    const geo = new THREE.PlaneGeometry(this.sizeX, this.sizeZ, Wm - 1, Hm - 1);
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute('aH', new THREE.BufferAttribute(aHm, 1));

    // height texture for shadow rays (rows flipped so v=1 is north)
    const half = new Uint16Array(W * H);
    for (let r = 0; r < H; r++) {
      const src = r * W, dst = (H - 1 - r) * W;
      for (let c = 0; c < W; c++) half[dst + c] = THREE.DataUtils.toHalfFloat(aH[src + c]);
    }
    const hTex = new THREE.DataTexture(half, W, H, THREE.RedFormat, THREE.HalfFloatType);
    hTex.minFilter = hTex.magFilter = THREE.LinearFilter;
    hTex.needsUpdate = true;

    for (const k of ['visible', 'normal', 'slope', 'thermal']) tex[k].generateMipmaps = true;
    tex.slope.minFilter = THREE.LinearFilter; // no mips: keep hazard edges crisp

    // baked sun visibility (see bakeShadows); phones bake at half resolution
    const bakeScale = step > 1 ? 0.5 : 1;
    this.shadowRT = new THREE.WebGLRenderTarget(Math.round(W * bakeScale), Math.round(H * bakeScale), {
      format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    this.bakedSun = new THREE.Vector3(0, -1, 0);
    this.bakedExag = -1;

    this.uniforms = {
      tVis: { value: tex.visible }, tNormal: { value: tex.normal }, tSlope: { value: tex.slope }, tTherm: { value: tex.thermal }, tShadow: { value: this.shadowRT.texture },
      uSize: { value: new THREE.Vector2(this.sizeX, this.sizeZ) },
      uExag: { value: this.exag }, uHmin: { value: meta.min }, uHmax: { value: meta.max }, uH0: { value: this.h0 }, uCurv: { value: this.curv },
      uTexelKm: { value: this.texelKm },
      uSun: { value: new THREE.Vector3(0.5, 0.5, 0.5).normalize() },
      wVis: { value: 1 }, wElev: { value: 0 }, wSlope: { value: 0 }, wTherm: { value: 0 }, wContour: { value: 0 }, wHolo: { value: 0 }, wGrid: { value: 0 },
      uContourMinor: { value: this.cfg.contour[0] }, uContourMajor: { value: this.cfg.contour[1] }, uGridKm: { value: this.cfg.gridKm },
      uCursor: { value: new THREE.Vector3(0, 0, 0) }, uCursorR: { value: this.sizeX * 0.012 },
      uBox: { value: new THREE.Vector4() }, uBoxOn: { value: 0 },
      uPulse: { value: new THREE.Vector4(0, 0, 0, 0) },
      uTime: { value: 0 }, uShadowOn: { value: 1 },
      uSlopeLim: { value: new THREE.Vector3(...this.cfg.slopeLim) },
      uReveal: { value: 1 },
    };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: terrainVert, fragmentShader: terrainFrag, uniforms: this.uniforms,
    }));
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    const steps = this.cfg.shadowSteps || 64;
    const growth = steps >= 64 ? 1.075 : steps >= 48 ? 1.1 : 1.16; // every tier reaches across the whole tile
    this.bakeMat = new THREE.ShaderMaterial({
      vertexShader: bakeVert, fragmentShader: bakeFrag,
      defines: { SHADOW_STEPS: steps, SHADOW_GROWTH: growth.toFixed(3) },
      uniforms: {
        tHeight: { value: hTex }, uSize: this.uniforms.uSize, uExag: this.uniforms.uExag, uHmin: this.uniforms.uHmin,
        uHmax: this.uniforms.uHmax, uH0: this.uniforms.uH0, uCurv: this.uniforms.uCurv, uTexelKm: this.uniforms.uTexelKm,
        uSun: { value: new THREE.Vector3() },
      },
      depthTest: false, depthWrite: false,
    });
    this.bakeScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bakeMat);
    quad.frustumCulled = false;
    this.bakeScene.add(quad);
    this.bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // walls
    this.baseY = ((meta.min - this.h0) / 1000) * this.exag - this.sizeX * 0.04;
    this.wallUniforms = {
      uExag: this.uniforms.uExag, uHmin: this.uniforms.uHmin, uHmax: this.uniforms.uHmax, uH0: this.uniforms.uH0, uCurv: this.uniforms.uCurv,
      uBaseY: { value: this.baseY }, uStrata: { value: this.cfg.strata }, uReveal: this.uniforms.uReveal,
    };
    const walls = new THREE.Mesh(this.makeWalls(aHm, Wm, Hm), new THREE.ShaderMaterial({
      vertexShader: wallVert, fragmentShader: wallFrag, uniforms: this.wallUniforms, side: THREE.DoubleSide,
    }));
    walls.frustumCulled = false;
    this.scene.add(walls);

    // holo-table floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(this.sizeX * 5, this.sizeZ * 5).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        vertexShader: floorVert, fragmentShader: floorFrag, transparent: false,
        uniforms: { uGrid: { value: this.cfg.gridKm }, uSize: this.uniforms.uSize, uReveal: this.uniforms.uReveal },
      }));
    this.floor = floor;
    floor.position.y = this.baseY - this.sizeX * 0.01;
    this.scene.add(floor);

    this.buildPOIs();
    this.buildRouteObjects();
  }

  makeWalls(aH, W, H) {
    const pos = [], hs = [], base = [], idx = [];
    const hx = this.sizeX / 2, hz = this.sizeZ / 2;
    const edges = [
      Array.from({ length: W }, (_, c) => [c, 0]),
      Array.from({ length: H }, (_, r) => [W - 1, r]),
      Array.from({ length: W }, (_, c) => [W - 1 - c, H - 1]),
      Array.from({ length: H }, (_, r) => [0, H - 1 - r]),
    ];
    for (const edge of edges) {
      const start = pos.length / 3;
      for (const [c, r] of edge) {
        const x = -hx + (c / (W - 1)) * this.sizeX, z = -hz + (r / (H - 1)) * this.sizeZ;
        const h = aH[r * W + c];
        pos.push(x, 0, z, x, 0, z);
        hs.push(h, h);
        base.push(0, 1);
      }
      for (let i = 0; i < edge.length - 1; i++) {
        const a = start + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(hs, 1));
    g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 1));
    g.setIndex(idx);
    return g;
  }

  buildPOIs() {
    const labels = this.app.labels;
    this.poiItems = [];
    const stalkPts = [];
    for (const p of this.cfg.pois) {
      const { x, z } = this.lonlatToXZ(p.lat, p.lon);
      if (Math.abs(x) > this.sizeX / 2 || Math.abs(z) > this.sizeZ / 2) continue;
      const siteTag = { lz: 'Airlock · proposed', landing: 'Historic site', science: 'Sample depot', geology: 'Science stop' }[p.kind];
      const tag = this.id === 'site' ? siteTag : p.proposed ? 'Proposed · Sol Atlas' : p.approx ? 'Approx. position' : fmtLat(p.lat) + ' ' + fmtLon(p.lon);
      const html = `<div class="dot"></div><div class="lb">${p.name}<small>${tag}</small></div>
        <div class="card"><b>${p.name}</b>${p.reason && this.id === 'site' ? `<span style="color:var(--data)">${p.reason}.</span> ` : ''}${p.text}<em>Source: ${p.source}</em>${this.id === 'site' && p.id !== 'lz' ? '<em style="color:var(--data)">Click to add it to the Marswalk</em>' : ''}</div>`;
      const item = labels.add(this.id, {
        className: `poi k-${p.kind}`, html, world: new THREE.Vector3(x, 0, z),
        onClick: () => this.app.onPOIClick(this, p),
        occlude: () => false,
        priority: { lz: 6, landing: 5, science: 5, geology: 2 }[p.kind] ?? 1,
      });
      item.poi = p;
      item.xz = { x, z };
      this.poiItems.push(item);
      stalkPts.push(x, 0, z, x, 0, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(stalkPts, 3));
    this.stalks = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: 0.55 }));
    this.stalks.frustumCulled = false;
    this.scene.add(this.stalks);
    this.updateStalks();
  }

  stalkH() { return Math.max(this.cam.dist * 0.045, this.sizeX * 0.004); }

  updateStalks() {
    const a = this.stalks.geometry.attributes.position;
    const sh = this.stalkH();
    this.poiItems.forEach((it, i) => {
      const y = this.yAt(it.xz.x, it.xz.z);
      a.setY(i * 2, y);
      a.setY(i * 2 + 1, y + sh);
      it.world.set(it.xz.x, y + sh, it.xz.z);
    });
    a.needsUpdate = true;
  }

  // ------------------------------------------------------------------ route rendering
  buildRouteObjects() {
    this.routeMat = new LineMaterial({ color: 0x5fd4ff, linewidth: 3.2, transparent: true, opacity: 0.95, depthTest: true, worldUnits: false });
    this.routeGlowMat = new LineMaterial({ color: 0x5fd4ff, linewidth: 11, transparent: true, opacity: 0.18, depthTest: true, worldUnits: false });
    this.routeFlowMat = new LineMaterial({ color: 0xffffff, linewidth: 2.2, dashed: true, dashSize: 1, gapSize: 1, transparent: true, opacity: 0.85, worldUnits: false });
    this.directMat = new LineMaterial({ color: 0xd03b3b, linewidth: 1.6, dashed: true, dashSize: 1, gapSize: 1, transparent: true, opacity: 0.7, worldUnits: false });
    this.routeLines = null;
    this.routeXZ = null;
  }

  setRoute(xz, directXZ = null) {
    if (this.routeLines) { this.routeLines.forEach((l) => { this.scene.remove(l); l.geometry.dispose(); }); }
    this.routeLines = null;
    this.routeXZ = xz;
    this.directXZ = directXZ;
    if (!xz || xz.length < 2) return;
    const mk = (pts, mat, lift) => {
      const g = new LineGeometry();
      g.setPositions(this.liftPoints(pts, lift));
      const l = new Line2(g, mat);
      l.computeLineDistances();
      l.frustumCulled = false;
      l.userData = { pts, lift };
      this.scene.add(l);
      return l;
    };
    const lift = this.sizeX * 0.0012;
    this.routeLines = [mk(xz, this.routeGlowMat, lift), mk(xz, this.routeMat, lift), mk(xz, this.routeFlowMat, lift * 1.2)];
    if (directXZ) this.routeLines.push(mk(directXZ, this.directMat, lift * 1.4));
    const total = this.routeLines[2].geometry.attributes.instanceDistanceEnd?.array.at(-1) || this.sizeX;
    this.routeFlowMat.dashSize = total / 160;
    this.routeFlowMat.gapSize = total / 90;
    this.directMat.dashSize = this.sizeX / 200;
    this.directMat.gapSize = this.sizeX / 260;
  }

  liftPoints(pts, lift) {
    const out = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => {
      out[i * 3] = p.x;
      out[i * 3 + 1] = this.yAt(p.x, p.z) + lift;
      out[i * 3 + 2] = p.z;
    });
    return out;
  }

  refreshRouteHeights() {
    if (!this.routeLines) return;
    for (const l of this.routeLines) {
      l.geometry.setPositions(this.liftPoints(l.userData.pts, l.userData.lift));
      l.computeLineDistances();
    }
  }

  // ------------------------------------------------------------------ camera
  applyCamera() {
    const { target, dist, el, az } = this.cam;
    const ce = Math.cos(el);
    this.camera.position.set(target.x + Math.sin(az) * ce * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(az) * ce * dist);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
    this.camera.near = Math.max(0.005, dist * 0.02);
    this.camera.far = dist * 30 + this.sizeX * 10;
    this.camera.updateProjectionMatrix();
  }

  /** Tween the camera to {target, dist, el, az}. */
  flyTo(goal, dur = 2.0, easing = ease.inOut) {
    const s = { target: this.cam.target.clone(), dist: this.cam.dist, el: this.cam.el, az: this.cam.az };
    const g = { target: goal.target ? goal.target.clone() : s.target.clone(), dist: goal.dist ?? s.dist, el: goal.el ?? s.el, az: goal.az ?? s.az };
    this.mode = 'fly';
    return this.tweens.add(dur, (t) => {
      this.cam.target.lerpVectors(s.target, g.target, t);
      this.cam.dist = Math.exp(THREE.MathUtils.lerp(Math.log(s.dist), Math.log(g.dist), t));
      this.cam.el = THREE.MathUtils.lerp(s.el, g.el, t);
      this.cam.az = lerpAngle(s.az, g.az, t);
    }, easing).then(() => { this.mode = 'idle'; });
  }

  topDown(x, z, dist) {
    this.cam.target.set(x, this.yAt(x, z), z);
    this.cam.dist = dist;
    this.cam.el = Math.PI / 2 - 0.0015;
    this.cam.az = 0;
    this.applyCamera();
  }

  overview() {
    const o = this.cfg.overview;
    const t = o.target ? this.lonlatToXZ(o.target.lat, o.target.lon) : { x: 0, z: 0 };
    return { target: new THREE.Vector3(t.x, this.yAt(t.x, t.z), t.z), dist: o.dist, el: o.el, az: o.az };
  }

  pulse(x, z) {
    this.pulseT = 0;
    this.uniforms.uPulse.value.set(x, z, 0, 1);
  }

  // ------------------------------------------------------------------ input
  onWheel(e) {
    if (this.mode === 'fly' || this.mode === 'transit') return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 30 : 1);
    this.lastUser = this.time;
    const [dMin, dMax] = this.cfg.dist;
    if (dy > 0 && this.cam.dist >= dMax * 0.98) {
      this.pushOut += dy;
      if (this.pushOut > 260) { this.pushOut = 0; this.app.exitUp(this); }
      return;
    }
    this.pushOut = 0;
    if (dy < 0 && this.canEnterChild && this.cam.dist <= this.cfg.childEnterDist) {
      this.pushIn += -dy;
      if (this.pushIn > 260) { this.pushIn = 0; this.app.enterSite(); }
      return;
    }
    this.pushIn = Math.max(0, this.pushIn - 20);
    const old = this.cam.dist;
    const nd = THREE.MathUtils.clamp(old * Math.exp(dy * 0.0013), dMin, dMax);
    // zoom toward the cursor
    const hit = this.pick();
    if (hit && dy < 0) {
      const f = 1 - nd / old;
      this.cam.target.x += (hit.x - this.cam.target.x) * f;
      this.cam.target.z += (hit.z - this.cam.target.z) * f;
    }
    this.cam.dist = nd;
    this.clampTarget();
  }

  onDrag(dx, dy, buttons, shift) {
    if (this.mode === 'fly' || this.mode === 'transit') return;
    this.lastUser = this.time;
    if (buttons === 2 || shift) {
      const k = this.cam.dist * 0.0016;
      const ca = Math.cos(this.cam.az), sa = Math.sin(this.cam.az);
      this.cam.target.x += (-dx * ca - dy * sa) * k;
      this.cam.target.z += (dx * sa - dy * ca) * k;
      this.clampTarget();
    } else {
      this.cam.az -= dx * 0.005;
      this.cam.el = THREE.MathUtils.clamp(this.cam.el + dy * 0.004, 0.12, Math.PI / 2 - 0.0015);
    }
  }

  onKeyPan(dx, dz, dt) {
    const k = this.cam.dist * 0.8 * dt;
    const ca = Math.cos(this.cam.az), sa = Math.sin(this.cam.az);
    this.cam.target.x += (dx * ca + dz * sa) * k;
    this.cam.target.z += (-dx * sa + dz * ca) * k;
    this.clampTarget();
    this.lastUser = this.time;
  }

  clampTarget() {
    const t = this.cam.target;
    t.x = THREE.MathUtils.clamp(t.x, -this.sizeX / 2, this.sizeX / 2);
    t.z = THREE.MathUtils.clamp(t.z, -this.sizeZ / 2, this.sizeZ / 2);
  }

  onPointerMove(x, y) {
    this.pointer.set((x / this.app.w) * 2 - 1, -(y / this.app.h) * 2 + 1);
  }

  /** Ray-march the heightfield under the pointer. Returns world point or null. */
  pick(ndc = this.pointer) {
    _ray.setFromCamera(ndc, this.camera);
    const o = _ray.ray.origin, d = _ray.ray.direction;
    const hx = this.sizeX / 2, hz = this.sizeZ / 2;
    // intersect with the bounding box
    const yMin = this.baseY, yMax = ((this.meta.max - this.h0) / 1000) * this.exag + 0.01;
    let t0 = 0, t1 = 1e6;
    for (const [oo, dd, lo, hi] of [[o.x, d.x, -hx, hx], [o.y, d.y, yMin, yMax], [o.z, d.z, -hz, hz]]) {
      if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return null; continue; }
      let a = (lo - oo) / dd, b = (hi - oo) / dd;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
    const steps = 220;
    let prev = t0;
    for (let i = 1; i <= steps; i++) {
      const t = t0 + (t1 - t0) * (i / steps);
      _v.copy(o).addScaledVector(d, t);
      if (_v.y <= this.yAt(_v.x, _v.z)) {
        let a = prev, b = t;
        for (let k = 0; k < 12; k++) {
          const m = (a + b) / 2;
          _v.copy(o).addScaledVector(d, m);
          if (_v.y <= this.yAt(_v.x, _v.z)) b = m; else a = m;
        }
        _v.copy(o).addScaledVector(d, b);
        return _v.clone();
      }
      prev = t;
    }
    return null;
  }

  // ------------------------------------------------------------------ layers / time
  toggleLayer(id, on) {
    if (!(id in this.layers)) return;
    const next = on ?? !this.layers[id];
    // elevation / slope / thermal are exclusive colour overlays
    if (next && ['elev', 'slope', 'thermal'].includes(id)) for (const k of ['elev', 'slope', 'thermal']) this.layers[k] = false;
    this.layers[id] = next;
  }

  setTime(ltst) { this.ltst = ltst; }

  sunDir() {
    const s = sunPosition(this.lat0, this.ltst, this.decl);
    const el = s.elevation * Math.PI / 180, az = s.azimuth * Math.PI / 180;
    return { vec: new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)), ...s };
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.time += dt;
    this.tweens.update(dt);
    const u = this.uniforms;
    u.uTime.value = this.time;

    // exaggeration
    if (Math.abs(this.exag - this.exagTarget) > 1e-4) {
      this.exag = THREE.MathUtils.lerp(this.exag, this.exagTarget, damp(dt, 6));
      u.uExag.value = this.exag;
      this.baseY = ((this.meta.min - this.h0) / 1000) * this.exag - this.sizeX * 0.04;
      this.wallUniforms.uBaseY.value = this.baseY;
      this.floor.position.y = this.baseY - this.sizeX * 0.01;
      this.refreshRouteHeights();
    }

    // camera follows terrain height at target
    if (this.mode !== 'fly' && this.mode !== 'transit') {
      const ty = this.yAt(this.cam.target.x, this.cam.target.z);
      this.cam.target.y = THREE.MathUtils.lerp(this.cam.target.y, ty, damp(dt, 5));
      if (this.autoOrbit) this.cam.az += dt * this.autoOrbit;
    }
    this.applyCamera();
    this.updateStalks();

    // layers
    for (const k of Object.keys(this.w)) this.w[k] = THREE.MathUtils.lerp(this.w[k], this.layers[k] ? 1 : 0, damp(dt, 6));
    u.wVis.value = this.w.visible;
    u.wElev.value = this.w.elev;
    u.wSlope.value = this.w.slope;
    u.wTherm.value = this.w.thermal;
    u.wContour.value = this.w.contour;
    u.wHolo.value = this.w.holo;
    u.wGrid.value = this.w.holo * 0.8;
    u.uShadowOn.value = this.shadows ? 1 : 0;
    const sd = this.sunDir();
    u.uSun.value.copy(sd.vec);
    this.sun = sd;
    if (this.shadows && (sd.vec.dot(this.bakedSun) < 0.999995 || Math.abs(this.exag - this.bakedExag) > 1e-3)) this.bakeShadows();

    // pulse
    if (u.uPulse.value.w > 0.5) {
      this.pulseT += dt;
      u.uPulse.value.z = this.pulseT * Math.max(this.sizeX, this.sizeZ) * 0.35;
      if (this.pulseT > 3) u.uPulse.value.w = 0;
    }

    // cursor
    const hit = this.mode === 'fly' || this.mode === 'transit' ? null : this.pick();
    this.cursor = hit;
    if (hit) {
      u.uCursor.value.set(hit.x, hit.z, 1);
      u.uCursorR.value = this.cam.dist * 0.018;
    } else u.uCursor.value.z = 0;

    if (this.routeMat) {
      _res.set(this.app.w, this.app.h);
      for (const m of [this.routeMat, this.routeGlowMat, this.routeFlowMat, this.directMat]) m.resolution.copy(_res);
      this.routeFlowMat.dashOffset -= dt * (this.routeFlowMat.dashSize + this.routeFlowMat.gapSize) * 0.8;
    }
  }

  readout() {
    const out = [];
    const c = this.cursor;
    const d = this.cam.dist;
    out.push(['RANGE', d >= 10 ? `${fmtNum(d, 0)} km` : d >= 1 ? `${d.toFixed(2)} km` : `${fmtNum(d * 1000)} m`]);
    if (c) {
      const ll = this.xzToLonLat(c.x, c.z);
      const e = this.elevAt(c.x, c.z);
      out.push(['LAT', fmtLat(ll.lat)], ['LON', fmtLon(ll.lon)], ['ELEV', `${fmtNum(e)} m`]);
      const slope = this.slopeAt(c.x, c.z);
      if (slope != null) out.push(['SLOPE', `${slope.toFixed(1)}°`]);
    }
    return out;
  }

  slopeAt(x, z) {
    if (!this.slopeData) return null;
    const { w, h, data } = this.slopeData;
    const u = Math.floor(THREE.MathUtils.clamp(x / this.sizeX + 0.5, 0, 0.9999) * w);
    const v = Math.floor(THREE.MathUtils.clamp(z / this.sizeZ + 0.5, 0, 0.9999) * h);
    return data[(v * w + u) * 4] * 0.25;
  }

  /** Ray-march sun visibility for every heightfield texel into shadowRT (a few ms on the GPU). */
  bakeShadows() {
    const r = this.app.renderer;
    this.bakeMat.uniforms.uSun.value.copy(this.uniforms.uSun.value);
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.shadowRT);
    r.render(this.bakeScene, this.bakeCam);
    r.setRenderTarget(prev);
    this.bakedSun.copy(this.uniforms.uSun.value);
    this.bakedExag = this.exag;
  }

  /** Read the slope PNG back to the CPU (for readouts + pathfinding). */
  loadSlopeData() {
    const t = this.cfg.tex.slope;
    const img = t.image;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (t.userData.flippedBitmap) { g.translate(0, c.height); g.scale(1, -1); } // bitmap was decoded upside down for the GPU
    g.drawImage(img, 0, 0);
    this.slopeData = { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
  }
}

/** Bilinear resample of a row-major grid to a new size (both span the same extent). */
function resampleGrid(src, W, H, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (y / (h - 1)) * (H - 1), y0 = Math.floor(fy), y1 = Math.min(H - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = (x / (w - 1)) * (W - 1), x0 = Math.floor(fx), x1 = Math.min(W - 1, x0 + 1), tx = fx - x0;
      const a = src[y0 * W + x0], b = src[y0 * W + x1], c = src[y1 * W + x0], d = src[y1 * W + x1];
      out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}
