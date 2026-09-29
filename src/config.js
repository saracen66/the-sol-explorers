// Feature switches.
//
// helmetView: the first-person "helmet view" (walk the HiRISE terrain at eye height,
// twin joysticks on phones, EVA ride-along). It is finished and kept in the code
// (src/terrain/FirstPerson.js, src/ui/Joystick.js, the sky/horizon shaders), but switched
// off for the first-round submission. Set it to true to bring back every entry point:
// the HELMET VIEW button, the F key, STAND HERE on a dropped pin, and the autopilot's
// ride-along segment.
export const FEATURES = {
  helmetView: false,
};
