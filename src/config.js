// /src/config.js
// Vollständige Config (inkl. Schießen/Heat/Haptik/UI + Gegner/Wellen)
// HINWEIS: Steuerungs-Flags sind so gesetzt, dass deine Turret-Handhabung
// NICHT verändert wird (delta-Mode, invertPitch=true, breakDist=1.0, pitchOffset=0.3).

export const CONFIG = {
  targetFPS: 90,
  groundSize: 400,

  // Sky gradient
  sky: { topColor: 0x0b1220, bottomColor: 0x152237 },

  // Lighting
  lights: {
    hemi: { sky: 0xcfe3ff, ground: 0x2a3442, intensity: 0.65 },
    dir:  { color: 0xffffff, intensity: 1.0, position: [10, 15, 6] }
  },

  // Input / Grip
  input: {
    grabDist: 0.14,     // ≤ 14 cm zum Greifen
    breakDist: 1.0,     // Griff löst sich erst >1 m → praktisch "eingesnappt"
    stableDelay: 0.05   // 50 ms bis Steuerung aktiv
  },

  // Turret & Aiming
  turret: {
    height: 1.20,

    // Reaktionsgeschwindigkeit (Tweaks möglich, ohne Modus zu ändern)
    yawSpeed: 18.0,     // rad/s
    pitchSpeed: 18.0,

    // Pitch-Limits
    minPitch: -0.6,     // ~ -34°
    maxPitch:  1.1,     // ~ +63°
    crosshairDistance: 200,

    // Platzierung (auf Boden in main.js positioniert)
    offsetZFromPlayer: -0.4, // ~40 cm vor Spieler

    // Greif-Anforderung
    requireGrabToAim: true,
    requireBothHandsToAim: true,

    // Steuerungsmodus & Inverts (NICHT ändern ohne Absprache)
    controlMode: 'delta', // 'absolute' | 'delta'
    invertYaw:   false,
    invertPitch: true,

    // Zusätzliche Steuerungs-Tweaks (Delta-Modus)
    sensitivityYaw:   1.5,
    sensitivityPitch: 1.5,
    deadzoneDeg: 0.2,

    // Von dir genutzt – hier beibehalten
    pitchOffset: 0.3
  },

  // Fire / Heat
  fire: {
    rpm: 720,                 // Feuerrate
    damage: 12,               // Schaden pro Schuss (für Gegner)
    spreadDeg: 0.6,           // Streuung
    heatPerShot: 2.8,         // Hitzezuwachs pro Schuss
    heatCoolRate: 16,         // Abkühlung pro Sekunde
    overheatThreshold: 100,   // Überhitzungsschwelle
    cooldownDelay: 0.20,      // Schießen pausiert Abkühlung für X s
    muzzleFlashMs: 40,        // Dauer Mündungsfeuer
    recoilPitch: 0.004,       // leichter Rückstoß (beeinflusst Ziel nur minimal)
    muzzleOffset: 1.1,        // Distanz Mündung vom Pivot (entlang -Z)
    range: 1500               // Hitscan-Reichweite
  },

  // Haptik (Meta/SteamVR Controller mit Rumble)
  haptics: {
    shotAmp: 0.6,   shotMs: 22,
    overheatAmp: 0.9, overheatMs: 70
  },

  // UI
  ui: {
    heatBar: {
      offset: [0.35, 0.18, 0.32],   // Position relativ am yawPivot
      size: [0.28, 0.035],          // Breite/Höhe (Meter)
      background: 0x10161f,
      fill: 0x93b5ff
    }
  },

  // Enemies / Waves
  enemies: {
    // Spawn-Logik um das Turret
    spawnRadius: 120,       // Radius des Spawn-Kreises
    attackRadius: 3.2,      // in diesem Abstand gilt "angekommen"
    firstWaveCount: 6,      // Startanzahl pro Welle
    waveGrowth: 1.35,       // Multiplikator pro Welle
    spawnInterval: 0.35,    // Zeit zwischen einzelnen Spawns
    wavePause: 4.0,         // Pause bis zur nächsten Welle (wenn alle tot)

    // Gegner-Typ "grunt" (Bodenläufer, Basis-Gegner)
    grunt: {
      speed: 3.0,           // m/s
      health: 40,           // HP
      reward: 10            // Score pro Kill
    }
  }
};
