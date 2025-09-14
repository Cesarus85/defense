// /src/config.js
// Option B: Delta-Mode mit ergonomischer Neutralhaltung (pitchOffset=0.0)

export const CONFIG = {
  targetFPS: 90,
  groundSize: 400,

  sky: { topColor: 0x0b1220, bottomColor: 0x152237 },

  lights: {
    hemi: { sky: 0xcfe3ff, ground: 0x2a3442, intensity: 0.65 },
    dir:  { color: 0xffffff, intensity: 1.0, position: [10, 15, 6] }
  },

  // Grip-Handling
  input: {
    grabDist: 0.14,     // ≤ 14 cm zum Greifen
    breakDist: 1.0,     // (belassen wie bei dir) Griff löst erst > 1 m
    stableDelay: 0.05   // 50 ms bis Steuerung aktiv
  },

  turret: {
    height: 1.20,

    // Reaktionsgeschwindigkeit
    yawSpeed: 18.0,     // rad/s
    pitchSpeed: 18.0,

    // Limits
    minPitch: -0.6,
    maxPitch:  1.1,
    crosshairDistance: 200,

    // Platzierung (auf Boden in main.js)
    offsetZFromPlayer: -0.4,

    // Greifen
    requireGrabToAim: true,
    requireBothHandsToAim: true,

    // ✨ Option B: Delta-Mode + ergonomisch
    controlMode: 'delta',   // beibehalten
    invertYaw:   false,
    invertPitch: true,      // Hände hoch → Rohr hoch
    sensitivityYaw:   1.0,
    sensitivityPitch: 1.0,
    deadzoneDeg: 0.4,
    pitchOffset: 0.0       // wichtig: neutral, kein "nach unten drücken"
  },

  // Waffe / Heat
  fire: {
    rpm: 720,
    damage: 12,
    spreadDeg: 0.6,
    heatPerShot: 2.8,
    heatCoolRate: 16,
    overheatThreshold: 100,
    cooldownDelay: 0.20,
    muzzleFlashMs: 40,
    recoilPitch: 0.004,
    muzzleOffset: 1.1,
    range: 1500
  },

  // Haptik
  haptics: {
    shotAmp: 0.6,   shotMs: 22,
    overheatAmp: 0.9, overheatMs: 70
  },

  // UI
  ui: {
    heatBar: {
      offset: [0.35, 0.18, 0.32],
      size: [0.28, 0.035],
      background: 0x10161f,
      fill: 0x93b5ff
    }
  },

  // Gegner / Wellen
  enemies: {
    spawnRadius: 120,
    attackRadius: 3.2,
    firstWaveCount: 6,
    waveGrowth: 1.35,
    spawnInterval: 0.35,
    wavePause: 4.0,
    grunt: { speed: 3.0, health: 40, reward: 10 }
  }
};
