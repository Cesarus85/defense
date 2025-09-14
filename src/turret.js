import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Turret {
  constructor() {
    this.root = new THREE.Group();
    this.yawPivot = new THREE.Group();
    this.pitchPivot = new THREE.Group();
    this.crosshair = this.#makeCrosshair();

    const baseGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.42, 16);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x394654, metalness: 0.1, roughness: 0.8 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.receiveShadow = true;
    base.position.y = 0.21;
    this.root.add(base);

    const poleGeo = new THREE.CylinderGeometry(0.18, 0.2, CONFIG.turret.height, 12);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x445566, metalness: 0.2, roughness: 0.65 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = CONFIG.turret.height * 0.5 + 0.21;
    this.root.add(pole);

    this.yawPivot.position.y = CONFIG.turret.height + 0.21;
    this.root.add(this.yawPivot);
    this.yawPivot.add(this.pitchPivot);

    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.26, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x56697d, metalness: 0.25, roughness: 0.6 })
    );
    this.pitchPivot.add(housing);

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

    const sight = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.03, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x93b5ff, emissive: 0x0a1220, metalness: 0.2, roughness: 0.5 })
    );
    sight.position.set(0, 0.15, -0.12);
    this.pitchPivot.add(sight);

    this.crosshairRenderEnabled = true;
    this._targetYaw = 0;
    this._targetPitch = 0;

    this._fwd = new THREE.Vector3(0, 0, -1);
    this._tmp = new THREE.Vector3();
  }

  addTo(scene) {
    scene.add(this.root);
    scene.add(this.crosshair);
  }

  #makeCrosshair() {
    const geo = new THREE.RingGeometry(0.25, 0.3, 32);
    const mat = new THREE.MeshBasicMaterial({ color: 0x9bd1ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(geo, mat);

    const lines = new THREE.Group();
    const mkLine = (len, thick) => new THREE.Mesh(
      new THREE.PlaneGeometry(thick, len),
      new THREE.MeshBasicMaterial({ color: 0x9bd1ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    const L = 0.5, T = 0.04;
    [[0, L/2, 0],[0,-L/2,0],[L/2,0,Math.PI/2],[-L/2,0,Math.PI/2]].forEach(([x,y,rz=0])=>{
      const p = mkLine(L,T); p.position.set(x,y,0); p.rotation.z = rz; lines.add(p);
    });

    const group = new THREE.Group();
    group.add(ring, lines);
    group.position.set(0, 1.2, -2);
    return group;
  }

  setAimDirection(worldDir) {
    const xzLen = Math.hypot(worldDir.x, worldDir.z);
    const yaw = Math.atan2(worldDir.x, -worldDir.z);
    const pitch = Math.atan2(worldDir.y, xzLen);
    this._targetYaw = yaw;
    this._targetPitch = THREE.MathUtils.clamp(pitch, CONFIG.turret.minPitch, CONFIG.turret.maxPitch);
  }

  update(dt, camera) {
    const yspd = CONFIG.turret.yawSpeed;
    const pspd = CONFIG.turret.pitchSpeed;
    this.yawPivot.rotation.y = lerpAngle(this.yawPivot.rotation.y, this._targetYaw, 1 - Math.exp(-yspd * dt));
    this.pitchPivot.rotation.x = lerpAngle(this.pitchPivot.rotation.x, this._targetPitch, 1 - Math.exp(-pspd * dt));

    if (this.crosshairRenderEnabled) {
      this._fwd.set(0, 0, -1).applyQuaternion(this.pitchPivot.getWorldQuaternion(new THREE.Quaternion()));
      const muzzleWorld = this.pitchPivot.getWorldPosition(new THREE.Vector3());
      this._tmp.copy(this._fwd).multiplyScalar(CONFIG.turret.crosshairDistance).add(muzzleWorld);
      this.crosshair.position.copy(this._tmp);
      if (camera) this.crosshair.lookAt(camera.position);
    }
  }
}

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + diff * t;
}
