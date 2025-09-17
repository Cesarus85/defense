import * as THREE from 'three';
import { CONFIG } from './config.js';

export class HeatBar3D {
  constructor(scene, turret) {
    this.group = new THREE.Group();
    this.lastCamPos = null;
    const [w,h] = CONFIG.ui.heatBar.size;

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: CONFIG.ui.heatBar.background, transparent: true, opacity: 0.6 })
    );
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: CONFIG.ui.heatBar.fill, transparent: true, opacity: 0.95 })
    );
    fill.position.x = -w/2; fill.scale.x = 0;

    // ❗ UI nicht hittbar
    bg.userData.ignoreHit = true;
    fill.userData.ignoreHit = true;

    this.bg = bg; this.fill = fill;
    this.group.add(bg, fill);
    turret.yawPivot.add(this.group);
    const [ox,oy,oz] = CONFIG.ui.heatBar.offset;
    this.group.position.set(ox, oy, oz);
  }
  setHeat01(v) {
    const cl = THREE.MathUtils.clamp(v, 0, 1);
    this.fill.scale.x = cl;
    this.fill.position.x = -this.bg.geometry.parameters.width/2 + (this.bg.geometry.parameters.width * cl)/2;
    const c = new THREE.Color().setHSL(0.07 + (0.66 - 0.07)*(1-cl), 0.8, 0.55);
    this.fill.material.color.copy(c);
  }
  update(camera) {
    // Weniger aggressives LookAt um Flackern zu reduzieren
    if (camera) {
      const camPos = new THREE.Vector3();
      camera.getWorldPosition(camPos);
      const currentPos = this.group.getWorldPosition(new THREE.Vector3());
      
      // Nur lookAt wenn sich die Kamera deutlich bewegt hat
      const dist = camPos.distanceTo(this.lastCamPos || camPos);
      if (dist > 0.1) {
        this.group.lookAt(camPos);
        this.lastCamPos = camPos.clone();
      }
    }
  }
}

export class BaseHealthBar3D {
  constructor(scene, turret) {
    const defaults = {
      offset: [0.16, 0.18, 0.08],
      size: [0.05, 0.18],
      background: 0x1a1010,
      fill: 0xff6666,
    };
    const cfg = Object.assign({}, defaults, CONFIG.ui?.baseBar ?? {});

    this.group = new THREE.Group();
    this.lastCamPos = null;
    this.maxHP = CONFIG.base?.maxHP ?? 100;
    this.value01 = 1;

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(cfg.size[0], cfg.size[1]),
      new THREE.MeshBasicMaterial({ color: cfg.background, transparent: true, opacity: 0.65 })
    );
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(cfg.size[0], cfg.size[1]),
      new THREE.MeshBasicMaterial({ color: cfg.fill, transparent: true, opacity: 0.95 })
    );

    bg.userData.ignoreHit = true;
    fill.userData.ignoreHit = true;

    this.bg = bg;
    this.fill = fill;
    this.group.add(bg, fill);

    turret.yawPivot.add(this.group);
    const [ox, oy, oz] = cfg.offset;
    this.group.position.set(ox, oy, oz);

    this.setHealth(this.maxHP, this.maxHP);
  }

  setHealth(current, max) {
    this.maxHP = max || this.maxHP;
    const ratio = this.maxHP > 0 ? THREE.MathUtils.clamp(current / this.maxHP, 0, 1) : 0;
    this.value01 = ratio;
    this.fill.scale.y = ratio;
    const h = this.bg.geometry.parameters.height;
    this.fill.position.y = -h / 2 + (h * ratio) / 2;

    const color = new THREE.Color().setHSL(THREE.MathUtils.lerp(0.02, 0.33, ratio), 0.85, 0.54);
    this.fill.material.color.copy(color);
  }

  update(camera) {
    if (!camera) return;

    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const dist = camPos.distanceTo(this.lastCamPos || camPos);
    if (dist > 0.1) {
      this.group.lookAt(camPos);
      this.lastCamPos = camPos.clone();
    }
  }
}
