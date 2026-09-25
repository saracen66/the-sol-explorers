// Screen recorder for the pitch video: captures this browser tab (HUD, labels and
// the synthesised sound included) and downloads it as a video file.
// Idea from Sayma's prototype (services/recorder.ts); this version records the
// whole tab rather than just the WebGL canvas, so the overlays are in the video.

export class Recorder {
  constructor(hud) {
    this.hud = hud;
    this.rec = null;
    this.supported = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder);
  }

  get active() { return !!this.rec; }

  async toggle() {
    if (this.rec) { this.stop(); return; }
    if (!this.supported) { this.hud.toast('RECORDING NEEDS A DESKTOP BROWSER'); return; }
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 60 }, audio: true,
        preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', systemAudio: 'include',
      });
    } catch {
      this.hud.toast('RECORDING CANCELLED');
      return;
    }
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12e6 });
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = mr.mimeType || 'video/webm';
      const blob = new Blob(chunks, { type });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.download = `sol-atlas-${ts}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      this.hud.toast(`SAVED ${a.download.toUpperCase()}`, 3600);
    };
    // the user can also end it from the browser's "stop sharing" bar
    stream.getVideoTracks()[0].addEventListener('ended', () => this.stop());
    mr.start(1000);
    this.rec = { mr, t0: performance.now() };
    this.tick = setInterval(() => this.render(), 500);
    this.render();
    this.hud.toast('● RECORDING · PRESS R OR ■ TO STOP');
  }

  stop() {
    if (!this.rec) return;
    const { mr } = this.rec;
    this.rec = null;
    clearInterval(this.tick);
    if (mr.state !== 'inactive') mr.stop();
    this.render();
  }

  render() {
    const b = document.getElementById('btn-rec');
    if (!b) return;
    if (!this.rec) { b.textContent = '● REC'; b.classList.remove('rec-on'); return; }
    const s = Math.floor((performance.now() - this.rec.t0) / 1000);
    b.textContent = `■ ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    b.classList.add('rec-on');
  }
}
