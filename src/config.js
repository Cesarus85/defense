// Config tuned for direct "absolute" aiming + Step 2 systems
export const CONFIG = {
  targetFPS: 90,
  groundSize: 400,

  sky: { topColor: 0x0b1220, bottomColor: 0x152237 },

  lights: {
    hemi: { sky: 0xcfe3ff, ground: 0x2a3442, intensity: 0.65 },
    dir:  { color: 0xffffff, intensity: 1.0, position: [10, 15, 6] }
  },

  // Input / Grip behavior
  input: {
    grabDist: 0.14,     // ≤ 14 cm zum Greifen
    breakDist: 1.0,     // Erhöht auf 1m, um Entgleiten zu vermeiden – praktisch "festgesnappt"
    stableDelay: 0.05   // 50 ms bis Steuerung aktiv (schnelleres Arretieren)
  },

  turret: {
    height: 1.20,

    // Schnelle Reaktion (sehr direkt)
    yawSpeed: 18.0,     // rad/s
    pitchSpeed: 18.0,

    // Pitch limits
    minPitch: -0.6,     // ~ -34°
    maxPitch:  1.1,     // ~ +63°
    crosshairDistance: 200,

    // Placement & control
    offsetZFromPlayer: -0.4,     // ~40 cm vor dir (auf Bodenhöhe platziert)
    requireGrabToAim: true,
    requireBothHandsToAim: true, // beide Griffe für Steuerung

    // Aiming-Modus
    controlMode: 'absolute',     // 'absolute' | 'delta'

    // Invert-Flags (greifen wir explizit im main.js auf)
    invertYaw:   false,
    invertPitch: true,           // ↑ / ↓ wieder wie gewünscht
                                 // (true macht "Hände hoch" => Rohr hoch)

    // Delta-Grip Sensitivität (falls du später auf 'delta' wechselst)
    sensitivityYaw:   1.0,
    sensitivityPitch: 1.0,
    deadzoneDeg: 0.4,

    // Neu: Pitch-Offset, um natürliche Handhaltung zu kompensieren (verhindert Initial-Down)
    pitchOffset: 0.3             // ca. 17° hoch, anpassen nach Bedarf
  },

  // Firing / Heat
  fire: {
    rpm: 720,
    damage: 12,
    spreadDeg: 0.6,
    heatPerShot: 2.8,
    heatCoolRate: 16,
    overheatThreshold: 100,
    cooldownDelay: 0.20,
    muzzleFlashMs: 40,
    recoilPitch: 0.004,    // etwas reduziert, damit’s die Handführung nicht „wegdrückt“
    muzzleOffset: 1.1,
    range: 1500
  },

  haptics: {
    shotAmp: 0.6,   shotMs: 22,
    overheatAmp: 0.9, overheatMs: 70
  },

  ui: {
    heatBar: {
      offset: [0.35, 0.18, 0.32],
      size: [0.28, 0.035],
      background: 0x10161f,
      fill: 0x93b5ff
    }
  }
};
