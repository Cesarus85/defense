// Steuer-Tuning zentral hier
export const CONFIG = {
  targetFPS: 90,
  groundSize: 400,
  sky: { topColor: 0x0b1220, bottomColor: 0x152237 },
  lights: {
    hemi: { sky: 0xcfe3ff, ground: 0x2a3442, intensity: 0.65 },
    dir:  { color: 0xffffff, intensity: 1.0, position: [10, 15, 6] }
  },

  // Eingabe/Greifen
  input: {
    grabDist: 0.14,     // <= 14 cm zum Greifen
    breakDist: 0.18,    // > 18 cm → Griff löst automatisch
    stableDelay: 0.08   // 80 ms “stabil” bevor Steuerung losgeht
  },

  turret: {
    height: 1.20,
    // Schnelleres Nachziehen der Zielwinkel
    yawSpeed: 12.0,     // rad/s (Response)
    pitchSpeed: 12.0,
    minPitch: -0.6,     // ca. -34°
    maxPitch:  1.1,     // ca. +63°
    crosshairDistance: 200,

    // Platzierung & Steuerung
    offsetZFromPlayer: -0.4,     // ~40 cm vor dir
    requireGrabToAim: true,
    requireBothHandsToAim: true, // beide Griffe für Steuerung
    invertYaw:  false,           // Links/Rechts natürlich
    invertPitch:false,           // Hoch/Runter natürlich

    // Delta-Grip Sensitivität (Skalierung der Winkeländerung)
    sensitivityYaw:   1.0,       // 1.0 = 1:1
    sensitivityPitch: 1.0,
    deadzoneDeg: 0.4            // kleine Zitterbewegungen ignorieren
  }
};
