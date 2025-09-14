import * as THREE from 'three';
import { CONFIG } from './config.js';

export class GunSystem {
  constructor(renderer, scene, camera, turret, audio, muzzleFx, hitFx, heatUI) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.turret = turret;
    this.audio = audio;
    this.muzzleFx = muzzleFx;
    this.hitFx = hitFx;
    this.heatUI = heatUI;

    this.shotInterval = 60 / CONFIG.fire.rpm; // s/shot
    this.timeSinceShot = 0;
    this.heat = 0;
    this.overheated = false;
    this.coolDelay = 0;

    this.raycaster = new THREE.Raycaster();
    this.tmpQ = new THREE.Quaternion();
    this.tmpV = new THREE.Vector3();
    this.tmpUp = new THREE.Vector3(0,1,0);

    // Trigger-Status von beiden Controllern
    this.trigPressed = [false, false];
    this.controllers = [renderer.xr.getController(0), renderer.xr.getController(1)];
    this.controllers.forEach((c, i) => {
      c.addEventListener('selectstart', ()=>{ this.trigPressed[i] = true; });
      c.addEventListener('selectend',   ()=>{ this.trigPressed[i] = false; });
    });

    // Turret selbst nicht hittbar
    this.markIgnore(turret.root);
  }

  markIgnore(obj) {
    obj.traverse(o => { o.userData.ignoreHit = true; });
  }

  isFiring() {
    return this.trigPressed[0] || this.trigPressed[1];
  }

  pulseShot() {
    const amp = CONFIG.haptics.shotAmp, ms = CONFIG.haptics.shotMs;
    this.controllers.forEach(c => {
      const gp = c?.gamepad;
      const h = gp?.hapticActuators?.[0];
      if (h && h.playEffect) h.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: amp, strongMagnitude: amp });
      else if (h && h.pulse) h.pulse(amp, ms);
    });
  }

  update(dt) {
    this.timeSinceShot += dt;
    if (this.coolDelay > 0) this.coolDelay -= dt;

    // Cooldown / Overheat-Reset
    if (this.coolDelay <= 0) {
      const cool = CONFIG.fire.heatCoolRate * dt;
      this.heat = Math.max(0, this.heat - cool);
      if (this.overheated && this.heat <= CONFIG.fire.overheatThreshold * 0.35) {
        this.overheated = false; // wieder einsatzbereit
      }
    }

    // UI
    if (this.heatUI) this.heatUI.setHeat01(this.heat / CONFIG.fire.overheatThreshold);

    // Schießen
    if (!this.overheated && this.isFiring() && this.timeSinceShot >= this.shotInterval) {
      this.fireOneShot();
      this.timeSinceShot = 0;
      this.coolDelay = CONFIG.fire.cooldownDelay;
      this.heat += CONFIG.fire.heatPerShot;
      if (this.heat >= CONFIG.fire.overheatThreshold) {
        this.overheated = true;
        this.audio?.playOverheat();
        // kräftiges Haptiksignal
        const amp = CONFIG.haptics.overheatAmp, ms = CONFIG.haptics.overheatMs;
        this.controllers.forEach(c=>{
          const h = c?.gamepad?.hapticActuators?.[0];
          if (h?.playEffect) h.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: amp, strongMagnitude: amp });
          else if (h?.pulse) h.pulse(amp, ms);
        });
      }
    }
  }

  fireOneShot() {
    // Mündungs-Pos + Richtung aus Pitch-Pivot ableiten
    const pivot = this.turret.pitchPivot;
    const muzzleOffset = CONFIG.fire.muzzleOffset;
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(pivot.getWorldQuaternion(this.tmpQ)).normalize();
    const origin = pivot.getWorldPosition(this.tmpV.clone()).add(dir.clone().multiplyScalar(muzzleOffset));

    // Spread
    const spreadRad = THREE.MathUtils.degToRad(CONFIG.fire.spreadDeg);
    if (spreadRad > 0) {
      // zufällige kleine Rotation um eine Achse senkrecht zu dir
      const axis = new THREE.Vector3().crossVectors(dir, this.tmpUp).normalize();
      const axis2 = new THREE.Vector3().crossVectors(dir, axis).normalize();
      const a = (Math.random()-0.5) * spreadRad;
      const b = (Math.random()-0.5) * spreadRad;
      dir.add(axis.multiplyScalar(a)).add(axis2.multiplyScalar(b)).normalize();
    }

    // Raycast
    this.raycaster.ray.origin.copy(origin);
    this.raycaster.ray.direction.copy(dir);
    this.raycaster.far = CONFIG.fire.range;

    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    let hit = null;
    for (const h of hits) {
      if (h.object.userData?.ignoreHit) continue; // Turret etc. ignorieren
      hit = h; break;
    }

    // FX + Audio + Rückstoß
    this.muzzleFx?.trigger(CONFIG.fire.muzzleFlashMs);
    this.audio?.playShot();
    this.pulseShot();

    if (hit) {
      this.hitFx?.spawnAt(hit.point, hit.face?.normal || dir.clone().negate());
      // TODO: Schaden später über hit.object.userData?.damageable / callback
    }

    // leichter Rückstoß (Pitch hoch)
    if (typeof this.turret.setTargetAngles === 'function') {
      const yawNow = this.turret._targetYaw ?? this.turret.yawPivot.rotation.y;
      const pitchNow = this.turret._targetPitch ?? this.turret.pitchPivot.rotation.x;
      this.turret.setTargetAngles(yawNow, pitchNow - CONFIG.fire.recoilPitch);
    }
  }
}
