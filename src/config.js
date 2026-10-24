// Feature switches.
//
// helmetView: the first-person "helmet view" (walk the HiRISE terrain at eye height,
// twin joysticks on phones, EVA ride-along). Turning it off removes every entry point:
// the HELMET VIEW button, the F key, STAND HERE on a dropped pin, and the autopilot's
// ride-along segment. (It was off for the first-round submission.)
//
// craterPanel: the CRATER panel in the Jezero Crater view (crater facts, the Marswalk
// zone card with its ENTER button, the points-of-interest list; on phones the CRATER
// sheet button). Turning it off leaves the crater view, its layers panel and the
// ‹ / › collapse tabs as they are. (It was off for the first-round submission.)
export const FEATURES = {
  helmetView: true,
  craterPanel: true,
};
