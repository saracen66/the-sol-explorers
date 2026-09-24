import * as THREE from 'three';

const v = new THREE.Vector3();

/** DOM labels pinned to 3D points. */
export class Labels {
  constructor(root) {
    this.root = root;
    this.groups = new Map();
  }

  group(name) {
    if (!this.groups.has(name)) this.groups.set(name, []);
    return this.groups.get(name);
  }

  add(groupName, { className = '', html = '', world, onClick, onEnter, onLeave, occlude, priority = 0 }) {
    const el = document.createElement('div');
    el.className = `mk ${className}`;
    el.innerHTML = html;
    if (onClick) el.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
    if (onEnter) el.addEventListener('pointerenter', onEnter);
    if (onLeave) el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.appendChild(el);
    const item = { el, lb: el.querySelector('.lb'), world: world.clone(), occlude, visible: true, hiddenByUser: false, priority };
    this.group(groupName).push(item);
    return item;
  }

  clear(groupName) {
    for (const it of this.group(groupName)) it.el.remove();
    this.groups.set(groupName, []);
  }

  setVisible(groupName, on) {
    for (const it of this.group(groupName)) it.el.style.display = on ? '' : 'none';
  }

  update(groupName, camera, w, h) {
    const shown = [];
    for (const it of this.group(groupName)) {
      if (it.el.style.display === 'none') continue;
      v.copy(it.world).project(camera);
      const behind = v.z > 1 || v.z < -1;
      const occl = it.occlude ? it.occlude(it) : false;
      const hide = behind || occl || it.hiddenByUser;
      it.el.classList.toggle('hidden', hide);
      if (!hide) {
        const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
        it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        it.screen = { x, y };
        shown.push(it);
      }
    }
    // declutter: higher-priority labels keep their text, colliding ones shrink to a marker
    shown.sort((a, b) => b.priority - a.priority);
    const boxes = [];
    for (const it of shown) {
      const lb = it.lb;
      if (!lb) continue;
      if (it.lbW == null || it.lbW === 0) it.lbW = lb.offsetWidth;
      const { x, y } = it.screen;
      const b = [x - 6, y - 12, x + 14 + it.lbW, y + 18];
      const hit = boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
      it.el.classList.toggle('crowd', hit);
      if (!hit) boxes.push(b);
    }
  }
}
