// Quality tiers + an adaptive-resolution governor.
//
// high   desktop / laptop with a real GPU
// medium tablets, small laptops, integrated GPUs
// low    phones: half-resolution textures, lighter meshes, 30 fps cap
//
// Override with ?q=low | ?q=medium | ?q=high

export const TIERS = {
  high: {
    name: 'high', antialias: true, maxPR: 2, minPR: 0.75, lite: false, color: 'g_color_8k.jpg',
    meshStep: 1, sphere: [320, 160], stars: 7000, shadowSteps: 64, fpsCap: 0, overlays: true,
  },
  medium: {
    name: 'medium', antialias: true, maxPR: 1.5, minPR: 0.7, lite: false, color: 'g_color_4k.jpg',
    meshStep: 1, sphere: [256, 128], stars: 5000, shadowSteps: 48, fpsCap: 0, overlays: true,
  },
  low: {
    name: 'low', antialias: false, maxPR: 1.25, minPR: 0.6, lite: true, color: 'g_color_2k.jpg',
    meshStep: 2, sphere: [160, 80], stars: 2500, shadowSteps: 32, fpsCap: 30, overlays: false,
  },
};

export function isTouchDevice() {
  return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
}

/** Pick a tier before the WebGL context exists (antialias is a creation-time option). */
export function detectTier() {
  const q = new URLSearchParams(location.search).get('q');
  if (TIERS[q]) return TIERS[q];
  const touch = matchMedia('(pointer: coarse)').matches;
  const shortSide = Math.min(screen.width, screen.height);
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  if ((touch && shortSide < 820) || mem <= 3) return TIERS.low;
  if (touch || mem <= 4 || cores <= 4) return TIERS.medium;
  return TIERS.high;
}

/** Drop to the lower tier if the GPU can't hold the tier's largest textures. */
export function checkGPU(tier, renderer) {
  const maxTex = renderer.capabilities.maxTextureSize;
  if (tier.name === 'high' && maxTex < 8192) return TIERS.medium;
  if (tier.name === 'medium' && maxTex < 4096) return TIERS.low;
  return tier;
}

/**
 * Watches real frame times and nudges the render resolution so the frame rate
 * stays smooth: down quickly when frames are slow, back up slowly when there is headroom.
 */
export class Governor {
  constructor(tier, apply) {
    this.tier = tier;
    this.apply = apply;
    this.pr = Math.min(window.devicePixelRatio || 1, tier.maxPR);
    this.samples = [];
    this.goodWindows = 0;
    this.frozen = 0;
  }

  /** Call once per rendered frame with the time since the previous rendered frame (ms). */
  tick(ms) {
    if (this.frozen > 0) { this.frozen--; return; }
    if (ms > 250) return; // tab switch, loading hitch, breakpoint: ignore
    this.samples.push(ms);
    if (this.samples.length < 40) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const typical = sorted[Math.floor(sorted.length * 0.6)];
    this.samples.length = 0;
    const budget = this.tier.fpsCap ? 1000 / this.tier.fpsCap : 1000 / 60;
    const devMax = Math.min(window.devicePixelRatio || 1, this.tier.maxPR);
    if (typical > budget * 1.45 && this.pr > this.tier.minPR) {
      this.set(Math.max(this.tier.minPR, this.pr - (typical > budget * 2.2 ? 0.35 : 0.2)));
      this.goodWindows = 0;
    } else if (typical < budget * 1.12 && this.pr < devMax) {
      if (++this.goodWindows >= 4) { this.set(Math.min(devMax, this.pr + 0.15)); this.goodWindows = 0; }
    } else this.goodWindows = 0;
  }

  set(pr) {
    this.pr = Math.round(pr * 100) / 100;
    this.frozen = 20; // let the new size settle before judging again
    this.apply(this.pr);
  }
}
