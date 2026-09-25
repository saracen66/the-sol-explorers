// Virtual thumb-stick for touch screens (helmet view). Each stick tracks its own
// pointer, so both thumbs can be used at once.

export class Joystick {
  constructor(parent, side, label) {
    const el = document.createElement('div');
    el.className = `joy ${side}`;
    el.innerHTML = `<div class="joy-base"><div class="joy-knob"></div></div><span class="joy-lb">${label}</span>`;
    parent.appendChild(el);
    this.el = el;
    this.base = el.querySelector('.joy-base');
    this.knob = el.querySelector('.joy-knob');
    this.value = { x: 0, y: 0 };
    this.id = null;
    const move = (e) => {
      if (e.pointerId !== this.id) return;
      const r = this.base.getBoundingClientRect();
      const R = r.width / 2;
      let dx = (e.clientX - (r.left + R)) / R, dy = (e.clientY - (r.top + R)) / R;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      this.value = { x: dx, y: dy };
      this.knob.style.transform = `translate(${(dx * R * 0.62).toFixed(1)}px, ${(dy * R * 0.62).toFixed(1)}px)`;
    };
    const end = (e) => {
      if (e.pointerId !== this.id) return;
      this.id = null;
      this.value = { x: 0, y: 0 };
      this.knob.style.transform = '';
      el.classList.remove('on');
    };
    this.base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.id = e.pointerId;
      this.base.setPointerCapture(e.pointerId);
      el.classList.add('on');
      move(e);
    });
    this.base.addEventListener('pointermove', move);
    this.base.addEventListener('pointerup', end);
    this.base.addEventListener('pointercancel', end);
    this.base.addEventListener('lostpointercapture', end);
  }

  get magnitude() { return Math.hypot(this.value.x, this.value.y); }

  reset() {
    this.id = null;
    this.value = { x: 0, y: 0 };
    this.knob.style.transform = '';
    this.el.classList.remove('on');
  }
}
