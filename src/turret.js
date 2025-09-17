// /src/turret.js
// Turret-Geometrie mit umschaltbaren Griffen + deutlich sichtbarem Fadenkreuz.
// Steuerungs-API bleibt: setAimDirection(dir), setTargetAngles(yaw,pitch), update(dt,camera)

import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Turret {
  constructor() {
    this.root = new THREE.Group();
    this.yawPivot = new THREE.Group();
    this.pitchPivot = new THREE.Group();
    this.crosshair = this.#makeCrosshair();

    // Base
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, 0.42, 16),
      new THREE.MeshStandardMaterial({ color: 0x394654, metalness: 0.1, roughness: 0.8 })
    );
    base.position.y = 0.21; base.receiveShadow = true;
    this.root.add(base);

    // Säule
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.2, CONFIG.turret.height, 12),
      new THREE.MeshStandardMaterial({ color: 0x445566, metalness: 0.2, roughness: 0.65 })
    );
    pole.position.y = CONFIG.turret.height * 0.5 + 0.21;
    this.root.add(pole);

    // Pivots
    this.yawPivot.position.y = CONFIG.turret.height + 0.21;
    this.root.add(this.yawPivot);
    this.yawPivot.add(this.pitchPivot);

    // Housing
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.26, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x56697d, metalness: 0.25, roughness: 0.6 })
    );
    this.pitchPivot.add(housing);

    // Barrel (zeigt nach -Z)
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 1.2, 14),
      new THREE.MeshStandardMaterial({ color: 0x2e3946, metalness: 0.4, roughness: 0.4 })
    );
    barrel.rotation.x = Math.PI * 0.5;
    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.34, 16),
      new THREE.MeshStandardMaterial({ color: 0x1d242d, metalness: 0.6, roughness: 0.3 })
    );
    muzzle.rotation.x = Math.PI * 0.5;

    const barrelBlock = new THREE.Group();
    barrel.position.set(0, 0, -0.6);
    muzzle.position.set(0, 0, -1.1);
    barrelBlock.add(barrel, muzzle);
    this.pitchPivot.add(barrelBlock);

    // Sight
    const sight = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.03, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x93b5ff, emissive: 0x0a1220, metalness: 0.2, roughness: 0.5 })
    );
    sight.position.set(0, 0.15, -0.12);
    this.pitchPivot.add(sight);

    // Griffe (umschaltbar über CONFIG.grips.mode)
    this.#buildHandles(housing);

    // Crosshair
    this.crosshairRenderEnabled = true;

    // Zielwinkel
    this._targetYaw = 0;
    this._targetPitch = 0;

    // Ergonomie-Gesamtscale
    this.root.scale.setScalar(0.85);
  }

  addTo(scene) {
    scene.add(this.root);
    scene.add(this.crosshair);
  }

  #makeCrosshair() {
    const g = new THREE.Group();

    const cfg = CONFIG.turret.crosshair || {};
    const size = cfg.size ?? 0.6;
    const thick = cfg.thickness ?? 0.10;

    const inner = Math.max(0.0001, (size - thick) * 0.5);
    const outer = (size * 0.5);

    // Ring + zarte Outline (gut sichtbar)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 48),
      new THREE.MeshBasicMaterial({ color: cfg.color ?? 0x9bd1ff, transparent: true, opacity: cfg.opacity ?? 0.95, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    );
    const outline = new THREE.Mesh(
      new THREE.RingGeometry(inner*1.05, outer*1.05, 48),
      new THREE.MeshBasicMaterial({ color: 0x001020, transparent: true, opacity: cfg.outlineOpacity ?? 0.35, depthWrite: false, side: THREE.DoubleSide })
    );

    // Center-Dot
    const dotSize = (cfg.centerDot ?? 0.06);
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(dotSize*0.5, 24),
      new THREE.MeshBasicMaterial({ color: cfg.color ?? 0x9bd1ff, transparent: true, opacity: cfg.opacity ?? 0.95, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    );

    [ring, outline, dot].forEach(m => m.userData.ignoreHit = true); // nicht hittbar
    g.add(outline, ring, dot);
    g.position.set(0, 1.2, -2);
    return g;
  }

  #buildHandles(housing) {
    const gripsCfg = CONFIG.grips || { mode: 'front-horizontal', front: {}, side: {}, color: 0x8899aa };
    const mat = new THREE.MeshStandardMaterial({ color: gripsCfg.color ?? 0x8899aa, metalness: 0.3, roughness: 0.5, emissive: 0x000000 });

    const makeBracket = (w=0.06,h=0.04,d=0.10) =>
      new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
        new THREE.MeshStandardMaterial({ color: 0x5a6b7d, metalness: 0.25, roughness: 0.6 }));

    if (gripsCfg.mode === 'side-vertical') {
      const g = gripsCfg.side || {};
      const r = g.radius ?? 0.03;
      const len = g.length ?? 0.16;
      const spread = g.spread ?? 0.28;
      const forward = g.forward ?? 0.10;
      const height = g.height ?? 0.02;
      const tiltIn = THREE.MathUtils.degToRad(g.tiltInDeg ?? 12);

      // Vertikale Griffe (Achse Y)
      const geo = new THREE.CylinderGeometry(r, r, len, 18);
      this.leftHandle  = new THREE.Mesh(geo, mat.clone());
      this.rightHandle = new THREE.Mesh(geo, mat.clone());

      this.leftHandle.position.set(-spread, height, forward);
      this.rightHandle.position.set(+spread, height, forward);

      this.leftHandle.rotation.x = tiltIn;
      this.rightHandle.rotation.x = tiltIn;

      const bracketDepth = Math.abs(forward) + 0.06;
      const lBracket = makeBracket(0.04, 0.04, bracketDepth);
      const rBracket = lBracket.clone();
      lBracket.position.set(-spread, height, forward*0.5);
      rBracket.position.set(+spread, height, forward*0.5);

      this.pitchPivot.add(this.leftHandle, this.rightHandle, lBracket, rBracket);

    } else {
      // Standard: front-horizontal
      const g = gripsCfg.front || {};
      const r = g.radius ?? 0.03;
      const len = g.length ?? 0.16;
      const spread = g.spread ?? 0.22;
      const forward = g.forward ?? 0.26;
      const height = g.height ?? 0.02;
      const roll = THREE.MathUtils.degToRad(g.rollDeg ?? 90);

      const geo = new THREE.CylinderGeometry(r, r, len, 16);
      this.leftHandle  = new THREE.Mesh(geo, mat.clone());
      this.rightHandle = new THREE.Mesh(geo, mat.clone());

      this.leftHandle.rotation.z = roll;
      this.rightHandle.rotation.z = roll;

      this.leftHandle.position.set(-spread, height, forward);
      this.rightHandle.position.set(+spread, height, forward);

      const lBracket = makeBracket(0.05, 0.04, forward + 0.04);
      const rBracket = lBracket.clone();
      lBracket.position.set(-spread, height, forward * 0.5);
      rBracket.position.set(+spread, height, forward * 0.5);

      this.pitchPivot.add(this.leftHandle, this.rightHandle, lBracket, rBracket);
    }
  }

  // Steuerungs-API (unverändert)
  setAimDirection(worldDir) {
    const xzLen = Math.hypot(worldDir.x, worldDir.z);
    let yaw   = Math.atan2(worldDir.x, -worldDir.z);
    let pitch = Math.atan2(worldDir.y, xzLen);

    if (CONFIG.turret.invertYaw)   yaw = -yaw;
    if (CONFIG.turret.invertPitch) pitch = -pitch;

    this.setTargetAngles(yaw, pitch);
  }

  setTargetAngles(yaw, pitch) {
    const p = THREE.MathUtils.clamp(pitch, CONFIG.turret.minPitch, CONFIG.turret.maxPitch);
    this._targetYaw = yaw;
    this._targetPitch = p;
  }

  update(dt, camera) {
    const yspd = CONFIG.turret.yawSpeed;
    const pspd = CONFIG.turret.pitchSpeed;
    this.yawPivot.rotation.y   = lerpAngle(this.yawPivot.rotation.y,   this._targetYaw,   1 - Math.exp(-yspd * dt));
    this.pitchPivot.rotation.x = lerpAngle(this.pitchPivot.rotation.x, this._targetPitch, 1 - Math.exp(-pspd * dt));

    // Crosshair anvisieren & zur Kamera drehen (billboard)
    if (this.crosshairRenderEnabled) {
      const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(this.pitchPivot.getWorldQuaternion(new THREE.Quaternion()));
      const muzzleWorld = this.pitchPivot.getWorldPosition(new THREE.Vector3());
      const p = fwd.multiplyScalar(CONFIG.turret.crosshairDistance).add(muzzleWorld);
      this.crosshair.position.copy(p);
      if (camera) this.crosshair.lookAt(camera.position);
    }
  }
}

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + diff * t;
}
