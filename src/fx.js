import * as THREE from 'three';

export class MuzzleFlash {
  constructor(turret, offset = 1.1) {
    this.turret = turret;
    this.life = 0;
    // Einfaches Additive-Sprite
    const tex = makeCircleTexture();
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(0.22, 0.22, 0.22);
    this.offset = offset;
    turret.pitchPivot.add(this.sprite);
    this.sprite.position.set(0, 0, -this.offset);
    this.sprite.visible = false;
  }
  trigger(ms = 40) {
    this.life = ms / 1000; this.sprite.visible = true;
  }
  update(dt, camera) {
    if (this.life > 0) {
      this.life -= dt;
      this.sprite.material.opacity = Math.max(0, this.life * 5);
      if (camera) this.sprite.lookAt(camera.position);
      if (this.life <= 0) this.sprite.visible = false;
    }
  }
}

export class HitSparks {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
  }
  spawnAt(point, normal) {
    const s = this.pool.pop() || makeSpark();
    s.position.copy(point);
    s.lookAt(point.clone().add(normal));
    s.userData.life = 0.08;
    s.material.opacity = 0.9;
    this.scene.add(s);
    this.active.push(s);
  }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      s.userData.life -= dt;
      s.material.opacity = Math.max(0, s.userData.life * 8);
      if (s.userData.life <= 0) {
        this.scene.remove(s); this.active.splice(i, 1); this.pool.push(s);
      }
    }
  }
}

// helpers
function makeSpark() {
  const tex = makeCircleTexture(128, 0xffddaa);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(0.15, 0.15, 0.15);
  return spr;
}

function makeCircleTexture(size = 128, hex = 0xffcc88) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  const col = (h,a)=>`rgba(${(h>>16)&255},${(h>>8)&255},${h&255},${a})`;
  g.addColorStop(0, col(hex, 1));
  g.addColorStop(1, col(0x000000, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(size/2, size/2, size/2, 0, Math.PI*2); ctx.fill();
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
