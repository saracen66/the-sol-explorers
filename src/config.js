// Feature switches.
//
// helmetView: the first-person "helmet view" (walk the HiRISE terrain at eye height,
// twin joysticks on phones, EVA ride-along). It is finished and kept in the code
// (src/terrain/FirstPerson.js, src/ui/Joystick.js, the sky/horizon shaders), but switched
// off for the first-round submission. Set it to true to bring back every entry point:
// the HELMET VIEW button, the F key, STAND HERE on a dropped pin, and the autopilot's
// ride-along segment.
//
// craterPanel: the CRATER panel in the Jezero Crater view (crater facts, the Marswalk
// zone card with its ENTER button, the points-of-interest list; on phones the CRATER
// sheet button). Switched off for the first-round submission. The crater view itself,
// its layers panel and the ‹ / › collapse tabs are unaffected; the Marswalk zone is
// still entered by clicking the zone box on the map or zooming in.
export const FEATURES = {
  helmetView: false,
  craterPanel: false,
};
