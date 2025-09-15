// /src/config.js
// Option B (Delta-Mode) + Sichtbarkeit/Erleichterungen:
// - großes, klares Fadenkreuz
// - Schuss-Tracer
// - Aim-Assist (Magnetismus)
// - größere Gegner/Hitbox

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
    grabDist: 0.14,
    breakDist: 1.0,      // wie bei dir
    stableDelay: 0.05
  },

  // Turret & Aiming (Delta-Mode beibehalten)
  turret: {
    height: 1.20,

    // Reaktionsgeschwindigkeit
    yawSpeed: 18.0,
    pitchSpeed: 18.0,

    // Pitch-Limits
    minPitch: -0.6,
    maxPitch:  1.1,

    // Sichtbarkeit: reticle näher + stilisiert
    crosshairDistance: 60, // vorher 200 → viel näher & sichtbarer
    crosshair: {
      size: 0.6,            // Außendurchmesser des Rings (m)
      thickness: 0.10,      // Ringbreite (m)
      opacity: 0.95,
      color: 0x9bd1ff,
      outlineOpacity: 0.35,
      centerDot: 0.06       // Durchmesser Center-Dot (m)
    },

    // Platzierung
    offsetZFromPlayer: -0.4,

    // Greifen
    requireGrabToAim: true,
    requireBothHandsToAim: true,

    // Delta-Mode + gewünschte Vorzeichen
    controlMode: 'delta',
    invertYaw:   true,     // <- dein Fix (rechts drehen = rechts folgen)
    invertPitch: true,     // Hände hoch → Rohr hoch

    sensitivityYaw:   1.0,
    sensitivityPitch: 1.0,
    deadzoneDeg: 0.4,
    pitchOffset: 0.0
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
  haptics: { shotAmp: 0.6, shotMs: 22, overheatAmp: 0.9, overheatMs: 70 },

  // UI
  ui: {
    heatBar: {
      offset: [0.35, 0.18, 0.32],
      size: [0.28, 0.035],
      background: 0x10161f,
      fill: 0x93b5ff
    }
  },

    grips: {
    // Umschalten: 'front-horizontal' (bisher) oder 'side-vertical' (neu)
    mode: 'side-vertical',

    front: {
      spread: 0.22,     // Abstand L/R von der Mitte (m)
      forward: 0.26,    // nach vorn (+Z lokal)
      height: 0.02,     // leicht über Pivot
      length: 0.16,     // Griff-Länge
      radius: 0.03,     // Griff-Radius
      rollDeg: 90       // 90° = horizontaler Stab
    },

    side: {
      spread: 0.28,     // weiter außen am Housing
      forward: 0.10,    // etwas nach vorn
      height: 0.02,     // nah am Pivot
      length: 0.16,
      radius: 0.03,
      tiltInDeg: 12     // leicht zur Mitte geneigt (ergonomisch)
    },

    color: 0x8899aa
  },


  // ✨ Tracer-Optik für Schüsse
  tracer: {
    enabled: true,
    lifeMs: 80,
    radius: 0.012,        // Zylinderradius (m)
    color: 0x9bd1ff,
    opacity: 0.9
  },

  // ✨ Aim-Assist (Magnetismus)
  aimAssist: {
    enabled: true,
    maxDistance: 120,     // nur bis zu dieser Entfernung
    coneNearDeg: 6.0,     // erlaubter Kegel bei nahen Zielen
    coneFarDeg: 2.0,      // bei maxDistance
    snapStrength: 0.6     // 0..1 – wie stark wir Richtung Ziel mischen
  },

  // Verhindert zu frühe Bodentreffer bei flachem Zielen
  aimConstraint: {
    enabled: true,
    groundY: 0,            // Bodenhöhe (y=0 in deiner Szene)
    minGroundHitDist: 100, // mind. Distanz (m), bevor Boden getroffen werden darf
    tiltUpMaxDeg: 6        // max. "Hochziehen" in Grad (sanft, kaum spürbar)
  },

  // Gegner / Wellen
  enemies: {
    spawnRadius: 120,
    attackRadius: 3.2,
    firstWaveCount: 6,
    waveGrowth: 1.35,
    spawnInterval: 0.35,
    wavePause: 4.0,

    // Sichtbarkeit/Hitbox größer, aber gleiche „DNA“
    grunt: {
      speed: 3.0,
      health: 40,
      reward: 10,
      scale: 1.6,        // NEU: größer darstellen
      hitRadius: 0.55    // NEU: größere (unsichtbare) Trefferkugel
    }
  },

  // --- STEP 5: Score/Combo + Trefferzonen ---
  score: {
    base: 1.0,
    max: 5.0,
    comboStep: 0.25,
    headshotBonus: 0.5,
    comboTime: 3.0
  },

  zones: {
    head: { damageMul: 2.0, scoreMul: 2.0 },
    core: { damageMul: 1.0, scoreMul: 1.0 }
  }
};
