export const planetVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vObjN;
varying vec3 vWorldPos;
varying vec3 vWorldN;
void main() {
  vUv = uv;
  vObjN = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const planetFrag = /* glsl */ `
precision highp float;
uniform sampler2D uColor, uNormal, uTopo, uThermal;
uniform sampler2D rColor, rNormal, rTopo, rThermal;
uniform sampler2D cDecal;
uniform vec4 rB;      // region bounds: lon0 lat0 lon1 lat1
uniform vec4 cB;      // crater bounds
uniform float wVis, wTopo, wTherm;
uniform float uDecal, uCDecal;
uniform vec3 uSunObj, uSunWorld;
uniform float uGrid, uTime;
uniform vec3 uTargetObj;
uniform float uTarget;
uniform float uNormalStrength;
varying vec2 vUv;
varying vec3 vObjN;
varying vec3 vWorldPos;
varying vec3 vWorldN;

float feather(vec2 p, float f) {
  vec2 e = smoothstep(vec2(0.0), vec2(f), p) * smoothstep(vec2(0.0), vec2(f), 1.0 - p);
  return e.x * e.y;
}
float inside(vec2 p) { return step(0.0, p.x) * step(0.0, p.y) * step(p.x, 1.0) * step(p.y, 1.0); }

void main() {
  float lon = vUv.x * 360.0 - 180.0;
  float lat = vUv.y * 180.0 - 90.0;
  vec3 cVis = texture2D(uColor, vUv).rgb;
  vec3 cTopo = texture2D(uTopo, vUv).rgb;
  vec3 cTh = texture2D(uThermal, vUv).rgb;
  vec3 nt = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;

  vec2 ru = vec2((lon - rB.x) / (rB.z - rB.x), (lat - rB.y) / (rB.w - rB.y));
  float rm = inside(ru) * feather(ru, 0.14) * uDecal;
  if (rm > 0.0) {
    cVis = mix(cVis, texture2D(rColor, ru).rgb, rm);
    cTopo = mix(cTopo, texture2D(rTopo, ru).rgb, rm);
    cTh = mix(cTh, texture2D(rThermal, ru).rgb, rm);
    nt = mix(nt, texture2D(rNormal, ru).xyz * 2.0 - 1.0, rm);
  }
  vec2 cu = vec2((lon - cB.x) / (cB.z - cB.x), (lat - cB.y) / (cB.w - cB.y));
  float cm = inside(cu) * feather(cu, 0.08) * uCDecal;
  if (cm > 0.0) {
    vec3 d = texture2D(cDecal, cu).rgb;
    cVis = mix(cVis, d, cm);
  }

  // warm the Viking colour a touch toward what rovers see
  vec3 vis = pow(cVis, vec3(1.05)) * vec3(1.10, 0.97, 0.86);
  vec3 albedo = vis * wVis + cTopo * wTopo + cTh * wTherm;

  float lr = radians(lon);
  vec3 N = normalize(vObjN);
  vec3 E = normalize(vec3(-sin(lr), 0.0, -cos(lr)));
  vec3 Nn = cross(N, E);
  vec3 n = normalize(E * nt.x * uNormalStrength + Nn * nt.y * uNormalStrength + N * max(nt.z, 0.2));
  float ndl = dot(n, uSunObj);
  float mu = dot(N, uSunObj);
  float day = smoothstep(-0.12, 0.22, mu);
  float diff = max(ndl, 0.0) * day;
  float scan = clamp(wTopo + wTherm, 0.0, 1.0);
  float lit = diff * 1.3 + 0.012;
  float instrument = 0.42 + 0.7 * max(dot(n, normalize(N + uSunObj * 0.6)), 0.0);
  vec3 col = albedo * mix(lit, instrument, scan * 0.85);

  // Martian twilight: faint blue at the terminator
  col += vec3(0.10, 0.16, 0.28) * smoothstep(0.12, 0.0, abs(mu)) * 0.25 * wVis;

  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 WN = normalize(vWorldN);
  float fres = pow(1.0 - max(dot(WN, V), 0.0), 3.0);
  float sunSide = smoothstep(-0.25, 0.5, dot(WN, uSunWorld));
  col += vec3(1.0, 0.56, 0.32) * fres * 0.45 * sunSide;

  // graticule (10 deg)
  vec2 g = vec2(lon, lat) / 10.0;
  vec2 gd = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), 1e-4);
  float line = 1.0 - min(min(gd.x, gd.y), 1.0);
  col = mix(col, vec3(1.0, 0.62, 0.26), line * uGrid * 0.32);

  // target lock rings around Jezero
  if (uTarget > 0.001) {
    float ang = degrees(acos(clamp(dot(N, uTargetObj), -1.0, 1.0)));
    float fw = max(fwidth(ang), 1e-4);
    float r1 = 1.0 - smoothstep(0.0, 1.5 * fw, abs(ang - 0.42));
    float pulse = fract(uTime * 0.45);
    float r2 = (1.0 - smoothstep(0.0, 2.0 * fw, abs(ang - (0.42 + pulse * 1.6)))) * (1.0 - pulse);
    float a = atan(dot(cross(uTargetObj, N), vec3(0.0, 1.0, 0.0)), dot(N - uTargetObj, vec3(0.0, 1.0, 0.0)));
    float dash = step(0.5, fract(a * 6.0 / 3.14159 + uTime * 0.2));
    vec3 rc = vec3(1.0, 0.66, 0.3);
    col = mix(col, rc * 1.6, r1 * uTarget * (0.55 + 0.45 * dash));
    col += rc * r2 * uTarget * 0.8;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export const atmoVert = /* glsl */ `
varying vec3 vNV;
varying vec3 vWN;
void main() {
  vNV = normalize(normalMatrix * normal);
  vWN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const atmoFrag = /* glsl */ `
uniform vec3 uSunWorld;
uniform float uStrength;
varying vec3 vNV;
varying vec3 vWN;
void main() {
  float i = pow(clamp(0.74 + dot(vNV, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 5.0);
  float d = dot(normalize(vWN), uSunWorld);
  float day = smoothstep(-0.35, 0.35, d);
  vec3 dust = vec3(1.0, 0.58, 0.34);
  vec3 blue = vec3(0.42, 0.62, 1.0);
  vec3 c = mix(blue, dust, smoothstep(-0.05, 0.4, d));
  gl_FragColor = vec4(c * i * day * uStrength, i * day);
  #include <colorspace_fragment>
}`;

export const starVert = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
uniform float uTime;
uniform float uPixelRatio;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.85 + 0.15 * sin(uTime * (1.0 + fract(position.x * 13.1)) * 2.0 + position.y);
  gl_PointSize = aSize * uPixelRatio * tw;
  gl_Position = projectionMatrix * mv;
}`;

export const starFrag = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a;
  gl_FragColor = vec4(vColor * a, a);
  #include <colorspace_fragment>
}`;

export const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// faint procedural Milky Way band
export const skyFrag = /* glsl */ `
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  return n;
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.07; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  vec3 axis = normalize(vec3(0.35, 0.82, -0.45));
  float band = exp(-pow(dot(d, axis) / 0.2, 2.0));
  float n = fbm(d * 3.0) * 0.7 + fbm(d * 9.0) * 0.3;
  float dust = smoothstep(0.35, 0.8, fbm(d * 6.0 + 3.0));
  vec3 c = vec3(0.55, 0.5, 0.62) * band * n * 0.11 * (1.0 - dust * 0.6);
  c += vec3(0.25, 0.12, 0.05) * pow(band, 3.0) * n * 0.05;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
