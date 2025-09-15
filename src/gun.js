// /src/gun.js
import * as THREE from 'three';
import { CONFIG } from './config.js';

export class GunSystem {
  constructor(renderer, scene, camera, turret, audio, muzzleFx, hitFx, heatUI, tracers=null) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.turret = turret;
    this.audio = audio;
    this.muzzleFx = muzzleFx;
    this.hitFx = hitFx;
    this.heatUI = heatUI;
    this.tracers = tracers;

    this.shotInterval = 60 / CONFIG.fire.rpm; // s/shot
    this.timeSinceShot = 0;
    this.heat = 0;
    this.overheated = false;
    this.coolDelay = 0;

    this.raycaster = new THREE.Raycaster();
    this.tmpQ = new THREE.Quaternion();
    this.tmpV = new THREE.Vector3();
    this.tmpUp = new THREE.Vector3(0,1,0);
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();

    // Trigger-Status
    this.trigPressed = [false, false];
    this.controllers = [renderer.xr.getController(0), renderer.xr.getController(1)];
    this.controllers.forEach((c, i) => {
      c.addEventListener('selectstart', ()=>{ this.trigPressed[i] = true; });
      c.addEventListener('selectend',   ()=>{ this.trigPressed[i] = false; });
    });

    // Eigene Geometrien ignorieren
    this.markIgnore(turret.root);
    if (muzzleFx?.sprite) this.markIgnore(muzzleFx.sprite);
  }

  markIgnore(obj) { obj.traverse ? obj.traverse(o => { o.userData.ignoreHit = true; }) : (obj.userData.ignoreHit = true); }
  isFiring() { return this.trigPressed[0] || this.trigPressed[1]; }

  pulseShot() {
    const amp = CONFIG.haptics.shotAmp, ms = CONFIG.haptics.shotMs;
    this.controllers.forEach(c => {
      const h = c?.gamepad?.hapticActuators?.[0];
      if (h?.playEffect) h.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: amp, strongMagnitude: amp });
      else if (h?.pulse) h.pulse(amp, ms);
    });
  }

  getActiveCamera() {
    return this.renderer.xr.isPresenting ? this.renderer.xr.getCamera(this.camera) : this.camera;
  }

  update(dt) {
    this.timeSinceShot += dt;
    if (this.coolDelay > 0) this.coolDelay -= dt;

    // Cooldown/Overheat
    if (this.coolDelay <= 0) {
      this.heat = Math.max(0, this.heat - CONFIG.fire.heatCoolRate * dt);
      if (this.overheated && this.heat <= CONFIG.fire.overheatThreshold * 0.35) {
        this.overheated = false;
      }
    }

    // UI
    this.heatUI?.setHeat01(this.heat / CONFIG.fire.overheatThreshold);

    // Schießen
    if (!this.overheated && this.isFiring() && this.timeSinceShot >= this.shotInterval) {
      this.fireOneShot();
      this.timeSinceShot = 0;
      this.coolDelay = CONFIG.fire.cooldownDelay;
      this.heat += CONFIG.fire.heatPerShot;
      if (this.heat >= CONFIG.fire.overheatThreshold) {
        this.overheated = true;
        this.audio?.playOverheat();
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
    this.raycaster.camera = this.getActiveCamera();

    // Mündung & Grundrichtung
    const pivot = this.turret.pitchPivot;
    const muzzleOffset = CONFIG.fire.muzzleOffset;
    const baseDir = new THREE.Vector3(0,0,-1).applyQuaternion(pivot.getWorldQuaternion(this.tmpQ)).normalize();
    const origin = pivot.getWorldPosition(this.tmpV.set(0,0,0)).add(baseDir.clone().multiplyScalar(muzzleOffset));

    // Aim-Assist (sanfte Korrektur)
    let aimDir = this.applyAimAssist(origin, baseDir.clone());

    // ✨ Ground-Clamp vor dem Spread (verhindert frühe Bodentreffer)
    aimDir = this.applyGroundClamp(origin, aimDir);

    // Spread
    const spreadRad = THREE.MathUtils.degToRad(CONFIG.fire.spreadDeg);
    if (spreadRad > 0) {
      const axis = new THREE.Vector3().crossVectors(aimDir, this.tmpUp).normalize();
      const axis2 = new THREE.Vector3().crossVectors(aimDir, axis).normalize();
      const a = (Math.random()-0.5) * spreadRad;
      const b = (Math.random()-0.5) * spreadRad;
      aimDir.add(axis.multiplyScalar(a)).add(axis2.multiplyScalar(b)).normalize();

      // ✨ Optional: nach dem Spread nochmal leicht clampen
      aimDir = this.applyGroundClamp(origin, aimDir);
    }

    // Raycast
    this.raycaster.ray.origin.copy(origin);
    this.raycaster.ray.direction.copy(aimDir);
    this.raycaster.far = CONFIG.fire.range;

    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    let hit = null;
    for (const h of hits) { if (h.object.userData?.ignoreHit) continue; hit = h; break; }

    // FX/Audio/Haptik
    this.muzzleFx?.trigger(CONFIG.fire.muzzleFlashMs);
    this.audio?.playShot();
    this.pulseShot();

    // Tracer (bis zum Hit oder max Range)
    if (CONFIG.tracer?.enabled && this.tracers) {
      const end = hit ? hit.point : origin.clone().add(aimDir.clone().multiplyScalar(this.raycaster.far));
      this.tracers.spawn(origin, end);
    }

    if (hit) {
      const n = hit.face?.normal
        ? hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
        : aimDir.clone().negate();
      this.hitFx?.spawnAt(hit.point, n);

      const enemy = hit.object.userData?.enemy;
      if (enemy && typeof enemy.takeDamage === 'function') {
        enemy.takeDamage(CONFIG.fire.damage);
      }
    }

    // leichter Rückstoß
    const yawNow = this.turret._targetYaw ?? this.turret.yawPivot.rotation.y;
    const pitchNow = this.turret._targetPitch ?? this.turret.pitchPivot.rotation.x;
    this.turret.setTargetAngles(yawNow, pitchNow - CONFIG.fire.recoilPitch);
  }

  // --- Aim Assist (Magnetismus) ---
  applyAimAssist(origin, dir) {
    const aa = CONFIG.aimAssist || {};
    if (!aa.enabled) return dir;

    const maxDist = aa.maxDistance ?? 120;
    const coneNear = THREE.MathUtils.degToRad(aa.coneNearDeg ?? 6);
    const coneFar  = THREE.MathUtils.degToRad(aa.coneFarDeg  ?? 2);
    const strength = THREE.MathUtils.clamp(aa.snapStrength ?? 0.5, 0, 1);

    let bestTarget = null, bestAng = Infinity, bestVec = null;
    this.scene.traverse(o => {
      const e = o.userData?.enemy;
      if (!e || !e.group) return;
      const center = e.group.getWorldPosition(this.tmpA.set(0,0,0));
      const v = center.clone().sub(origin);
      const dist = v.length();
      if (dist <= 0.001 || dist > maxDist) return;
      v.normalize();
      const ang = Math.acos(THREE.MathUtils.clamp(v.dot(dir), -1, 1));
      const t = THREE.MathUtils.clamp(dist / maxDist, 0, 1);
      const limit = coneNear * (1 - t) + coneFar * t;
      if (ang <= limit && ang < bestAng) { bestAng = ang; bestTarget = e; bestVec = v; }
    });

    if (!bestTarget || !bestVec) return dir;
    return dir.clone().multiplyScalar(1 - strength).add(bestVec.clone().multiplyScalar(strength)).normalize();
  }

  // --- Ground Clamp (verhindert, dass der Boden zu nah getroffen wird) ---
  applyGroundClamp(origin, dir) {
    const ac = CONFIG.aimConstraint || {};
    if (!ac.enabled) return dir;

    const groundY = ac.groundY ?? 0;
    const minDist = ac.minGroundHitDist ?? 0;
    if (minDist <= 0) return dir;

    // Wenn wir nicht nach unten zielen oder Ursprung ~Bodenhöhe, keine Korrektur
    if (dir.y >= -1e-5 || origin.y <= groundY + 1e-4) return dir;

    // Distanz bis zum Boden entlang dir
    const sGround = (groundY - origin.y) / dir.y; // dir.y < 0 → sGround > 0
    if (sGround >= minDist) return dir; // passt schon

    // erforderliche minimale y-Komponente, damit sGround == minDist
    const vyMin = (groundY - origin.y) / Math.max(minDist, 1e-3); // negativ
    const v = dir.clone();
    v.y = Math.max(vyMin, -1e-3); // nie zu steil nach unten
    v.normalize();

    // Begrenze die Korrektur (Tilt) auf ein paar Grad, damit es „unsichtbar“ bleibt
    const maxTilt = THREE.MathUtils.degToRad(ac.tiltUpMaxDeg ?? 6);
    const ang = Math.acos(THREE.MathUtils.clamp(dir.dot(v), -1, 1));
    if (ang <= maxTilt) return v;

    // Sanft zwischen originaler Richtung und geklemmter Richtung interpolieren
    const t = maxTilt / Math.max(ang, 1e-6);
    return dir.clone().multiplyScalar(1 - t).add(v.multiplyScalar(t)).normalize();
  }
}
