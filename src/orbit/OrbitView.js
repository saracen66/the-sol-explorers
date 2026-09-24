import * as THREE from 'three';
import { planetVert, planetFrag, atmoVert, atmoFrag, starVert, starFrag, skyVert, skyFrag } from './shaders.js';
import { llToVec, vecToLL, lerpAngle, damp, ease, Tweens, R_MARS_KM, DEG, fmtLat, fmtLon, fmtNum } from '../lib/geo.js';
import { LANDING_SITES } from '../data/places.js';

const MIN_ALT = 0.115; // planet radii (~390 km)
const MAX_ALT = 7.0;

export const ORBIT_LAYERS = [
  { id: 'visible', key: '1', name: 'Visible colour', src: 'Viking Orbiter · MDIM 2.1 (NASA Ames)' },
  { id: 'topo', key: '2', name: 'Topography', src: 'Mars Global Surveyor · MOLA' },
  { id: 'thermal', key: '3', name: 'Night thermal IR', src: 'Mars Odyssey · THEMIS' },
];

export class OrbitView {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.002, 3000);
    this.sunWorld = new THREE.Vector3(-0.66, 0.30, 0.69).normalize();
    this.tweens = new Tweens();
    this.jezero = LANDING_SITES[0];
    this.jezeroObj = llToVec(this.jezero.lat, this.jezero.lon);
    this.spin = this.spinFor(this.jezero) - 1.1;
    this.spinVel = 0;
    this.pitch = 0.22;
    this.pitchVel = 0;
    this.alt = 3.4;
    this.altTarget = 3.4;
    this.lastUser = -10;
    this.time = 0;
    this.layer = 'visible';
    this.weights = { visible: 1, topo: 0, thermal: 0 };
    this.grid = 0.35;
    this.autoSpin = true;
    this.locked = false;
    this.pushIn = 0; // accumulated scroll-in at min altitude
    this.mode = 'free'; // free | auto | transit
    this.pointer = new THREE.Vector2(-9, -9);
  }

  spinFor(site) {
    // planet yaw that brings `site` to face the camera (camera sits on +Z)
    const p = llToVec(site.lat, site.lon);
    return -Math.atan2(p.x, p.z);
  }

  build(assets) {
    const { tex, manifest } = assets;
    const s = this.scene;

    // background sky + stars
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24),
      new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false }));
    s.add(sky);
    s.add(this.makeStars());

    // sun glare (billboard far away)
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture([[0, 'rgba(255,245,230,1)'], [0.08, 'rgba(255,220,180,.9)'], [0.25, 'rgba(255,160,90,.25)'], [1, 'rgba(255,120,60,0)']]),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    glare.position.copy(this.sunWorld).multiplyScalar(800);
    glare.scale.setScalar(120);
    s.add(glare);

    // Mars
    const r = manifest.region, c = manifest.crater;
    this.uniforms = {
      uColor: { value: tex.g_color }, uNormal: { value: tex.g_normal }, uTopo: { value: tex.g_topo }, uThermal: { value: tex.g_thermal },
      rColor: { value: tex.r_color }, rNormal: { value: tex.r_normal }, rTopo: { value: tex.r_topo }, rThermal: { value: tex.r_thermal },
      cDecal: { value: tex.c_decal },
      rB: { value: new THREE.Vector4(r.lon[0], r.lat[0], r.lon[1], r.lat[1]) },
      cB: { value: new THREE.Vector4(c.lon[0], c.lat[0], c.lon[1], c.lat[1]) },
      wVis: { value: 1 }, wTopo: { value: 0 }, wTherm: { value: 0 },
      uDecal: { value: 0 }, uCDecal: { value: 0 },
      uSunObj: { value: new THREE.Vector3() }, uSunWorld: { value: this.sunWorld },
      uGrid: { value: this.grid }, uTime: { value: 0 },
      uTargetObj: { value: llToVec(18.40, 77.60) }, uTarget: { value: 0 },
      uNormalStrength: { value: 1.0 },
    };
    this.planet = new THREE.Mesh(
      new THREE.SphereGeometry(1, 384, 192),
      new THREE.ShaderMaterial({ vertexShader: planetVert, fragmentShader: planetFrag, uniforms: this.uniforms }),
    );
    s.add(this.planet);

    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(1.035, 128, 64), new THREE.ShaderMaterial({
      vertexShader: atmoVert, fragmentShader: atmoFrag, side: THREE.BackSide, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { uSunWorld: { value: this.sunWorld }, uStrength: { value: 1.25 } },
    }));
    s.add(this.atmo);

    // moons (sizes exaggerated ~6x so they read on screen; orbits to scale)
    const light = new THREE.DirectionalLight(0xfff1e0, 2.6);
    light.position.copy(this.sunWorld);
    s.add(light, new THREE.AmbientLight(0x404050, 0.25));
    this.moons = [
      { name: 'PHOBOS', r: 2.76, size: 0.022, period: 38, phase: 0.6, incl: 1.1 * DEG },
      { name: 'DEIMOS', r: 6.92, size: 0.014, period: 150, phase: 2.4, incl: 1.8 * DEG },
    ].map((m) => {
      const mesh = new THREE.Mesh(lumpyRock(m.size, m.name === 'PHOBOS' ? 1.35 : 1.15, m.name.length),
        new THREE.MeshStandardMaterial({ color: 0x7a6a5d, roughness: 1, metalness: 0 }));
      s.add(mesh);
      const pts = [];
      for (let i = 0; i <= 256; i++) {
        const a = (i / 256) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * m.r, 0, Math.sin(a) * m.r));
      }
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.22 }));
      ring.rotation.x = m.incl;
      s.add(ring);
      return { ...m, mesh, ring };
    });

    // markers
    const labels = this.app.labels;
    this.markers = LANDING_SITES.map((site) => {
      const cls = site.status === 'active' ? 'active' : site.status === 'fiction' ? 'fiction' : 'locked';
      const statusText = site.status === 'active' ? 'Survey available' : site.status === 'fiction' ? 'Fictional site' : 'Locked · phase 2';
      const html = `<div class="dot"></div><div class="lb">${site.name}<small>${site.mission} · ${site.year}</small></div>
        <div class="card"><b>${site.name}</b>${site.blurb || `${site.mission} landed here in ${site.year}. This survey is locked in the first build; we are opening Jezero first.`}<em>${statusText} · ${fmtLat(site.lat)} ${fmtLon(site.lon)}</em></div>`;
      const item = labels.add('orbit', {
        className: cls, html, world: new THREE.Vector3(),
        onClick: () => (site.status === 'active' ? this.app.descendToJezero() : this.app.hud.toast(site.status === 'fiction' ? 'Fictional site · Ares III never happened (yet)' : `${site.name.toUpperCase()} · SURVEY LOCKED IN PHASE 1`)),
        occlude: (it) => this.occluded(it.world) || (this.alt < 0.5 && site.status !== 'active'),
        priority: site.status === 'active' ? 10 : site.status === 'fiction' ? 3 : 1,
      });
      item.site = site;
      item.obj = llToVec(site.lat, site.lon, 1.002);
      return item;
    });
    this.moonLabels = this.moons.map((m) => labels.add('orbit', {
      className: 'locked', html: `<div class="lb" style="left:8px;top:-7px;font-size:11px;color:var(--text-3)">${m.name}</div>`,
      world: new THREE.Vector3(), occlude: (it) => this.occluded(it.world, 0.03),
    }));
  }

  makeStars() {
    const n = 7000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    const rnd = mulberry(7);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = 800;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(t) * s * r, u * r, Math.sin(t) * s * r], i * 3);
      const temp = rnd();
      const c = temp < 0.15 ? [0.7, 0.8, 1] : temp < 0.8 ? [1, 0.97, 0.92] : [1, 0.82, 0.62];
      const b = Math.pow(rnd(), 6) * 0.9 + 0.12;
      col.set(c.map((x) => x * b), i * 3);
      size[i] = 1.2 + Math.pow(rnd(), 10) * 5.5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.starUniforms = { uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } };
    return new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: starVert, fragmentShader: starFrag, uniforms: this.starUniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
  }

  occluded(world, pad = 0.0) {
    // hidden if the point is on the far side of the planet as seen from the camera
    const cam = this.camera.position;
    const toP = world.clone().sub(cam);
    const len = toP.length();
    toP.normalize();
    const b = cam.dot(toP);
    const c = cam.lengthSq() - (1 - pad) ** 2;
    const disc = b * b - c;
    if (disc < 0) return false;
    const tHit = -b - Math.sqrt(disc);
    return tHit > 0 && tHit < len - 0.004;
  }

  setLayer(id) {
    this.layer = id;
  }

  // ------------------------------------------------------------------ input
  onWheel(e) {
    if (this.mode === 'transit') return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 30 : 1);
    this.lastUser = this.time;
    if (dy < 0 && this.alt <= MIN_ALT * 1.02 && this.locked) {
      this.pushIn += -dy;
      if (this.pushIn > 240) { this.pushIn = 0; this.app.descendToJezero(); }
      return;
    }
    this.pushIn = Math.max(0, this.pushIn - Math.abs(dy) * 0.5);
    this.altTarget = THREE.MathUtils.clamp(this.altTarget * Math.exp(dy * 0.0014), MIN_ALT, MAX_ALT);
  }

  onDrag(dx, dy) {
    if (this.mode === 'transit') return;
    const k = 0.0042 * Math.min(1, this.alt * 0.6 + 0.08);
    this.spinVel = dx * k * 60;
    this.pitchVel = dy * k * 60;
    this.spin += dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, -1.25, 1.25);
    this.lastUser = this.time;
    this.mode = 'free';
  }

  onPointerMove(x, y) {
    this.pointer.set((x / this.app.w) * 2 - 1, -(y / this.app.h) * 2 + 1);
  }

  onClick() {}

  // ------------------------------------------------------------------ flights
  /** Fly to Jezero at low orbit. Resolves when centred. */
  async flyToJezero(alt = MIN_ALT) {
    this.mode = 'transit';
    const s0 = this.spin, p0 = this.pitch, a0 = this.alt;
    const s1 = this.spinFor(this.cTile()), p1 = this.cTile().lat * DEG;
    const dur = 1.2 + Math.min(2.2, Math.abs(Math.log(a0 / alt)) * 0.55);
    await this.tweens.add(dur, (t) => {
      this.spin = lerpAngle(s0, s1, t);
      this.pitch = THREE.MathUtils.lerp(p0, p1, t);
      this.alt = Math.exp(THREE.MathUtils.lerp(Math.log(a0), Math.log(alt), t));
    });
    this.altTarget = this.alt;
  }

  /** Crater tile centre: where the orbit view hands over to the terrain view. */
  cTile() {
    const c = this.app.assets.manifest.crater;
    return { lat: (c.lat[0] + c.lat[1]) / 2, lon: (c.lon[0] + c.lon[1]) / 2 };
  }

  /** From low orbit straight down to the hand-over altitude (km). */
  async dive(handoverKm, onAlt) {
    this.mode = 'transit';
    const a0 = this.alt, a1 = handoverKm / R_MARS_KM;
    await this.tweens.add(2.6, (t) => {
      this.alt = Math.exp(THREE.MathUtils.lerp(Math.log(a0), Math.log(a1), t));
      onAlt?.(this.alt * R_MARS_KM);
    }, ease.inOut);
  }

  /** Reverse of dive(): start at hand-over altitude above the crater and climb out. */
  async climb(handoverKm, onAlt) {
    const tile = this.cTile();
    this.mode = 'transit';
    this.spin = this.spinFor(tile);
    this.pitch = tile.lat * DEG;
    const a0 = handoverKm / R_MARS_KM, a1 = 0.9;
    this.alt = a0;
    await this.tweens.add(3.0, (t) => {
      this.alt = Math.exp(THREE.MathUtils.lerp(Math.log(a0), Math.log(a1), t));
      onAlt?.(this.alt * R_MARS_KM);
    }, ease.out);
    this.altTarget = this.alt;
    this.mode = 'free';
    this.lastUser = this.time;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.time += dt;
    this.tweens.update(dt);
    const idle = this.time - this.lastUser;

    if (this.mode !== 'transit') {
      this.alt = THREE.MathUtils.lerp(this.alt, this.altTarget, damp(dt, 6));
      // inertia
      if (idle > 0.05) {
        this.spin += this.spinVel * dt;
        this.pitch = THREE.MathUtils.clamp(this.pitch + this.pitchVel * dt, -1.25, 1.25);
        this.spinVel *= Math.exp(-dt * 3);
        this.pitchVel *= Math.exp(-dt * 3);
      }
      // target assist: closer than ~1 radius, steer toward Jezero (only site unlocked)
      const assist = THREE.MathUtils.smoothstep(1.2, 0.35, this.alt) * (idle > 1.2 ? 1 : 0);
      if (assist > 0) {
        const tile = this.cTile();
        this.spin = lerpAngle(this.spin, this.spinFor(tile), damp(dt, 2.2 * assist));
        this.pitch = THREE.MathUtils.lerp(this.pitch, tile.lat * DEG, damp(dt, 2.2 * assist));
      } else if (this.autoSpin && idle > 2.5) {
        this.spin += dt * 0.035 * Math.min(1, (idle - 2.5) / 2);
      }
    }

    const dist = 1 + this.alt;
    this.camera.position.set(0, Math.sin(this.pitch) * dist, Math.cos(this.pitch) * dist);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
    this.camera.near = Math.max(0.0005, this.alt * 0.25);
    this.camera.updateProjectionMatrix();

    this.planet.rotation.y = this.spin;
    this.planet.updateMatrixWorld();
    const inv = new THREE.Matrix4().copy(this.planet.matrixWorld).invert();
    this.uniforms.uSunObj.value.copy(this.sunWorld).transformDirection(inv);

    // layers crossfade
    for (const k of Object.keys(this.weights)) {
      this.weights[k] = THREE.MathUtils.lerp(this.weights[k], k === this.layer ? 1 : 0, damp(dt, 5));
    }
    const u = this.uniforms;
    u.wVis.value = this.weights.visible;
    u.wTopo.value = this.weights.topo;
    u.wTherm.value = this.weights.thermal;
    u.uTime.value = this.time;
    u.uGrid.value = THREE.MathUtils.lerp(u.uGrid.value, this.grid * THREE.MathUtils.smoothstep(0.08, 0.6, this.alt), damp(dt, 4));
    u.uDecal.value = THREE.MathUtils.smoothstep(1.4, 0.45, this.alt);
    u.uCDecal.value = THREE.MathUtils.smoothstep(0.32, 0.14, this.alt);
    u.uNormalStrength.value = THREE.MathUtils.lerp(0.9, 1.6, THREE.MathUtils.smoothstep(1.0, 0.2, this.alt));

    // lock-on
    const tile = this.cTile();
    const toTile = llToVec(tile.lat, tile.lon).applyMatrix4(this.planet.matrixWorld).normalize();
    const camDir = this.camera.position.clone().normalize();
    const angOff = Math.acos(THREE.MathUtils.clamp(toTile.dot(camDir), -1, 1)) / DEG;
    this.locked = this.alt < 0.35 && angOff < 3.0;
    const tgt = this.alt < 1.4 ? 1 : 0;
    u.uTarget.value = THREE.MathUtils.lerp(u.uTarget.value, tgt, damp(dt, 3));

    this.starUniforms.uTime.value = this.time;
    this.atmo.material.uniforms.uStrength.value = 1.1 + 0.5 * THREE.MathUtils.smoothstep(2.0, 0.2, this.alt);

    // moons
    for (const m of this.moons) {
      const a = m.phase + (this.time / m.period) * Math.PI * 2;
      const p = new THREE.Vector3(Math.cos(a) * m.r, 0, Math.sin(a) * m.r).applyAxisAngle(new THREE.Vector3(1, 0, 0), m.incl);
      m.mesh.position.copy(p);
      m.mesh.rotation.y = -a;
      const vis = this.alt > 0.6;
      m.mesh.visible = vis;
      m.ring.visible = vis;
      m.ring.material.opacity = 0.22 * THREE.MathUtils.smoothstep(0.6, 1.5, this.alt);
    }
    this.moonLabels.forEach((it, i) => {
      it.world.copy(this.moons[i].mesh.position);
      it.hiddenByUser = this.alt < 1.0;
    });

    for (const mk of this.markers) mk.world.copy(mk.obj).applyMatrix4(this.planet.matrixWorld);
  }

  /** Surface point under the mouse (object-space lat/lon) or null. */
  pick() {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.pointer, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    const b = o.dot(d), c = o.lengthSq() - 1, disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t < 0) return null;
    const p = o.clone().addScaledVector(d, t);
    const inv = new THREE.Matrix4().copy(this.planet.matrixWorld).invert();
    return vecToLL(p.applyMatrix4(inv));
  }

  readout() {
    const ll = this.pick();
    const altKm = this.alt * R_MARS_KM;
    const out = [['ALT', `${fmtNum(altKm)} km`]];
    if (ll) {
      out.push(['LAT', fmtLat(ll.lat)], ['LON', fmtLon(ll.lon)]);
      const e = this.app.assets.elevAt(ll.lat, ll.lon);
      if (e != null) out.push(['ELEV', `${fmtNum(e)} m`]);
    }
    return out;
  }
}

// ---------------------------------------------------------------- helpers
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lumpyRock(size, elong, seed) {
  const g = new THREE.IcosahedronGeometry(1, 5);
  const p = g.attributes.position;
  const rnd = mulberry(seed * 977);
  const bumps = Array.from({ length: 14 }, () => ({
    d: new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize(),
    r: 0.25 + rnd() * 0.35, a: (rnd() - 0.6) * 0.22,
  }));
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let s = 1;
    for (const b of bumps) {
      const d = v.distanceTo(b.d);
      if (d < b.r) s += b.a * (1 - (d / b.r) ** 2);
    }
    v.multiplyScalar(s);
    v.x *= elong;
    p.setXYZ(i, v.x * size, v.y * size * 0.9, v.z * size);
  }
  g.computeVertexNormals();
  return g;
}

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
