// Drop a pin anywhere in the Marswalk zone (click / tap), Google-Maps style:
// the card shows what is under the pin and offers "route here" or "add as stop".
import * as THREE from 'three';
import { fmtLat, fmtLon, fmtNum, fmtDist } from '../lib/geo.js';

export class PinTool {
  constructor(app) {
    this.app = app;
    this.item = null;
    this.count = 0;
  }

  get open() { return !!this.item; }

  drop(x, z) {
    const a = this.app, v = a.site, pl = a.planner;
    this.close();
    const ll = v.xzToLonLat(x, z);
    const e = v.elevAt(x, z);
    const slope = v.slopeAt(x, z) ?? 0;
    const lim = v.cfg.slopeLim;
    const lz = pl.waypoints[0];
    const fromLZ = lz ? Math.hypot(x - lz.x, z - lz.z) * 1000 : null;
    const cls = slope >= pl.params.maxSlope ? ['nogo', '✖', `too steep to walk (limit ${pl.params.maxSlope}°)`]
      : slope >= lim[1] ? ['hazard', '▲', 'hazard ground'] : slope >= lim[0] ? ['caution', '▲', 'caution'] : ['ok', '✔', 'walkable'];
    const coords = `${fmtLat(ll.lat, 4)} ${fmtLon(ll.lon, 4)}`;
    const touch = a.touch;
    const html = `<div class="pinhead"></div>
      <div class="pcard">
        <div class="ph"><b>DROPPED PIN</b><button class="px" data-a="close" aria-label="Close">✕</button></div>
        <div class="pc">${coords}</div>
        <div class="pk">
          <span>ELEVATION</span><b>${fmtNum(e)} m</b>
          <span>SLOPE</span><b class="s-${cls[0]}">${cls[1]} ${slope.toFixed(0)}° · ${cls[2]}</b>
          ${fromLZ != null ? `<span>FROM LZ-A</span><b>${fmtDist(fromLZ)} direct</b>` : ''}
        </div>
        <div class="pb">
          <button class="btn small primary" data-a="route">➜ ROUTE HERE</button>
          <button class="btn small" data-a="add">+ ADD STOP</button>
          ${a.fpv ? '<button class="btn small" data-a="walk">◉ STAND HERE</button>' : ''}
        </div>
        <div class="pn">${touch ? 'Tap the map again to close' : 'Least-energy route from the airlock, solved on the HiRISE DTM'}</div>
      </div>`;
    const it = a.labels.add('pin', { className: 'pin', html, world: new THREE.Vector3(x, v.yAt(x, z), z), priority: 20 });
    it.xz = { x, z };
    it.info = { coords, e, slope };
    it.el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-a]');
      if (!b) return;
      ev.stopPropagation();
      const act = b.dataset.a;
      if (act === 'close') this.close();
      else if (act === 'route') this.routeHere();
      else if (act === 'add') this.addStop();
      else if (act === 'walk') { this.close(); a.fpv.enter(x, z); }
    });
    this.item = it;
    v.pulse(x, z);
    a.sound?.pin();
  }

  name() { return `Pin ${++this.count}`; }

  routeHere() {
    const it = this.item;
    if (!it) return;
    const pl = this.app.planner;
    const home = pl.waypoints[0];
    pl.waypoints = home ? [home] : [];
    pl.waypoints.push({ name: this.name(), x: it.xz.x, z: it.xz.z, note: it.info.coords });
    pl.userEdit = true;
    this.close();
    pl.compute();
    this.summary(pl);
  }

  addStop() {
    const it = this.item;
    if (!it) return;
    const pl = this.app.planner;
    pl.waypoints.push({ name: this.name(), x: it.xz.x, z: it.xz.z, note: it.info.coords });
    pl.userEdit = true;
    this.close();
    pl.compute();
    this.summary(pl);
  }

  summary(pl) {
    const r = pl.result, hud = this.app.hud;
    if (!r) return;
    if (r.failed) { hud.toast('NO SAFE ROUTE · EVERY PATH CROSSES TOO-STEEP GROUND', 3400); return; }
    const b = r.budget;
    const h = Math.floor(b.totalT / 3600), m = Math.round((b.totalT % 3600) / 60);
    const call = r.verdict.lvl === 'go' ? 'GO' : r.verdict.lvl === 'caution' ? 'CAUTION' : 'NO-GO';
    hud.toast(`ROUTE · ${(b.distance / 1000).toFixed(2)} KM · ${h ? `${h} H ` : ''}${m} MIN · ${call}`, 3600);
  }

  close() {
    if (!this.item) return;
    this.app.labels.clear('pin');
    this.item = null;
  }

  frame() {
    const it = this.item;
    if (!it) return;
    const v = this.app.site;
    it.world.set(it.xz.x, v.yAt(it.xz.x, it.xz.z), it.xz.z);
    // keep the card on screen: prefer right of the pin, slide left near the edge, drop below near the top
    if (it.screen) {
      const card = it.card || (it.card = it.el.querySelector('.pcard'));
      const w = card.offsetWidth || 262;
      const left = Math.max(10 - it.screen.x, Math.min(18, this.app.w - 10 - w - it.screen.x));
      card.style.left = `${left.toFixed(0)}px`;
      it.el.classList.toggle('below', it.screen.y < (card.offsetHeight || 200) + 60);
    }
  }
}
