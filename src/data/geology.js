// USGS SIM 3292, Geologic Map of Mars (Tanaka et al. 2014, 1:20,000,000), from the USGS-NASA
// Planetary Geologic Mapping Program. Unit symbols and colours come from the map's own files
// (public/data/manifest.json → geology.units, baked by scripts/build_data.py geology).
//
// Names follow the map's convention: an optional e/m/l (Early/Middle/Late), the period letters
// (A Amazonian, H Hesperian, N Noachian), then the unit group. Ages are the epoch boundaries in the
// pamphlet's Table 1 (Michael 2013, Hartmann 2004 iteration), in billions of years (Ga).
// Group descriptions summarise the map's Description of Map Units.

const PERIOD = { A: 'Amazonian', H: 'Hesperian', N: 'Noachian' };
const SUB = { e: 'Early', m: 'Middle', l: 'Late' };

const GROUP = {
  h: ['highland', 'highland'], hm: ['highland massif', 'highland'], hu: ['highland undivided', 'highland'], he: ['highland edifice', 'highland'],
  v: ['volcanic', 'volcanic'], vf: ['volcanic field', 'volcanic'], ve: ['volcanic edifice', 'volcanic'],
  b: ['basin', 'basin'], l: ['lowland', 'lowland'], a: ['apron', 'apron'], i: ['impact', 'impact'],
  t: ['transition', 'transition'], tu: ['transition undivided', 'transition'], to: ['transition outflow', 'transition'],
  p: ['polar', 'polar'], pu: ['polar undivided', 'polar'], pe: ['polar edifice', 'polar'], pc: ['polar cap', 'polar'], pd: ['polar dunes', 'polar'],
};

const GROUP_TEXT = {
  highland: 'Densely cratered old crust: a mix of impact, sedimentary and volcanic rocks.',
  volcanic: 'Lava flows and volcanic deposits, most likely basalt.',
  basin: 'Low-lying plains on the floors of the giant impact basins.',
  lowland: 'Sediments spread across the northern lowlands, likely mixed with lava.',
  apron: 'Lobes of material that flowed or slid downslope.',
  impact: 'Ejecta and rims of large, well-preserved impact craters.',
  transition: 'Plains, knobs and mesas where the highlands step down to the lowlands.',
  polar: 'Mostly ice, dust and other fines at the poles.',
};

// Units around the Marswalk site get their own line, from the map's Description of Map Units.
const UNIT_TEXT = {
  HNt: 'Knobs, mesas and plains on the highland edge: ancient impact breccias, sediments and volcanic rocks, with aprons of material shed from slopes. Jezero sits in this unit at this map scale.',
  mNhm: 'High massifs uplifted by a giant impact, here the Isidis basin, about 3.9 billion years ago. The massifs ring Isidis just east of Jezero.',
  lHl: 'Sediments from floods and rivers spread across the northern lowlands, likely mixed with lava. It covers the floor of Isidis Planitia.',
  eHv: 'Flood lavas from fissures and vents. Syrtis Major, south-west of Jezero, is built of it.',
};

// Lower boundary of each epoch (Ga); the younger end is the next epoch's start.
const START = { eN: null, mN: 3.96, lN: 3.85, eH: 3.56, lH: 3.39, eA: 3.24, mA: 1.03, lA: 0.274 };
const ORDER = ['eN', 'mN', 'lN', 'eH', 'lH', 'eA', 'mA', 'lA'];

function ageText(sub, periods) {
  // oldest and youngest epochs the symbol covers
  const eps = periods.flatMap((p) => (sub ? [sub + p] : ['e' + p, 'm' + p, 'l' + p].filter((x) => x in START)));
  const idx = eps.map((e) => ORDER.indexOf(e)).filter((i) => i >= 0).sort((a, b) => a - b);
  const oldest = ORDER[idx[0]], youngest = ORDER[idx[idx.length - 1]];
  const from = START[oldest];
  const nxt = ORDER[ORDER.indexOf(youngest) + 1];
  const to = nxt ? START[nxt] : 0;
  if (from == null) return to === 0 ? 'Noachian to recent' : `more than ${to} billion years old`;
  if (to === 0) return `${from} billion years ago to recent`;
  return `${from}–${to} billion years ago`;
}

/** { sym, name, age, group, text } for a unit symbol such as "HNt" or "mNhm". */
export function describeUnit(sym) {
  const m = /^([eml]?)([AHN]+)([a-z]+)$/.exec(sym);
  if (!m) return { sym, name: sym, age: '', group: '', text: '' };
  const [, sub, per, grp] = m;
  const [gname, gkey] = GROUP[grp] || [grp, ''];
  const periods = per.split('');
  const name = `${sub ? SUB[sub] + ' ' : ''}${periods.map((p) => PERIOD[p]).join(' and ')} ${gname} unit`;
  return { sym, name, age: ageText(sub, periods), group: gkey, text: UNIT_TEXT[sym] || GROUP_TEXT[gkey] || '' };
}

/** Units that frame the Jezero story, for the legend. */
export const JEZERO_UNITS = ['HNt', 'mNhm', 'lHl', 'eHv'];
