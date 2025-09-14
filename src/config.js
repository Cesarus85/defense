// Complete config with Step 2 (Fire + Haptics + Heat UI) and snappier aiming
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
    breakDist: 0.18,    // > 18 cm → Griff löst automatisch
    stableDelay: 0.08   // 80 ms: erst dann Steuerung freigeben
  },

  turret: {
    height: 1.20,

    // Snappier response
    yawSpeed: 12.0,     // rad/s
    pitchSpeed: 12.0,

    // Pitch limits
    minPitch: -0.6,     // ~ -34°
    maxPitch:  1.1,     // ~ +63°
    crosshairDistance: 200,

    // Placement & control
    offsetZFromPlayer: -0.4,     // ~40 cm vor dir (auf Bodenhöhe platziert)
    requireGrabToAim: true,
    requireBothHandsToAim: true, // beide Griffe für Steuerung
    invertYaw:  false,
    invertPitch:false,

    // Delta-grip sensitivity & smoothing
    sensitivityYaw:   1.0,       // 1.0 = 1:1
    sensitivityPitch: 1.0,
    deadzoneDeg: 0.4            // kleine Zitterbewegungen ignorieren
  },

  // Firing / Heat
  fire: {
    rpm: 720,                 // Schussrate
    damage: 12,               // Platzhalter (für Gegner später)
    spreadDeg: 0.6,           // Streuung pro Schuss
    heatPerShot: 2.8,         // Heat-Zuwachs pro Schuss
    heatCoolRate: 16,         // Abkühlung pro Sekunde
    overheatThreshold: 100,   // Überhitzungsschwelle
    cooldownDelay: 0.20,      // Schießen pausiert Abkühlung für X s
    muzzleFlashMs: 40,        // Sichtbarer Mündungs-Flash
    recoilPitch: 0.008,       // Rückstoß (leicht nach oben)
    muzzleOffset: 1.1,        // Mündung vor dem Pitch-Pivot (m, entlang -Z)
    range: 1500               // Hitscan-Reichweite
  },

  haptics: {
    shotAmp: 0.6,   shotMs: 22,
    overheatAmp: 0.9, overheatMs: 70
  },

  ui: {
    heatBar: {
      offset: [0.35, 0.18, 0.32],   // Position relativ am yawPivot
      size: [0.28, 0.035],          // Breite/Höhe in "m"
      background: 0x10161f,
      fill: 0x93b5ff
    }
  }
};
