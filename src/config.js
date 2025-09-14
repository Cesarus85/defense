export const CONFIG = {
  targetFPS: 90,
  groundSize: 400,
  sky: { topColor: 0x0b1220, bottomColor: 0x152237 },
  lights: {
    hemi: { sky: 0xcfe3ff, ground: 0x2a3442, intensity: 0.65 },
    dir:  { color: 0xffffff, intensity: 1.0, position: [10, 15, 6] }
  },
  turret: {
    height: 1.20,
    yawSpeed: 6.0,
    pitchSpeed: 6.0,
    minPitch: -0.35,
    maxPitch:  0.95,
    crosshairDistance: 200,

    // Platzierung & Steuerung
    offsetZFromPlayer: -0.4,     // ~40 cm vor dir (10 cm weiter weg als zuvor)
    requireGrabToAim: true,      // ohne Grip kein Aimen
    requireBothHandsToAim: true, // erst mit beiden Händen
    invertYaw:  false,           // Links/Rechts natürlich
    invertPitch:true             // Hoch/Runter invertiert (wie gewünscht)
  }
};
