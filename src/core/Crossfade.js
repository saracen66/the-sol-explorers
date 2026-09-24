import * as THREE from 'three';

// Dissolve between two scenes: a noisy "materialise" wipe with a hot edge.
export class Crossfade {
  constructor(renderer) {
    this.renderer = renderer;
    // No MSAA and at most 1x resolution: the dissolve lasts about a second and is
    // mostly motion, so this halves or quarters the cost of rendering two scenes at once.
    const opts = { type: THREE.HalfFloatType, samples: 0, depthBuffer: true };
    this.a = new THREE.WebGLRenderTarget(2, 2, opts);
    this.b = new THREE.WebGLRenderTarget(2, 2, opts);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tA: { value: this.a.texture }, tB: { value: this.b.texture }, uT: { value: 0 }, uAspect: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tA, tB; uniform float uT, uAspect; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec3 a = texture2D(tA, vUv).rgb, b = texture2D(tB, vUv).rgb;
          vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
          float n = noise(p * 9.0) * 0.55 + noise(p * 31.0) * 0.25 + length(p) * 0.35;
          float t = uT * 1.25 - 0.1;
          float m = smoothstep(t - 0.06, t + 0.06, n);
          float edge = smoothstep(0.08, 0.0, abs(n - t)) * (1.0 - uT) * step(0.01, uT);
          vec3 c = mix(b, a, m) + vec3(1.0, 0.55, 0.2) * edge * 0.9;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(w, h, pr) {
    const s = Math.min(pr, 1);
    this.a.setSize(Math.round(w * s), Math.round(h * s));
    this.b.setSize(Math.round(w * s), Math.round(h * s));
    this.mat.uniforms.uAspect.value = w / h;
  }

  render(viewA, viewB, t) {
    const r = this.renderer;
    r.setRenderTarget(this.a); r.render(viewA.scene, viewA.camera);
    r.setRenderTarget(this.b); r.render(viewB.scene, viewB.camera);
    r.setRenderTarget(null);
    this.mat.uniforms.uT.value = t;
    r.render(this.scene, this.cam);
  }
}

// Speed streaks on the 2D overlay canvas during dives.
export class Streaks {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.parts = Array.from({ length: 140 }, () => this.spawn(Math.random()));
    this.intensity = 0;
    this.active = false;
    this.c.style.display = 'none';
  }
  spawn(r = 0) { return { a: Math.random() * Math.PI * 2, r: 0.05 + r * 0.9, v: 0.4 + Math.random() * 1.4, w: 0.5 + Math.random() * 1.5 }; }
  resize(w, h, pr) {
    const s = Math.min(pr, 1.5);
    this.c.width = Math.round(w * s); this.c.height = Math.round(h * s); this.pr = s;
  }
  update(dt) {
    const g = this.g, W = this.c.width, H = this.c.height;
    if (this.intensity < 0.01) {
      // nothing to draw: clear once, then hide the canvas so the browser stops compositing it
      if (this.active) { g.clearRect(0, 0, W, H); this.c.style.display = 'none'; this.active = false; }
      return;
    }
    if (!this.active) { this.c.style.display = ''; this.active = true; }
    g.clearRect(0, 0, W, H);
    const R = Math.hypot(W, H) * 0.5;
    g.lineCap = 'round';
    for (const p of this.parts) {
      p.r += p.v * dt * (0.6 + this.intensity * 1.6) * p.r;
      if (p.r > 1.1) Object.assign(p, this.spawn());
      const len = 0.04 + p.v * 0.08 * this.intensity;
      const x0 = W / 2 + Math.cos(p.a) * p.r * R, y0 = H / 2 + Math.sin(p.a) * p.r * R;
      const x1 = W / 2 + Math.cos(p.a) * (p.r + len) * R, y1 = H / 2 + Math.sin(p.a) * (p.r + len) * R;
      g.strokeStyle = `rgba(255,${170 + p.w * 40 | 0},120,${0.35 * this.intensity * Math.min(1, p.r * 2)})`;
      g.lineWidth = p.w * this.pr;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  }
}
