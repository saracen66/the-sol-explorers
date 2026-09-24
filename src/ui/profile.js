// Elevation profile of the planned Marswalk (single series → no legend box; the
// section title names it). Crosshair + tooltip on hover; hazard strip keyed by
// status colour + label below.
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

const STATUS = ['#0ca30c', '#fab219', '#ec835a', '#d03b3b'];

export function renderProfile(host, result, { slopeAt, limits, onHover }) {
  host.innerHTML = '';
  const W = Math.max(240, host.clientWidth || 280), H = 118;
  const pad = { l: 44, r: 8, t: 10, b: 26 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Elevation profile along the planned route' }, host);
  const s = result.samples;
  const total = s.at(-1).d;
  let eMin = Infinity, eMax = -Infinity;
  for (const p of s) { eMin = Math.min(eMin, p.e); eMax = Math.max(eMax, p.e); }
  const span = Math.max(10, eMax - eMin);
  const step = niceStep(span / 3);
  const y0 = Math.floor(eMin / step) * step, y1 = Math.ceil(eMax / step) * step;
  const X = (d) => pad.l + (d / total) * (W - pad.l - pad.r);
  const Y = (e) => pad.t + (1 - (e - y0) / (y1 - y0)) * (H - pad.t - pad.b - 6);
  const plotB = H - pad.b - 6;

  // grid + y ticks
  for (let v = y0; v <= y1 + 1e-6; v += step) {
    el('line', { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), stroke: '#3a3531', 'stroke-width': 1 }, svg);
    const t = el('text', { x: pad.l - 6, y: Y(v) + 3.5, 'text-anchor': 'end', fill: '#8c7f74', 'font-size': 10, 'font-family': 'JetBrains Mono' }, svg);
    t.textContent = Math.round(v).toLocaleString('en-US');
  }
  // x ticks (km)
  const kmStep = niceStep(total / 1000 / 4);
  for (let k = 0; k <= total / 1000 + 1e-6; k += kmStep) {
    const t = el('text', { x: X(k * 1000), y: H - 4, 'text-anchor': 'middle', fill: '#8c7f74', 'font-size': 10, 'font-family': 'JetBrains Mono' }, svg);
    t.textContent = `${+k.toFixed(2)} km`;
  }

  // hazard strip (fine slope under the route)
  const strip = el('g', {}, svg);
  const segN = Math.min(160, s.length);
  for (let i = 0; i < segN; i++) {
    const a = (i / segN) * total, b = ((i + 1) / segN) * total;
    const mid = s[Math.min(s.length - 1, Math.round(((a + b) / 2 / total) * (s.length - 1)))];
    const sl = slopeAt(mid.x, mid.z) || 0;
    const cls = sl >= limits[2] ? 3 : sl >= limits[1] ? 2 : sl >= limits[0] ? 1 : 0;
    el('rect', { x: X(a), y: plotB + 3, width: Math.max(0.5, X(b) - X(a) - 0.5), height: 4, fill: STATUS[cls] }, strip);
  }

  // area + line
  let dLine = '';
  s.forEach((p, i) => { dLine += `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.e).toFixed(1)}`; });
  el('path', { d: `${dLine}L${X(total)},${plotB}L${X(0)},${plotB}Z`, fill: '#5fd4ff', 'fill-opacity': 0.1 }, svg);
  el('path', { d: dLine, fill: 'none', stroke: '#5fd4ff', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);

  // stops
  result.stopAtD.forEach((d, i) => {
    const p = s[Math.round((d / total) * (s.length - 1))];
    el('circle', { cx: X(d), cy: Y(p.e), r: 4, fill: '#5fd4ff', stroke: '#1a1a19', 'stroke-width': 2 }, svg);
    const t = el('text', { x: X(d), y: Y(p.e) - 8, 'text-anchor': 'middle', fill: '#c7b8aa', 'font-size': 10, 'font-family': 'JetBrains Mono' }, svg);
    t.textContent = String(i + 2);
  });

  // crosshair + tooltip
  const cross = el('line', { y1: pad.t, y2: plotB, stroke: '#c7b8aa', 'stroke-width': 1, visibility: 'hidden' }, svg);
  const dot = el('circle', { r: 4, fill: '#5fd4ff', stroke: '#1a1a19', 'stroke-width': 2, visibility: 'hidden' }, svg);
  const tip = document.createElement('div');
  tip.className = 'tip';
  host.appendChild(tip);
  const hit = el('rect', { x: pad.l, y: 0, width: W - pad.l - pad.r, height: H, fill: 'transparent' }, svg);
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const d = Math.max(0, Math.min(total, ((px - pad.l) / (W - pad.l - pad.r)) * total));
    const p = s[Math.round((d / total) * (s.length - 1))];
    const sl = slopeAt(p.x, p.z) || 0;
    cross.setAttribute('x1', X(d)); cross.setAttribute('x2', X(d)); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', X(d)); dot.setAttribute('cy', Y(p.e)); dot.setAttribute('visibility', 'visible');
    tip.style.display = 'block';
    tip.style.left = `${(X(d) / W) * 100}%`;
    tip.replaceChildren();
    const b = document.createElement('b');
    b.textContent = `${Math.round(p.e).toLocaleString('en-US')} m`;
    const sp = document.createElement('span');
    sp.textContent = ` · ${(d / 1000).toFixed(2)} km · slope ${sl.toFixed(0)}°`;
    tip.append(b, sp);
    onHover?.(d);
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; onHover?.(null);
  });
}

function niceStep(x) {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}
