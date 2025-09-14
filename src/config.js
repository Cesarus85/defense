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
    breakDist: 1.0,     // Erhöht auf 1m, um Entgleiten zu vermeiden – praktisch "festgesnappt" (war 0.18)
    stableDelay: 0.04   // 40 ms für schnelleren Start
  },

  turret: {
    height: 1.20,
    yawSpeed: 24.0,     // 24 rad/s für responsives Folgen
    pitchSpeed: 24.0,
    minPitch: -0.6,     // ca. -34°
    maxPitch:  1.1,     // ca. +63°
    crosshairDistance: 200,

    // Platzierung & Steuerung
    offsetZFromPlayer: -0.4,     // ~40 cm vor dir
    requireGrabToAim: true,
    requireBothHandsToAim: true, // beide Griffe für Steuerung (teste false für Einhand)
    invertYaw:  true,            // Invertiert Links/Rechts
    invertPitch: true,           // Invertiert Hoch/Runter (anpassen nach Bedarf)

    // Delta-Grip Sensitivität
    sensitivityYaw:   1.8,       // 1.8 für größere Deltas
    sensitivityPitch: 1.8,
    deadzoneDeg: 0.2             // 0.2° für weniger Ignorieren
  }

    fire: {
    rpm: 720,                 // Schussrate
    damage: 12,               // Platzhalter für später
    spreadDeg: 0.6,           // Streuung pro Schuss
    heatPerShot: 2.8,         // Heat-Zuwachs
    heatCoolRate: 16,         // Heat-Abkühlung / s
    overheatThreshold: 100,   // Schwelle
    cooldownDelay: 0.20,      // Schießen pausiert Cooldown für X s
    muzzleFlashMs: 40,        // Flash Dauer
    recoilPitch: 0.008,       // Rückstoß (nach oben)
    muzzleOffset: 1.1,        // Abstand Mündung vom Pivot (in m, lokal -Z)
    range: 1500               // Hitscan-Reichweite
  },
  haptics: {
    shotAmp: 0.6, shotMs: 22,
    overheatAmp: 0.9, overheatMs: 70
  },
  ui: {
    heatBar: {
      offset: [0.35, 0.18, 0.32],   // relative Position an yawPivot
      size: [0.28, 0.035],          // Breite/Höhe
      background: 0x10161f,
      fill: 0x93b5ff
    }
  },

};
