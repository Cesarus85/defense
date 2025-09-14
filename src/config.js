export const CONFIG = {
  targetFPS: 90,
  groundSize: 400, // "virtuelle Meter" für die weite Ebene
  sky: {
    topColor: 0x0b1220,
    bottomColor: 0x152237
  },
  lights: {
    hemi: { sky: 0xcfe3ff, ground: 0x2a3442, intensity: 0.65 },
    dir:  { color: 0xffffff, intensity: 1.0, position: [10, 15, 6] }
  },
  turret: {
    height: 1.20,      // Pivot-Höhe über Boden (in Metern)
    yawSpeed: 6.0,     // rad/s Zielverfolgungs-"Dämpfung"
    pitchSpeed: 6.0,
    minPitch: -0.35,   // runter
    maxPitch:  0.95,   // rauf
    crosshairDistance: 200, // wie weit vorne der Zielpunkt schwebt
  }
};
