export const terrainVert = /* glsl */ `
attribute float aH;
uniform float uExag, uHmin, uHmax, uH0, uCurv;
varying vec2 vUv;
varying vec3 vWorld;
varying float vElev;
void main() {
  vUv = uv;
  float hm = uHmin + aH * (uHmax - uHmin);
  vElev = hm;
  vec3 p = position;
  p.y = (hm - uH0) / 1000.0 * uExag - (p.x * p.x + p.z * p.z) * uCurv;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const terrainFrag = /* glsl */ `
precision highp float;
uniform sampler2D tVis, tNormal, tSlope, tTherm, tShadow;
uniform vec2 uSize;
uniform float uExag, uHmin, uHmax, uH0, uCurv, uTexelKm;
uniform vec3 uSun;
uniform float wVis, wElev, wSlope, wTherm, wContour, wHolo, wGrid;
uniform float uContourMinor, uContourMajor, uGridKm;
uniform vec3 uCursor;     // x, z, on
uniform float uCursorR;
uniform vec4 uBox;        // child zone xz min/max
uniform float uBoxOn;
uniform vec4 uPulse;      // x, z, t, on
uniform float uTime;
uniform float uShadowOn;
uniform vec3 uSlopeLim;   // caution, hazard, no-go (deg)
uniform float uReveal;    // 0..1 radial reveal on entry
uniform float uFpv;       // 0..1 helmet (first-person) view: haze + close-up ground detail
uniform vec3 uFogCol;
uniform float uFogK;
varying vec2 vUv;
varying vec3 vWorld;
varying float vElev;

// value noise for close-up ground grain (HiRISE is 25 cm per pixel; the eye at 1.8 m wants more)
float hash2(vec2 p) { p = mod(p, 289.0); return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
// scattered pebbles: one per cell, random size and position
float pebbles(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 c = vec2(hash2(i), hash2(i + 17.3)) * 0.7 + 0.15;
  float r = 0.06 + 0.16 * hash2(i + 5.1);
  float d = length(f - c);
  return (1.0 - smoothstep(r * 0.55, r, d)) * step(0.45, hash2(i + 9.7));
}

vec3 elevRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(13., 54., 107.) / 255.;
  vec3 c1 = vec3(24., 79., 149.) / 255.;
  vec3 c2 = vec3(42., 120., 214.) / 255.;
  vec3 c3 = vec3(85., 152., 231.) / 255.;
  vec3 c4 = vec3(158., 197., 244.) / 255.;
  vec3 c5 = vec3(238., 246., 255.) / 255.;
  float s = t * 5.0;
  vec3 c;
  if (s < 1.0) c = mix(c0, c1, s);
  else if (s < 2.0) c = mix(c1, c2, s - 1.0);
  else if (s < 3.0) c = mix(c2, c3, s - 2.0);
  else if (s < 4.0) c = mix(c3, c4, s - 3.0);
  else c = mix(c4, c5, s - 4.0);
  return pow(c, vec3(2.2)); // palette is sRGB; shading happens in linear
}

float contour(float e, float iv, float w) {
  float f = e / iv;
  float d = abs(fract(f - 0.5) - 0.5) / max(fwidth(f), 1e-5);
  return 1.0 - smoothstep(0.0, w, d);
}

void main() {
  vec3 nm = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
  vec3 n = normalize(vec3(nm.x * uExag, max(nm.z, 0.05), -nm.y * uExag));
  vec3 vis = texture2D(tVis, vUv).rgb;
  float slopeDeg = texture2D(tSlope, vUv).r * 255.0 * 0.25;
  vec3 th = texture2D(tTherm, vUv).rgb;
  float t01 = (vElev - uHmin) / (uHmax - uHmin);

  float ndl = max(dot(n, uSun), 0.0);
  // sun visibility is baked into tShadow whenever the sun or relief changes (see ShadowBaker)
  float sh = mix(1.0, texture2D(tShadow, vUv).r, uShadowOn);
  float sunUp = smoothstep(-0.02, 0.06, uSun.y);
  vec3 sky = vec3(0.86, 0.70, 0.55) * (0.14 + 0.10 * n.y);
  vec3 lit = vis * (vec3(1.0, 0.95, 0.88) * ndl * sh * 1.25 * sunUp + sky);

  float hill = 0.5 + 0.5 * ndl * mix(1.0, sh, 0.7);
  vec3 col = lit * wVis;
  col = mix(col, elevRamp(pow(t01, 0.8)) * hill, wElev * 0.88);
  col = mix(col, th * (0.35 + 0.75 * hill), wTherm * 0.9);

  // slope hazard classes (status colours: good / warning / serious / critical)
  vec3 hz = vec3(12., 163., 12.) / 255.;
  #define LIN(c) pow(c, vec3(2.2))
  float hzA = 0.30;
  if (slopeDeg >= uSlopeLim.x) { hz = vec3(250., 178., 25.) / 255.; hzA = 0.62; }
  if (slopeDeg >= uSlopeLim.y) { hz = vec3(236., 131., 90.) / 255.; hzA = 0.78; }
  if (slopeDeg >= uSlopeLim.z) { hz = vec3(208., 59., 59.) / 255.; hzA = 0.9; }
  col = mix(col, LIN(hz) * (0.45 + 0.65 * hill), wSlope * hzA);

  // Elite-style hologram
  float lum = dot(vis, vec3(0.3, 0.59, 0.11));
  vec3 holo = vec3(1.0, 0.52, 0.16) * (0.05 + pow(lum, 1.3) * 0.55 * (0.4 + 0.6 * hill));
  float scan = 0.85 + 0.15 * sin(vWorld.z * 40.0 / max(uGridKm, 0.01) - uTime * 3.0);
  col = mix(col, holo * scan, wHolo);

  float cm = contour(vElev, uContourMinor, 1.0);
  float cM = contour(vElev, uContourMajor, 1.5);
  vec3 cc = mix(vec3(1.0, 0.8, 0.55), vec3(1.0, 0.6, 0.2), wHolo);
  col = mix(col, cc, clamp((cm * 0.32 + cM * 0.8) * wContour, 0.0, 1.0));

  vec2 g = vWorld.xz / uGridKm;
  vec2 gd = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), 1e-5);
  float gl = 1.0 - min(min(gd.x, gd.y), 1.0);
  col = mix(col, vec3(1.0, 0.65, 0.3), gl * wGrid * 0.35);

  // child zone (Marswalk box)
  if (uBoxOn > 0.001) {
    vec2 p = vWorld.xz;
    vec2 c = (uBox.xy + uBox.zw) * 0.5, hs = (uBox.zw - uBox.xy) * 0.5;
    vec2 q = abs(p - c) - hs;
    float sd = max(q.x, q.y);
    float fw = fwidth(sd);
    float edge = 1.0 - smoothstep(0.0, 1.8 * fw, abs(sd));
    float ins = step(sd, 0.0);
    vec2 aq = abs(p - c) / hs;
    float corner = step(0.72, max(aq.x, aq.y)) * step(0.72, min(aq.x, aq.y));
    float dash = step(0.5, fract((p.x + p.y) * 1.2 - uTime * 0.6));
    vec3 bc = vec3(1.0, 0.7, 0.3);
    col = mix(col, bc * 1.4, edge * uBoxOn * mix(0.35 + 0.5 * dash, 1.0, corner));
    col += bc * ins * uBoxOn * 0.06 * (0.6 + 0.4 * sin(uTime * 2.0));
  }

  // cursor reticle
  if (uCursor.z > 0.5) {
    float d = length(vWorld.xz - uCursor.xy);
    float fw = fwidth(d);
    float r1 = 1.0 - smoothstep(0.0, 1.5 * fw, abs(d - uCursorR));
    float r2 = 1.0 - smoothstep(0.0, 1.2 * fw, abs(d - uCursorR * 0.35));
    float a = atan(vWorld.z - uCursor.y, vWorld.x - uCursor.x);
    float ticks = step(0.9, fract(a * 4.0 / 6.28318 + 0.05));
    col = mix(col, vec3(0.37, 0.83, 1.0), clamp(r1 * (0.4 + 0.6 * ticks) + r2 * 0.6, 0.0, 1.0));
  }

  // scan pulse
  if (uPulse.w > 0.5) {
    float d = length(vWorld.xz - uPulse.xy);
    float r = uPulse.z;
    float w = max(r * 0.04, uTexelKm * 2.0);
    float ring = exp(-pow((d - r) / w, 2.0));
    float fade = 1.0 - smoothstep(0.0, 1.0, r / (max(uSize.x, uSize.y) * 0.9));
    col += vec3(1.0, 0.6, 0.25) * ring * fade * 0.9;
  }

  if (uFpv > 0.001) {
    float dist = length(vWorld - cameraPosition); // km
    vec2 pm = vWorld.xz * 1000.0;                 // metres
    float near = 1.0 - smoothstep(0.01, 0.16, dist);
    float grain = vnoise(pm * 3.1) * 0.5 + vnoise(pm * 0.8) * 0.35 + vnoise(pm * 11.0) * 0.15;
    float pb = pebbles(pm * 1.6) + 0.6 * pebbles(pm * 4.3 + 3.0);
    vec3 detail = vec3(0.80 + 0.40 * grain) * (1.0 - 0.38 * pb * (0.6 + 0.4 * sh));
    col *= mix(vec3(1.0), detail, near * uFpv * (1.0 - wHolo) * (1.0 - wElev));
    // aerial perspective: suspended dust (optical depth ~0.5) hazes distant ground toward the sky colour
    float fog = 1.0 - exp(-pow(dist * uFogK, 1.25));
    col = mix(col, uFogCol * (0.25 + 0.75 * sunUp), fog * uFpv);
  }

  // entry reveal + edge fade
  float rd = length(vWorld.xz / (uSize * 0.5));
  float reveal = smoothstep(uReveal * 1.6, uReveal * 1.6 - 0.15, rd);
  col *= mix(0.0, 1.0, reveal);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export const wallVert = /* glsl */ `
attribute float aH;
attribute float aBase;
uniform float uExag, uHmin, uHmax, uH0, uCurv, uBaseY;
varying float vElev;
varying float vTop;
varying vec3 vWorld;
void main() {
  float hm = uHmin + aH * (uHmax - uHmin);
  vec3 p = position;
  float top = (hm - uH0) / 1000.0 * uExag - (p.x * p.x + p.z * p.z) * uCurv;
  p.y = mix(top, uBaseY, aBase);
  vElev = mix(hm, uH0 + (uBaseY + (p.x * p.x + p.z * p.z) * uCurv) * 1000.0 / uExag, aBase);
  vTop = 1.0 - aBase;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const wallFrag = /* glsl */ `
uniform float uStrata;
uniform float uReveal;
varying float vElev;
varying float vTop;
varying vec3 vWorld;
void main() {
  float band = 0.5 + 0.5 * sin(vElev / uStrata * 6.28318);
  vec3 c = mix(vec3(0.10, 0.055, 0.035), vec3(0.19, 0.10, 0.06), band);
  c *= 0.5 + 0.8 * pow(vTop, 2.0);
  float edge = smoothstep(0.985, 1.0, vTop);
  c += vec3(1.0, 0.6, 0.25) * edge * 0.8;
  gl_FragColor = vec4(c * uReveal, 1.0);
  #include <colorspace_fragment>
}`;

export const floorFrag = /* glsl */ `
uniform float uGrid;
uniform vec2 uSize;
uniform float uReveal;
varying vec3 vWorld;
void main() {
  vec2 g = vWorld.xz / uGrid;
  vec2 gd = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), 1e-5);
  float l = 1.0 - min(min(gd.x, gd.y), 1.0);
  float r = length(vWorld.xz) / length(uSize);
  float fade = smoothstep(1.6, 0.4, r);
  vec3 c = vec3(1.0, 0.55, 0.2) * l * 0.16 * fade;
  gl_FragColor = vec4(c * uReveal, 1.0);
  #include <colorspace_fragment>
}`;

export const floorVert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// ---------------------------------------------------------------------------
// Shadow bake: one texel per heightfield sample, ray-marched toward the sun.
// Runs only when the sun direction or vertical exaggeration changes, instead
// of for every screen pixel on every frame.
export const bakeVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export const bakeFrag = /* glsl */ `
precision highp float;
uniform sampler2D tHeight;
uniform vec2 uSize;
uniform float uExag, uHmin, uHmax, uH0, uCurv, uTexelKm;
uniform vec3 uSun;
varying vec2 vUv;

float terrainY(vec2 xz) {
  vec2 uv = vec2(xz.x / uSize.x + 0.5, 0.5 - xz.y / uSize.y);
  float h01 = texture2D(tHeight, uv).r;
  return ((uHmin + h01 * (uHmax - uHmin)) - uH0) / 1000.0 * uExag - dot(xz, xz) * uCurv;
}

void main() {
  vec2 xz = vec2((vUv.x - 0.5) * uSize.x, (0.5 - vUv.y) * uSize.y);
  float y0 = terrainY(xz);
  float lh = length(uSun.xz);
  float res = 1.0;
  if (uSun.y <= 0.0) res = 0.0;
  else if (lh > 1e-4) {
    vec2 dir = uSun.xz / lh;
    float tanE = uSun.y / lh;
    float d = uTexelKm * 1.2;
    for (int i = 0; i < SHADOW_STEPS; i++) {
      vec2 p = xz + dir * d;
      if (abs(p.x) > uSize.x * 0.5 || abs(p.y) > uSize.y * 0.5) break;
      float ty = terrainY(p);
      float ry = y0 + d * tanE;
      res = min(res, clamp(6.0 * (ry - ty) / d + 0.5, 0.0, 1.0));
      if (res <= 0.0) break;
      d *= SHADOW_GROWTH;
    }
  }
  gl_FragColor = vec4(res, res, res, 1.0);
}`;

// ---------------------------------------------------------------------------
// Helmet view: Mars sky dome and a horizon ring built from the CTX crater DEM.
export const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always on the far plane
}`;

export const skyFrag = /* glsl */ `
precision highp float;
uniform vec3 uSun;
varying vec3 vDir;
#define LIN(c) pow(c, vec3(2.2))
void main() {
  vec3 d = normalize(vDir);
  float sunUp = smoothstep(-0.12, 0.08, uSun.y);
  float h = max(d.y, 0.0);
  // dusty butterscotch sky: brighter at the horizon, darker brown overhead
  vec3 hor = LIN(vec3(0.80, 0.62, 0.47));
  vec3 zen = LIN(vec3(0.46, 0.33, 0.25));
  vec3 sky = mix(hor, zen, pow(h, 0.55));
  float cosS = max(dot(d, normalize(uSun)), 0.0);
  // fine dust scatters blue light forward: a blue glow hugs the Sun (strongest at sunset)
  float low = 1.0 - smoothstep(0.05, 0.6, uSun.y);
  sky = mix(sky, LIN(vec3(0.50, 0.66, 0.86)), pow(cosS, 14.0) * (0.35 + 0.45 * low));
  sky += LIN(vec3(1.0, 0.93, 0.82)) * pow(cosS, 220.0) * 0.9;
  // the Sun from Mars: about two thirds the size it looks from Earth
  float disk = smoothstep(0.99994, 0.99997, cosS);
  sky = mix(sky, vec3(3.0, 2.9, 2.7), disk);
  // below the horizon line: dusty ground haze (hidden by terrain almost everywhere)
  sky = mix(sky, hor * 0.7, smoothstep(0.0, -0.08, d.y));
  // night: a dark sky
  sky *= mix(0.035, 1.0, sunUp);
  gl_FragColor = vec4(sky, 1.0);
  #include <colorspace_fragment>
}`;

export const ringVert = /* glsl */ `
attribute float aDist;
attribute float aTop;
varying float vDist;
varying float vTop;
void main() {
  vDist = aDist;
  vTop = aTop;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const ringFrag = /* glsl */ `
precision highp float;
uniform vec3 uFogCol;
uniform vec3 uSun;
varying float vDist;
varying float vTop;
#define LIN(c) pow(c, vec3(2.2))
void main() {
  float sunUp = smoothstep(-0.02, 0.08, uSun.y);
  vec3 rock = LIN(vec3(0.52, 0.36, 0.26)) * (0.25 + 0.75 * sunUp);
  vec3 fog = uFogCol * (0.25 + 0.75 * sunUp);
  // farther ridges sit behind more dust
  float haze = 0.5 + 0.42 * smoothstep(4.0, 40.0, vDist);
  vec3 c = mix(rock, fog, mix(1.0, haze, smoothstep(0.55, 1.0, vTop)));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
