import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js';
import { CONFIG } from './config.js';

export class Turret {
  constructor() {
    this.root = new THREE.Group();      // Basis am Boden (y=0)
    this.yawPivot = new THREE.Group();  // dreht um Y
    this.pitchPivot = new THREE.Group();// neigt um X
    this.crosshair = this.#makeCrosshair();

    // --- Base (optisch)
    const baseGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.42, 16);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x394654, metalness: 0.1, roughness: 0.8 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.castShadow = false; base.receiveShadow = true;
    base.position.y = 0.21;
    this.root.add(base);

    // --- Säule
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.2, CONFIG.turret.height, 12);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x445566, metalness: 0.2, roughness: 0.65 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = CONFIG.turret.height * 0.5 + 0.21;
    this.root.add(pole);

    // --- Yaw-Pivot auf Säulenspitze
    this.yawPivot.position.y = CONFIG.turret.height + 0.21;
    this.root.add(this.yawPivot);

    // --- Pitch-Pivot
    this.yawPivot.add(this.pitchPivot);

    // --- Gun housing
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.26, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x56697d, metalness: 0.25, roughness: 0.6 })
    );
    housing.position.set(0, 0, 0);
    housing.castShadow = true; housing.receiveShadow = false;
    this.pitchPivot.add(housing);

    // --- Barrel (zeigt nach -Z)
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 1.2, 14),
      new THREE.MeshStandardMaterial({ color: 0x2e3946, metalness: 0.4, roughness: 0.4 })
    );
    barrel.rotation.x = Math.PI * 0.5;  // Zylinder zeigt entlang +Y → kippen
    // Wir möchten -Z als Schussrichtung: packen ein Rohrstück nach vorne:
    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.34, 16),
      new THREE.MeshStandardMaterial({ color: 0x1d242d, metalness: 0.6, roughness: 0.3 })
    );
    // Montieren: Wir bauen ein "BarrelBlock", der am Pitch-Pivot hängt
    const barrelBlock = new THREE.Group();
    // Barrel quer montieren und nach vorne versetzen:
    barrelBlock.add(barrel);
    barrel.position.set(0, 0, -0.6);
    // Muzzle noch weiter nach vorn:
    muzzle.rotation.x = Math.PI * 0.5;
    muzzle.position.set(0, 0, -1.1);
    barrelBlock.add(muzzle);
    this.pitchPivot.add(barrelBlock);

    // Kleiner "Sight" oben drauf
    const sight = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.03, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x93b5ff, emissive: 0x0a1220, metalness: 0.2, roughness: 0.5 })
    );
    sight.position.set(0, 0.15, -0.12);
    this.pitchPivot.add(sight);

    // Crosshair in die Szene (extern adden!)
    this.crosshairRenderEnabled = true;

    // Zielwinkel (gedämpfte Bewegung)
    this._targetYaw = 0;
    this._targetPitch = 0;

    // Hilfsvektoren
    this._fwd = new THREE.Vector3(0, 0, -1);
    this._tmp = new THREE.Vector3();
  }

  addTo(scene) {
    scene.add(this.root);
    scene.add(this.crosshair);
  }

  #makeCrosshair() {
    // Ring als Mesh, doppelseitig, transparent
    const geo = new THREE.RingGeometry(0.25, 0.3, 32);
    const mat = new THREE.MeshBasicMaterial({ color: 0x9bd1ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(geo, mat);

    // Fadenkreuz-Linien
    const lines = new THREE.Group();
    function mkLine(len, thick) {
      const g = new THREE.PlaneGeometry(thick, len);
      const m = new THREE.MeshBasicMaterial({ color: 0x9bd1ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
      return new THREE.Mesh(g, m);
    }
    const L = 0.5, T = 0.04;
    const v = [
      [0,  L/2, 0, 0], [0, -L/2, 0, 0], [ L/2, 0, Math.PI/2, 0], [ -L/2, 0, Math.PI/2, 0]
    ];
    v.forEach(([x,y,rz]) => {
      const p = mkLine(L, T);
      p.position.set(x,y,0);
      p.rotation.z = rz || 0;
      lines.add(p);
    });

    const group = new THREE.Group();
    group.add(ring, lines);
    group.position.set(0, 1.2, -2);
    return group;
  }

  /**
   * Setzt das Ziel anhand einer Welt-Richtung (normalisiert).
   */
  setAimDirection(worldDir) {
    // Yaw um Y-Achse: Winkel zwischen -Z und Projektion auf XZ
    const xzLen = Math.hypot(worldDir.x, worldDir.z);
    const yaw = Math.atan2(worldDir.x, -worldDir.z); // -Z als Forward
    const pitch = Math.atan2(worldDir.y, xzLen);

    this._targetYaw = yaw;
    this._targetPitch = THREE.MathUtils.clamp(pitch, CONFIG.turret.minPitch, CONFIG.turret.maxPitch);
  }

  /**
   * Animiert Rotation gedämpft Richtung Ziel und setzt das Crosshair.
   */
  update(dt, camera) {
    // Dämpfung (kritisch gedämpft-artig, aber simpel)
    const yspd = CONFIG.turret.yawSpeed;
    const pspd = CONFIG.turret.pitchSpeed;

    this.yawPivot.rotation.y = lerpAngle(this.yawPivot.rotation.y, this._targetYaw, 1 - Math.exp(-yspd * dt));
    this.pitchPivot.rotation.x = lerpAngle(this.pitchPivot.rotation.x, this._targetPitch, 1 - Math.exp(-pspd * dt));

    if (this.crosshairRenderEnabled) {
      // Vorwärtsrichtung des Laufs in Weltkoordinaten
      this._fwd.set(0, 0, -1).applyQuaternion(this.pitchPivot.getWorldQuaternion(new THREE.Quaternion()));
      const muzzleWorld = this.pitchPivot.getWorldPosition(new THREE.Vector3());
      // Crosshair-Position "weit vorne"
      this._tmp.copy(this._fwd).multiplyScalar(CONFIG.turret.crosshairDistance).add(muzzleWorld);
      this.crosshair.position.copy(this._tmp);
      // auf die Kamera schauen (lesbares Fadenkreuz)
      if (camera) this.crosshair.lookAt(camera.position);
    }
  }
}

// --- Helpers ---
function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + diff * t;
}
