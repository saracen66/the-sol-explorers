// Feature switches.
//
// helmetView: the first-person "helmet view" (walk the HiRISE terrain at eye height,
// twin joysticks on phones, EVA ride-along). It is finished and kept in the code
// (src/terrain/FirstPerson.js, src/ui/Joystick.js, the sky/horizon shaders), but switched
// off for the first-round submission. Set it to true to bring back every entry point:
// the HELMET VIEW button, the F key, STAND HERE on a dropped pin, and the autopilot's
// ride-along segment.
//
// panelToggle: the small ‹ / › tabs on the inner edge of each desktop side panel that
// tuck the panel away and bring it back. Switched off for the first-round submission;
// while off, both panels always show (any earlier "hidden" choice is ignored).
export const FEATURES = {
  helmetView: false,
  panelToggle: false,
};
