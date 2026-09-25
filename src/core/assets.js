import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL;
const url = (f) => `${BASE}data/${f}`;

// [key, file, colourSpace, label for the loading log]
// The globe colour file comes from the quality tier (2k / 4k / 8k).
const TEXTURES = [
  ['g_color', null, 'srgb', 'Viking MDIM 2.1 global colour mosaic · NASA Ames'],
  ['g_normal', 'g_normal_4k.jpg', 'linear', 'MGS MOLA global topography → relief'],
  ['g_topo', 'g_topo_4k.jpg', 'srgb', 'MGS MOLA hypsometric scan'],
  ['g_thermal', 'g_thermal_4k.jpg', 'srgb', 'Mars Odyssey THEMIS night-IR mosaic'],
  ['r_color', 'r_color.jpg', 'srgb', 'Isidis / Nili Planum regional colour'],
  ['r_normal', 'r_normal.jpg', 'linear', 'Regional MOLA relief'],
  ['r_topo', 'r_topo.jpg', 'srgb', 'Regional MOLA elevation'],
  ['r_thermal', 'r_thermal.jpg', 'srgb', 'Regional THEMIS thermal'],
  ['c_decal', 'c_decal.jpg', 'srgb', 'Jezero orbital decal'],
  ['c_visible', 'c_visible.jpg', 'srgb', 'MRO CTX 5 m orthomosaic · Jezero (JPL)'],
  ['c_normal', 'c_normal.jpg', 'linear', 'MRO CTX 20 m stereo DEM · relief'],
  ['c_slope', 'c_slope.png', 'linear', 'Slope hazard from CTX DEM'],
  ['c_thermal', 'c_thermal.jpg', 'srgb', 'THEMIS night IR · Jezero'],
  ['s_visible', 's_visible.jpg', 'srgb', 'MRO HiRISE 25 cm orthomosaic · landing site'],
  ['s_normal', 's_normal.jpg', 'linear', 'MRO HiRISE 1 m DTM · relief'],
  ['s_slope', 's_slope.png', 'linear', 'Slope hazard from HiRISE DTM'],
  ['s_thermal', 's_thermal.jpg', 'srgb', 'THEMIS night IR · Marswalk zone'],
];

// Half-resolution copies exist for these (public/data/lite/), used on phones.
const LITE = new Set(['g_normal', 'g_topo', 'g_thermal', 'r_color', 'r_normal', 'r_topo', 'r_thermal',
  'c_decal', 'c_visible', 'c_normal', 'c_slope', 's_visible', 's_normal', 's_slope']);

/**
 * createImageBitmap decodes JPEG/PNG off the main thread, so big images don't
 * freeze the page. Older Safari/Firefox get the classic <img> path.
 * (Same feature test three.js's GLTFLoader uses.)
 */
function bitmapSupported() {
  if (typeof createImageBitmap === 'undefined') return false;
  const ua = navigator.userAgent;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const sv = ua.match(/Version\/(\d+)/);
  if (isSafari && (!sv || +sv[1] < 17)) return false;
  const fx = ua.match(/Firefox\/(\d+)/);
  if (fx && +fx[1] < 98) return false;
  return true;
}

export async function loadAssets(renderer, tier, onProgress) {
  const manifest = await fetch(url('manifest.json')).then((r) => r.json());
  const useBitmap = bitmapSupported();
  const bmpLoader = new THREE.ImageBitmapLoader();
  bmpLoader.setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const imgLoader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const tex = {};
  const total = TEXTURES.length + 4;
  let done = 0;
  const tick = (label) => onProgress(++done / total, label);

  const loadTexture = async (file) => {
    if (useBitmap) {
      const bmp = await bmpLoader.loadAsync(url(file));
      const t = new THREE.Texture(bmp);
      t.flipY = false; // already flipped during decode
      t.userData.flippedBitmap = true;
      t.needsUpdate = true;
      return t;
    }
    return imgLoader.loadAsync(url(file));
  };

  const texJobs = TEXTURES.map(([key, file, cs, label]) => {
    const f = key === 'g_color' ? tier.color : tier.lite && LITE.has(key) ? `lite/${file}` : file;
    return loadTexture(f).then((t) => {
      t.colorSpace = cs === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = Math.min(tier.name === 'low' ? 4 : 8, maxAniso);
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      if (key.startsWith('g_')) t.wrapS = THREE.RepeatWrapping;
      tex[key] = t;
      tick(label);
    });
  });

  const [gElev, cHeight, sHeight, traverse] = await Promise.all([
    heightPNG(url(manifest.global.elev.file)).then((a) => { tick('MOLA elevation grid'); return a; }),
    heightPNG(url(manifest.crater.file)).then((a) => { tick('Jezero CTX heightfield'); return a; }),
    heightPNG(url(manifest.site.file)).then((a) => { tick('Landing-site HiRISE heightfield'); return a; }),
    fetch(url('m20_traverse.json')).then((r) => r.json()).then((j) => { tick('Perseverance traverse · MMGIS waypoints'); return j; }).catch(() => null),
    ...texJobs,
  ]);

  const ge = manifest.global.elev;
  const gOff = ge.offset || 0;
  return {
    manifest, tex, traverse,
    heights: { crater: cHeight, site: sHeight },
    elevAt(lat, lon) {
      const x = Math.floor(((lon + 180) / 360) * ge.width) % ge.width;
      const y = Math.min(ge.height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * ge.height)));
      return gElev[y * ge.width + x] - gOff;
    },
  };
}

/** 16-bit heights packed into a lossless PNG: value = R * 256 + G. */
async function heightPNG(src) {
  const blob = await fetch(src).then((r) => r.blob());
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const out = new Uint16Array(c.width * c.height);
  for (let i = 0; i < out.length; i++) out[i] = (px[i * 4] << 8) | px[i * 4 + 1];
  bmp.close?.();
  return out;
}
