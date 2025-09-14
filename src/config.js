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
    stableDelay: 0.04   // Reduziert auf 40 ms für schnelleren Start (war 80 ms)
  },

  turret: {
    height: 1.20,
    // Schnelleres Nachziehen der Zielwinkel
    yawSpeed: 24.0,     // Verdoppelt auf 24 rad/s für responsiveres Folgen (war 12)
    pitchSpeed: 24.0,   // Dito
    minPitch: -0.6,     // ca. -34°
    maxPitch:  1.1,     // ca. +63°
    crosshairDistance: 200,

    // Platzierung & Steuerung
    offsetZFromPlayer: -0.4,     // ~40 cm vor dir
    requireGrabToAim: true,
    requireBothHandsToAim: true, // beide Griffe für Steuerung
    invertYaw:  true,            // Invertiert Links/Rechts – das sollte die Spiegelung fixen (war false)
    invertPitch: true,           // Optional: Invertiert Hoch/Runter, falls das auch verkehrt ist (teste beides)

    // Delta-Grip Sensitivität (Skalierung der Winkeländerung)
    sensitivityYaw:   1.8,       // Erhöht auf 1.8 für größere Deltas bei Handbewegungen (war 1.0)
    sensitivityPitch: 1.8,       // Dito
    deadzoneDeg: 0.2             // Reduziert auf 0.2° für weniger Ignorieren kleiner Bewegungen (war 0.4)
  }
};
