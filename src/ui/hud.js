import { marsTime, localTime, perseveranceSol, earthMarsLightTime, formatHM, season, dayLength, JEZERO } from '../lib/marstime.js';
import { fmtDist, fmtDur, fmtNum, fmtLat, fmtLon } from '../lib/geo.js';
import { LANDING_SITES } from '../data/places.js';
import { ORBIT_LAYERS } from '../orbit/OrbitView.js';
import { TERRAIN_LAYERS } from '../terrain/TerrainView.js';
import { renderProfile } from './profile.js';

const $ = (id) => document.getElementById(id);
const ICON = {
  lock: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="7" width="10" height="7"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>',
  target: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5"/><path d="M8 0v4M8 12v4M0 8h4M12 8h4"/></svg>',
  book: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h5a2 2 0 0 1 2 2v9a2 2 0 0 0-2-2H2zM14 3H9"/><path d="M14 3v9H9"/></svg>',
  pin: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 15s5-5 5-9A5 5 0 0 0 3 6c0 4 5 9 5 9z"/><circle cx="8" cy="6" r="1.6"/></svg>',
  ok: '✔', warn: '▲', stop: '✖',
};
const KIND_ICON = { landing: '◆', science: '●', geology: '◇', lz: '▣' };

export class Hud {
  constructor(app) {
    this.app = app;
    this.left = $('panel-left');
    this.right = $('panel-right');
    this.el = $('hud');
    $('btn-sources').onclick = () => this.showSources();
    $('btn-cine').onclick = () => { this.closeSheet(); app.director.toggle(); };
    // phones: the two side panels become one bottom sheet, opened from these tabs
    $('btn-info').onclick = () => this.toggleSheet('left');
    $('btn-layers').onclick = () => this.toggleSheet('right');
    $('modal-x').onclick = () => ($('modal').hidden = true);
    $('modal').onclick = (e) => { if (e.target.id === 'modal') $('modal').hidden = true; };
    this.tickTelemetry();
    setInterval(() => this.tickTelemetry(), 1000);
  }

  // ------------------------------------------------------------------ generic
  tickTelemetry() {
    const now = Date.now();
    const mt = marsTime(now);
    const lt = localTime(mt, JEZERO.lon);
    $('t-sol').textContent = fmtNum(perseveranceSol(now));
    $('t-lmst').textContent = formatHM(lt.lmst);
    $('t-ls').textContent = `Ls ${mt.Ls.toFixed(0)}°`;
    $('t-ls').title = season(mt.Ls);
    const lt2 = earthMarsLightTime(now).seconds;
    $('t-comms').textContent = `${Math.floor(lt2 / 60)}m ${String(Math.round(lt2 % 60)).padStart(2, '0')}s`;
    this.mt = mt;
  }

  setCrumbs(mode) {
    const c = $('crumbs');
    const parts = [['orbit', 'Mars'], ['crater', 'Jezero Crater'], ['site', 'Marswalk Zone']];
    const idx = parts.findIndex((p) => p[0] === mode);
    c.innerHTML = '';
    parts.slice(0, idx + 1).forEach(([m, name], i) => {
      if (i) { const s = document.createElement('span'); s.className = 'sep'; s.textContent = '›'; c.appendChild(s); }
      const b = document.createElement('button');
      b.textContent = name;
      b.className = i === idx ? 'on' : '';
      b.onclick = () => this.app.goTo(m);
      c.appendChild(b);
    });
  }

  readout(list) {
    const r = $('readout');
    const html = list.map(([k, v]) => `<span><b>${k}</b>${v}</span>`).join('');
    if (html !== this._ro) { r.innerHTML = html; this._ro = html; }
  }

  hints(html) { $('hints').innerHTML = html; }

  prompt(html) {
    const p = $('prompt');
    if (html) { if (p.innerHTML !== html) p.innerHTML = html; p.classList.add('show'); } else p.classList.remove('show');
  }

  toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('show'), ms);
  }

  caption(kicker, text, ms = 4200) {
    const c = $('caption');
    if (!text) { c.classList.remove('show'); return; }
    c.innerHTML = `<small>${kicker}</small>${text}`;
    c.classList.add('show');
    clearTimeout(this._ct);
    if (ms) this._ct = setTimeout(() => c.classList.remove('show'), ms);
  }

  reticle(on) { $('reticle').classList.toggle('show', !!on); }

  banner(text, cls = 'go', ms = 2600) {
    const b = $('banner');
    b.className = `banner ${cls}`;
    b.innerHTML = `<span>${cls === 'go' ? '✔' : '✖'}</span>${text}`;
    b.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(1.15)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.12 },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.8 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(0.98)' }], { duration: ms, easing: 'ease-out' });
  }

  flash(peak = 0.85, dur = 900, tone = '') {
    const f = $('flash');
    f.classList.toggle('red', tone === 'red');
    f.animate([{ opacity: 0 }, { opacity: peak, offset: 0.35 }, { opacity: 0 }], { duration: dur, easing: 'ease-out' });
  }

  clearPanels() { this.left.innerHTML = ''; this.right.innerHTML = ''; this.closeSheet(); }

  toggleSheet(side) {
    const b = document.body;
    const open = b.classList.contains(`sheet-${side}`);
    this.closeSheet();
    if (!open) {
      b.classList.add('sheet-open', `sheet-${side}`);
      $(side === 'left' ? 'btn-info' : 'btn-layers').classList.add('on');
    }
  }

  closeSheet() {
    document.body.classList.remove('sheet-open', 'sheet-left', 'sheet-right');
    $('btn-info').classList.remove('on');
    $('btn-layers').classList.remove('on');
  }

  sheetLabel(text) { $('btn-info').textContent = text; }

  // ------------------------------------------------------------------ ORBIT
  renderOrbit(orbit) {
    this.setCrumbs('orbit');
    this.sheetLabel('JEZERO');
    const jz = LANDING_SITES[0];
    const sites = LANDING_SITES.map((s) => `
      <button class="row ${s.status === 'active' ? 'active' : s.status === 'fiction' ? '' : 'locked'}" data-site="${s.id}">
        <span class="ic">${s.status === 'active' ? ICON.target : s.status === 'fiction' ? ICON.book : ICON.lock}</span>
        <span><div class="nm">${s.name}</div><div class="ds">${s.mission}</div></span>
        <span class="rt">${s.status === 'active' ? 'OPEN' : s.status === 'fiction' ? 'FICTION' : 'PHASE 2'}</span>
      </button>`).join('');
    this.left.innerHTML = `
      <div class="sec">
        <div class="sec-h">Survey target <span class="tag">PHASE 1</span></div>
        <div class="title-xl">JEZERO CRATER</div>
        <div class="sub">Ancient lake + river delta. Perseverance landed here and left 10 sample tubes at Three Forks. Our first Marswalk site.</div>
        <div class="kv">
          <span class="k">Centre</span><span class="v">18.40°N 77.60°E</span>
          <span class="k">Diameter</span><span class="v">≈ 45 km</span>
          <span class="k">Region</span><span class="v">Isidis Planitia rim</span>
          <span class="k">Datasets</span><span class="v">7 layers · 5 missions</span>
        </div>
        <div class="btn-row"><button class="btn primary" id="btn-descend">▼ Descend to Jezero</button></div>
      </div>
      <div class="sec">
        <div class="sec-h">Landing sites <span class="tag">${LANDING_SITES.length}</span></div>
        <div class="rows">${sites}</div>
      </div>`;
    $('btn-descend').onclick = () => { this.closeSheet(); this.app.descendToJezero(); };
    this.left.querySelectorAll('[data-site]').forEach((b) => {
      b.onclick = () => {
        const s = LANDING_SITES.find((x) => x.id === b.dataset.site);
        this.closeSheet();
        if (s.status === 'active') this.app.descendToJezero();
        else this.app.orbitLookAt(s);
      };
    });

    const layerRows = ORBIT_LAYERS.map((l) => `
      <div class="layer ${orbit.layer === l.id ? 'on' : ''}" data-layer="${l.id}">
        <span class="box"></span><span><div class="nm">${l.name}</div><div class="src">${l.src}</div></span><span class="key">${l.key}</span>
      </div>`).join('');
    this.right.innerHTML = `
      <div class="sec">
        <div class="sec-h">Orbital data layers</div>
        ${layerRows}
        <div id="orbit-legend"></div>
      </div>
      <div class="sec">
        <div class="sec-h">Display</div>
        <div class="layer ${orbit.grid > 0 ? 'on' : ''}" id="tg-grid"><span class="box"></span><span class="nm">Lat / lon grid</span><span class="key">G</span></div>
        <div class="layer ${orbit.autoSpin ? 'on' : ''}" id="tg-spin"><span class="box"></span><span class="nm">Planet rotation</span><span class="key">SPACE</span></div>
      </div>
      <div class="sec">
        <div class="sec-h">Mission clock</div>
        <div class="kv" id="orbit-clock"></div>
      </div>`;
    this.right.querySelectorAll('[data-layer]').forEach((d) => { d.onclick = () => this.app.setOrbitLayer(d.dataset.layer); });
    $('tg-grid').onclick = () => { orbit.grid = orbit.grid > 0 ? 0 : 0.35; this.renderOrbit(orbit); };
    $('tg-spin').onclick = () => { orbit.autoSpin = !orbit.autoSpin; this.renderOrbit(orbit); };
    this.orbitLegend(orbit.layer);
    this.orbitClock();
    this.hints('<kbd>DRAG</kbd> rotate <kbd>SCROLL</kbd> zoom <kbd>1-3</kbd> layers <kbd>ENTER</kbd> descend <kbd>C</kbd> autopilot');
  }

  orbitClock() {
    const k = $('orbit-clock');
    if (!k) return;
    const mt = this.mt;
    const lt = localTime(mt, JEZERO.lon);
    const dl = dayLength(JEZERO.lat, mt.decl);
    const light = earthMarsLightTime();
    k.innerHTML = `
      <span class="k">Perseverance sol</span><span class="v">${fmtNum(perseveranceSol())}</span>
      <span class="k">Local true solar time</span><span class="v">${formatHM(lt.ltst)}</span>
      <span class="k">Sunrise / sunset</span><span class="v">${formatHM(dl.rise)} / ${formatHM(dl.set)}</span>
      <span class="k">Solar longitude</span><span class="v">${mt.Ls.toFixed(1)}° · ${season(mt.Ls)}</span>
      <span class="k">Earth–Mars range</span><span class="v">${fmtNum(light.km / 1e6, 1)} M km</span>
      <span class="k">One-way signal</span><span class="v">${(light.seconds / 60).toFixed(1)} min</span>`;
  }

  orbitLegend(layer) {
    const L = $('orbit-legend');
    if (!L) return;
    if (layer === 'topo') L.innerHTML = legendRamp('Elevation (MOLA, m)', 'linear-gradient(90deg,#0d366b,#184f95,#2a78d6,#5598e7,#9ec5f4,#eef6ff)', ['−8,200', '0', '+21,200']);
    else if (layer === 'thermal') L.innerHTML = legendRamp('Night-time IR brightness (relative)', 'linear-gradient(90deg,#3a1a06,#7a3510,#c05a1c,#ec8a45,#f9c79a,#fff0e0)', ['cools fast · dust', 'stays warm · rock']);
    else L.innerHTML = '<div class="legend"><div class="cap muted">Viking Orbiter mosaic, colour by NASA Ames. Seasonal frost shows at the poles.</div></div>';
  }

  // ------------------------------------------------------------------ TERRAIN
  renderTerrain(view, extraLeft) {
    const site = view.id === 'site';
    this.setCrumbs(view.id);
    this.sheetLabel(site ? 'PLANNER' : 'CRATER');
    const rows = TERRAIN_LAYERS.map((l) => `
      <div class="layer ${l.locked ? 'locked' : ''} ${view.layers[l.id] ? 'on' : ''}" data-layer="${l.id}" title="${l.locked ? 'Planned for phase 2' : ''}">
        <span class="box">${l.locked ? '' : ''}</span>
        <span><div class="nm">${l.name}</div><div class="src">${site ? l.srcSite : l.srcCrater}</div></span>
        <span class="key">${l.locked ? ICON.lock : l.key}</span>
      </div>`).join('');
    this.right.innerHTML = `
      <div class="sec">
        <div class="sec-h">Data layers <span class="tag">${site ? 'HiRISE ZONE' : 'CTX CRATER'}</span></div>
        ${rows}
        <div id="t-legend"></div>
      </div>
      <div class="sec">
        <div class="sec-h">Sun & terrain</div>
        <div class="ctl"><label>Local solar time</label><output id="o-time"></output>
          <input type="range" id="r-time" min="5.5" max="18.5" step="0.05" value="${view.ltst}"></div>
        <div class="kv" id="sun-kv" style="margin-top:4px"></div>
        <div class="ctl"><label>Vertical exaggeration</label><output id="o-exag"></output>
          <input type="range" id="r-exag" min="1" max="6" step="0.1" value="${view.exagTarget}"></div>
        <div class="seg"><button id="b-shadow" class="${view.shadows ? 'on' : ''}">SHADOWS</button><button id="b-now">NOW</button><button id="b-reset">RESET VIEW</button></div>
      </div>${site ? `
      <div class="sec">
        <div class="sec-h">Conditions · Jezero <span class="tag">TYPICAL · NOT LIVE</span></div>
        <div class="kv" style="margin-top:0">
          <span class="k">Air temperature</span><span class="v">−80 … −15 °C</span>
          <span class="k">Pressure</span><span class="v">≈ 7 hPa</span>
          <span class="k">Wind</span><span class="v">2–8 m/s, gusty pm</span>
          <span class="k">Dust opacity</span><span class="v">τ ≈ 0.5</span>
          <span class="k">Radiation</span><span class="v">≈ 0.67 mSv/sol</span>
        </div>
        <div class="assump">Typical ranges for this season from published Perseverance MEDA results. Radiation dose from Curiosity RAD at Gale (Hassler et al. 2014). The live MEDA feed is planned for phase 2.</div>
      </div>` : ''}`;
    this.right.querySelectorAll('[data-layer]').forEach((d) => {
      d.onclick = () => {
        const L = TERRAIN_LAYERS.find((x) => x.id === d.dataset.layer);
        if (L.locked) { this.toast(`${L.name.toUpperCase()} · ${site ? L.srcSite : L.srcCrater}`); return; }
        this.app.toggleTerrainLayer(d.dataset.layer);
      };
    });
    const rt = $('r-time'), re = $('r-exag');
    rt.oninput = () => { view.setTime(+rt.value); this.sunInfo(view); };
    rt.onchange = () => { if (site) this.app.planner.refreshSun(); };
    re.oninput = () => { view.exagTarget = +re.value; $('o-exag').textContent = `${(+re.value).toFixed(1)}×`; };
    $('o-exag').textContent = `${view.exagTarget.toFixed(1)}×`;
    $('b-shadow').onclick = () => { view.shadows = !view.shadows; $('b-shadow').classList.toggle('on', view.shadows); };
    $('b-now').onclick = () => {
      const lt = localTime(marsTime(), view.cfg.lon0).ltst;
      view.setTime(lt); rt.value = lt; this.sunInfo(view);
      if (site) this.app.planner.refreshSun();
      if (view.sun && view.sun.elevation < 0) this.toast('IT IS NIGHT AT JEZERO RIGHT NOW');
    };
    $('b-reset').onclick = () => { this.closeSheet(); view.flyTo(view.overview(), 1.6); };
    this.sunInfo(view);
    this.terrainLegend(view);

    if (!site) this.renderCraterLeft(view);
    else extraLeft?.();
    this.hints(`<kbd>DRAG</kbd> orbit <kbd>RMB/SHIFT</kbd> pan <kbd>SCROLL</kbd> zoom <kbd>1-6</kbd> layers <kbd>ESC</kbd> up${site ? ' <kbd>CLICK</kbd> pin &amp; route' : ' <kbd>ENTER</kbd> Marswalk zone'}`);
  }

  sunInfo(view) {
    const s = view.sunDir();
    const dl = dayLength(view.lat0, view.decl);
    $('o-time').textContent = `${formatHM(view.ltst)} LTST`;
    $('sun-kv').innerHTML = `
      <span class="k">Sun elevation</span><span class="v">${s.elevation.toFixed(1)}°</span>
      <span class="k">Sun azimuth</span><span class="v">${s.azimuth.toFixed(0)}°</span>
      <span class="k">Daylight</span><span class="v">${formatHM(dl.rise)} – ${formatHM(dl.set)}</span>`;
  }

  terrainLegend(view) {
    const L = $('t-legend');
    if (!L) return;
    const parts = [];
    const lim = view.cfg.slopeLim;
    if (view.layers.elev) parts.push(legendRamp('Elevation (m, MOLA datum)', 'linear-gradient(90deg,#0d366b,#184f95,#2a78d6,#5598e7,#9ec5f4,#eef6ff)', [fmtNum(view.meta.min), fmtNum((view.meta.min + view.meta.max) / 2), fmtNum(view.meta.max)]));
    if (view.layers.slope) parts.push(`<div class="legend"><div class="cap">Slope · walking hazard</div><div class="hz">
      <div><i style="background:var(--good)"></i>${ICON.ok} &lt;${lim[0]}° safe</div>
      <div><i style="background:var(--warning)"></i>${ICON.warn} ${lim[0]}–${lim[1]}° caution</div>
      <div><i style="background:var(--serious)"></i>${ICON.warn} ${lim[1]}–${lim[2]}° hazard</div>
      <div><i style="background:var(--critical)"></i>${ICON.stop} &gt;${lim[2]}° no-go</div></div></div>`);
    if (view.layers.thermal) parts.push(legendRamp('Ground firmness · THEMIS night IR (thermal-inertia proxy)', 'linear-gradient(90deg,#3a1a06,#7a3510,#c05a1c,#ec8a45,#f9c79a,#fff0e0)', ['loose dust / sand', 'firm rock']));
    if (view.layers.contour) parts.push(`<div class="legend"><div class="cap">Contours every ${view.cfg.contour[0]} m · bold every ${view.cfg.contour[1]} m</div></div>`);
    L.innerHTML = parts.join('');
    this.right.querySelectorAll('[data-layer]').forEach((d) => d.classList.toggle('on', !!view.layers[d.dataset.layer]));
  }

  renderCraterLeft(view) {
    const pois = view.poiItems.map((it) => `
      <button class="row" data-poi="${it.poi.id}"><span class="ic" style="color:var(--data)">${KIND_ICON[it.poi.kind] || '●'}</span>
      <span><div class="nm">${it.poi.name}</div><div class="ds">${it.poi.approx ? 'approx. position' : fmtLat(it.poi.lat) + ' ' + fmtLon(it.poi.lon)}</div></span></button>`).join('');
    const m = view.meta;
    this.left.innerHTML = `
      <div class="sec">
        <div class="sec-h">Crater survey <span class="tag">MRO CTX</span></div>
        <div class="title-xl">JEZERO</div>
        <div class="sub">A lake filled this crater about 3.5 billion years ago. The delta on its western edge is where life is most likely to have been preserved.</div>
        <div class="kv">
          <span class="k">Tile</span><span class="v">${fmtNum(view.sizeX, 1)} × ${fmtNum(view.sizeZ, 1)} km</span>
          <span class="k">Lowest point</span><span class="v">${fmtNum(m.min)} m</span>
          <span class="k">Highest point</span><span class="v">${fmtNum(m.max)} m</span>
          <span class="k">Relief</span><span class="v">${fmtNum(m.max - m.min)} m</span>
          <span class="k">Imagery / DEM</span><span class="v">5 m / 20 m</span>
        </div>
      </div>
      <div class="sec">
        <div class="sec-h">Marswalk zone <span class="tag">HiRISE 25 cm</span></div>
        <div class="sub" style="margin-top:0">5 × 5 km around Perseverance's landing site and the Three Forks sample depot, with 1 m elevation data. Plan an EVA on foot here.</div>
        <div class="btn-row"><button class="btn primary" id="btn-zone">▼ Enter Marswalk zone</button></div>
      </div>
      <div class="sec">
        <div class="sec-h">Points of interest</div>
        <div class="rows">${pois}</div>
      </div>`;
    $('btn-zone').onclick = () => { this.closeSheet(); this.app.enterSite(); };
    this.left.querySelectorAll('[data-poi]').forEach((b) => {
      b.onclick = () => { this.closeSheet(); this.app.onPOIClick(view, view.poiItems.find((i) => i.poi.id === b.dataset.poi).poi); };
    });
  }

  // ------------------------------------------------------------------ PLANNER
  renderPlanner(pl) {
    if (this.app.mode !== 'site') return;
    const r = pl.result;
    const wps = pl.waypoints.map((w, i) => `
      <div class="wp"><div class="n"><span>${i + 1}</span></div>
        <div style="min-width:0"><div class="nm">${w.name}</div><div class="ds" title="${w.poi?.reason || ''}">${w.poi?.reason || w.note || (i === 0 ? 'EVA start / airlock' : 'custom science stop')}</div></div>
        ${i > 0 ? `<button class="x" data-rm="${i}" title="Remove stop">✕</button>` : '<span></span>'}
      </div>`).join('');
    let body = '';
    if (!r) body = '<div class="sub">Click anywhere on the map to drop a pin and route there, or pick a point of interest.</div>';
    else if (r.failed) body = `<div class="verdict nogo"><span class="ic">${ICON.stop}</span><div>NO SAFE ROUTE<small>Every path crosses slopes over ${pl.params.maxSlope}°. Move the stop or raise the slope limit.</small></div></div>`;
    else {
      const b = r.budget;
      const v = r.verdict;
      const o2Pct = Math.max(0, Math.min(100, (b.o2 / pl.params.o2CapKg) * 100));
      const reservePct = 100 - pl.params.reservePct;
      const o2Col = b.remaining < b.reserveKg ? 'var(--critical)' : b.marginPct < pl.params.reservePct + 15 ? 'var(--warning)' : 'var(--data)';
      const vIcon = v.lvl === 'go' ? ICON.ok : v.lvl === 'caution' ? ICON.warn : ICON.stop;
      const vText = v.lvl === 'go' ? 'MARSWALK READY' : v.lvl === 'caution' ? 'GO WITH CAUTION' : 'NO-GO';
      const vSub = v.issues.length ? v.issues.map((i) => i.msg).join(' · ') : `All limits met, ${b.marginPct.toFixed(0)} % O₂ left at ingress`;
      body = `
        <div class="stats">
          <div class="stat"><div class="k">DISTANCE</div><div class="v">${(b.distance / 1000).toFixed(2)}<small>km</small></div></div>
          <div class="stat"><div class="k">EVA TIME</div><div class="v">${fmtDur(b.totalT)}</div></div>
          <div class="stat"><div class="k">MAX GRADE</div><div class="v">${b.maxSlope.toFixed(0)}<small>°</small></div></div>
          <div class="stat"><div class="k">CLIMB</div><div class="v">+${fmtNum(b.gain)}<small>m</small></div></div>
        </div>
        <div class="meter">
          <div class="lbl"><span>O₂ USED</span><b>${b.o2.toFixed(2)} / ${pl.params.o2CapKg.toFixed(2)} kg</b></div>
          <div class="track"><div class="fill" id="o2-fill" style="width:${o2Pct}%;background:${o2Col}"></div><div class="mark" style="left:${reservePct}%" title="Reserve line"></div></div>
          <div class="lbl" style="margin-top:4px"><span class="muted">avg ${fmtNum(b.avgW)} W metabolic</span><span class="muted">reserve ${pl.params.reservePct}%</span></div>
        </div>
        <div class="meter">
          <div class="lbl"><span>DAYLIGHT</span><b>${formatHM(r.sun.start)} → ${formatHM(r.sun.end)} · sunset ${formatHM(r.sun.sunset)}</b></div>
          <div class="track"><div class="fill" style="left:${(r.sun.start / 24) * 100}%;width:${Math.max(1, ((r.sun.end - r.sun.start) / 24) * 100)}%;background:var(--data)"></div>
          <div class="mark" style="left:${(r.sun.sunset / 24) * 100}%"></div></div>
        </div>
        <div class="verdict ${v.lvl}"><span class="ic">${vIcon}</span><div>${vText}<small>${vSub}</small></div></div>
        ${r.o2Out ? `<div class="assump dead-note"><b>✖ O₂ runs out at ${(r.o2Out.d / 1000).toFixed(2)} km</b> (${formatHM(r.sun.start + r.o2Out.t / 3698.9)} LTST, ${fmtDur(r.o2Out.t)} into the EVA) while ${r.o2Out.kind === 'stop' ? 'working at a stop' : 'walking'}. The red dashes are the part of the route EV1 never reaches. Press SIMULATE to see it.</div>` : ''}
        <div class="assump">${r.pnr ? `<b style="color:#ff7b7b">Point of no return</b> at ${(r.pnr.d / 1000).toFixed(2)} km (red marker). Past it, walking straight back needs ${r.pnr.need.toFixed(2)} kg of O₂ but only ${r.pnr.limit.toFixed(2)} kg is available above the reserve.` : 'No point of no return: from any point on the way out, EV1 can walk straight back to the airlock and keep the O₂ reserve.'}</div>
        <div class="sec-h" style="margin:14px 0 2px">Elevation profile <span class="tag">HiRISE 1 m DTM</span></div>
        <div class="profile" id="profile"></div>
        <div class="assump" style="margin-top:6px">Straight-line path: ${(r.direct.distance / 1000).toFixed(2)} km, crossing slopes up to <b>${r.direct.maxFine.toFixed(0)}°</b> (red dashes). The planned route stays under <b>${r.budget.fineMax.toFixed(0)}°</b>.</div>`;
    }
    this.left.innerHTML = `
      <div class="sec">
        <div class="sec-h">Marswalk planner <span class="tag">EV1 · ON FOOT</span></div>
        <div id="wps">${wps}</div>
        <div class="btn-row">
          <button class="btn small ${pl.addMode ? 'primary' : ''}" id="b-add">${pl.addMode ? 'CLICK MAP…' : '+ ADD STOP'}</button>
          <button class="btn small" id="b-sim" ${r && !r.failed ? '' : 'disabled'}>▶ SIMULATE EVA</button>
          <button class="btn small" id="b-plan">RESET</button>
        </div>
        <div class="seg" style="margin-top:8px"><button id="b-ret" class="${pl.returnToStart ? 'on' : ''}">RETURN TO LZ</button><button id="b-follow" class="${pl.follow ? 'on' : ''}">FOLLOW CAM</button></div>
      </div>
      <div class="sec">
        <div class="sec-h">Watney check · EVA budget</div>
        ${body}
        <div id="sim-status"></div>
      </div>
      <div class="sec">
        <div class="sec-h">Assumptions <span class="tag">EDITABLE</span></div>
        <div class="ctl"><label>Usable suit O₂</label><output>${pl.params.o2CapKg.toFixed(2)} kg</output><input type="range" id="p-o2" min="0.2" max="1.2" step="0.05" value="${pl.params.o2CapKg}"></div>
        <div class="ctl"><label>Max walking slope</label><output>${pl.params.maxSlope}°</output><input type="range" id="p-slope" min="8" max="30" step="1" value="${pl.params.maxSlope}"></div>
        <div class="ctl"><label>Time per stop</label><output>${pl.params.stopMin} min</output><input type="range" id="p-stop" min="5" max="60" step="5" value="${pl.params.stopMin}"></div>
        <div class="assump">Metabolic model: <b>Pandolf et al. 1977</b> scaled to 0.38 g, with a ${pl.params.suitPenalty}× suit penalty. ${pl.params.crewKg} kg crew + ${pl.params.suitKg} kg suit. 1 L O₂ ≈ 20.1 kJ. Route = A* least-energy path on the HiRISE DTM${r && r.budget ? `, solved in ${pl.computeMs.toFixed(0)} ms` : ''}.</div>
      </div>`;
    this.left.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => pl.remove(+b.dataset.rm); });
    $('b-add').onclick = () => { pl.addMode = !pl.addMode; this.renderPlanner(pl); if (pl.addMode) this.closeSheet(); };
    $('b-sim').onclick = () => { this.closeSheet(); pl.sim ? pl.stopSim() : pl.startSim(); };
    $('b-plan').onclick = () => this.app.resetPlan();
    $('b-ret').onclick = () => { pl.returnToStart = !pl.returnToStart; pl.compute(); };
    $('b-follow').onclick = () => { pl.follow = !pl.follow; $('b-follow').classList.toggle('on', pl.follow); };
    const bindP = (id, key, parse = Number) => { $(id).onchange = (e) => { pl.params[key] = parse(e.target.value); pl.compute(); }; $(id).oninput = (e) => { e.target.previousElementSibling.textContent = id === 'p-o2' ? `${(+e.target.value).toFixed(2)} kg` : id === 'p-slope' ? `${e.target.value}°` : `${e.target.value} min`; }; };
    bindP('p-o2', 'o2CapKg'); bindP('p-slope', 'maxSlope'); bindP('p-stop', 'stopMin');
    this.profileApi = null;
    if (r && !r.failed) {
      requestAnimationFrame(() => {
        if (pl.result !== r || !$('profile')) return;
        this.profileApi = renderProfile($('profile'), r, {
          slopeAt: (x, z) => pl.view.slopeAt(x, z), limits: pl.view.cfg.slopeLim, onHover: (d) => pl.showHover(d), pnr: r.pnr, o2Out: r.o2Out,
        });
      });
    }
  }

  updateSim(pl, t, st) {
    const box = $('sim-status');
    const wrist = $('wrist');
    if (t == null) {
      if (box) box.innerHTML = '';
      wrist.classList.remove('show', 'warn', 'crit', 'dead');
      this.profileApi?.cursor(null);
      return;
    }
    const r = pl.result, b = r.budget, sim = pl.sim || {};
    const cap = pl.params.o2CapKg;
    const left = Math.max(0, cap - st.o2);
    const clock = r.sun.start + t / 3698.9;
    const lvl = sim.dead ? 'dead' : sim.inReserve ? 'crit' : sim.pastPnr ? 'warn' : '';
    wrist.classList.toggle('warn', lvl === 'warn');
    wrist.classList.toggle('crit', lvl === 'crit');
    wrist.classList.toggle('dead', lvl === 'dead');
    this.profileApi?.cursor(st.d, lvl);
    if (sim.dead) {
      const da = sim.deadAt;
      const lt = da.lt;
      const mm = (sec) => `${Math.floor(sec / 60)}m ${String(Math.round(sec % 60)).padStart(2, '0')}s`;
      wrist.innerHTML = `<div class="wh">EV1 · SUIT ALARM <b>${formatHM(clock)}</b></div>
        <div class="wn">O₂ 0.00 kg · NO RESPONSE<b>${fmtDist(da.fromLZ)}</b></div>
        <div class="wg"><span>MAYDAY → EARTH<b>+${mm(lt)}</b><small>one-way light time</small></span><span>EARLIEST REPLY<b>+${mm(lt * 2)}</b><small>round trip</small></span><span>FROM AIRLOCK<b>${fmtDist(da.fromLZ)}</b><small>straight line</small></span></div>`;
      wrist.classList.add('show');
      if (box) box.innerHTML = `<div class="verdict nogo"><span class="ic">✖</span><div>EV1 LOST AT ${(st.d / 1000).toFixed(2)} KM<small>The suit ran dry ${fmtDur(t)} into the EVA, ${fmtDist(da.fromLZ)} from the airlock. A mayday takes ${mm(lt)} to reach Earth and a reply ${mm(lt * 2)} to come back. Nobody on Earth can help in time: the plan has to be right before egress.</small></div></div>`;
      const f = $('o2-fill');
      if (f) f.style.width = '100%';
      return;
    }
    const stops = r.stopAtD;
    const idx = stops.findIndex((d) => d > st.d + 1);
    const nextName = idx >= 0 ? pl.waypoints[idx + 1]?.name : pl.returnToStart ? pl.waypoints[0].name : pl.waypoints.at(-1).name;
    const nextD = (idx >= 0 ? stops[idx] : b.distance) - st.d;
    const leftH = left / (b.o2 / (b.totalT / 3600));
    const status = st.kind === 'stop' ? 'WORKING' : 'WALKING';
    const tag = lvl === 'crit' ? '▲ O₂ RESERVE' : lvl === 'warn' ? '▲ PAST PNR' : status;
    wrist.innerHTML = `<div class="wh">EV1 · WRIST <b>${formatHM(clock)}</b></div>
      <div class="wn">NEXT ▸ ${nextName}<b>${fmtDist(Math.max(0, nextD))}</b></div>
      <div class="wg"><span>O₂ <b>${left.toFixed(2)} kg</b><small>≈ ${leftH.toFixed(1)} h</small></span><span>DUST <b>τ 0.5</b><small>typical</small></span><span class="st">${tag}</span></div>`;
    wrist.classList.add('show');
    if (box) {
      box.innerHTML = `<div class="meter"><div class="lbl"><span>EV1 · ${st.kind === 'stop' ? 'WORKING AT STOP' : 'WALKING'}</span><b>${formatHM(clock)} LTST</b></div>
        <div class="track"><div class="fill" style="width:${(st.d / b.distance) * 100}%;background:${lvl ? 'var(--critical)' : 'var(--data)'}"></div></div>
        <div class="lbl" style="margin-top:4px"><span>${fmtDist(st.d)} of ${fmtDist(b.distance)}</span><b>O₂ ${left.toFixed(2)} kg left</b></div></div>`;
    }
    const f = $('o2-fill');
    if (f) f.style.width = `${Math.min(100, (st.o2 / cap) * 100)}%`;
  }

  // ------------------------------------------------------------------ sources
  showSources() {
    $('modal-body').innerHTML = `
      <h2>DATA SOURCES & CREDITS</h2>
      <p>Everything in Sol Atlas is real mission data. Nothing is hand-painted. Files were pulled from the public USGS Astrogeology archive (<code>asc-pds-services</code>) and processed by <code>scripts/build_data.py</code>.</p>
      <h3>ORBIT VIEW</h3>
      <table><tr><th>LAYER</th><th>MISSION / INSTRUMENT</th><th>PRODUCT</th></tr>
        <tr><td>Visible colour</td><td>Viking Orbiter 1 & 2</td><td>MDIM 2.1 global mosaic, recoloured by NASA Ames (232 m)</td></tr>
        <tr><td>Topography / relief</td><td>Mars Global Surveyor · MOLA</td><td>MOLA 128/64 ppd merged DEM (463 m)</td></tr>
        <tr><td>Night thermal IR</td><td>Mars Odyssey · THEMIS</td><td>USGS controlled night-IR mosaic v2 (100 m)</td></tr></table>
      <h3>JEZERO CRATER</h3>
      <table><tr><th>LAYER</th><th>MISSION / INSTRUMENT</th><th>PRODUCT</th></tr>
        <tr><td>Visible</td><td>MRO · CTX</td><td>Mars 2020 Science Investigation CTX orthomosaic, 5 m (JPL; Mangold et al. 2021)</td></tr>
        <tr><td>Elevation, slope, contours</td><td>MRO · CTX stereo</td><td>Mars 2020 Science Investigation CTX DEM, 20 m</td></tr>
        <tr><td>Thermal</td><td>Mars Odyssey · THEMIS</td><td>Night-IR controlled mosaic, 100 m</td></tr></table>
      <h3>MARSWALK ZONE</h3>
      <table><tr><th>LAYER</th><th>MISSION / INSTRUMENT</th><th>PRODUCT</th></tr>
        <tr><td>Visible</td><td>MRO · HiRISE</td><td>Mars 2020 Terrain-Relative-Navigation orthomosaic, 25 cm (USGS)</td></tr>
        <tr><td>Elevation, slope, route</td><td>MRO · HiRISE stereo</td><td>Mars 2020 TRN DTM, 1 m (USGS)</td></tr>
        <tr><td>Thermal</td><td>Mars Odyssey · THEMIS</td><td>Night-IR controlled mosaic, 100 m</td></tr></table>
      <h3>MODELS & REFERENCES</h3>
      <table>
        <tr><td>Mars time</td><td>Mars24 algorithm, Allison & McEwen (2000), NASA GISS. Sol count from Perseverance landing, 18 Feb 2021.</td></tr>
        <tr><td>Signal delay</td><td>JPL approximate planetary positions (Standish), Keplerian elements 1800–2050.</td></tr>
        <tr><td>EVA metabolic cost</td><td>Pandolf, Givoni & Goldman (1977) load-carriage equation, scaled to Mars gravity with a pressure-suit penalty.</td></tr>
        <tr><td>Three Forks depot</td><td>NASA/JPL-Caltech. Position from published witness-tube coordinates (18.439°N, 77.449°E, −2,568 m).</td></tr>
        <tr><td>Colour tint</td><td>CTX / HiRISE greyscale tinted with the Viking colour of the same ground (low-frequency chroma only).</td></tr>
      </table>
      <p class="muted" style="margin-top:16px">Positions marked "approx." were placed by eye on the mosaics. LZ-A is our proposed crew landing zone, not a NASA site. Acidalia / Ares III refers to the novel <i>The Martian</i> (Andy Weir) and is fiction. NASA imagery is not copyrighted; NASA logos are not used.</p>`;
    $('modal').hidden = false;
  }
}

function legendRamp(cap, grad, ticks) {
  return `<div class="legend"><div class="cap">${cap}</div><div class="ramp" style="background:${grad}"></div><div class="ticks">${ticks.map((t) => `<span>${t}</span>`).join('')}</div></div>`;
}
