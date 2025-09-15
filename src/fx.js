// /src/fx.js
// FX: Mündungsfeuer, Einschlagsfunken, Tracer und 3D-GameOver-Banner

import * as THREE from 'three';
import { CONFIG } from './config.js';

export class MuzzleFlash {
  constructor(turret, offset = 1.1) {
    this.turret = turret;
    this.life = 0;

    const tex = makeCircleTexture(); // weiches Leuchten
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(0.22, 0.22, 0.22);
    this.sprite.userData.ignoreHit = true; // nicht hittbar
    this.offset = offset;

    turret.pitchPivot.add(this.sprite);
    this.sprite.position.set(0, 0, -this.offset);
    this.sprite.visible = false;
  }

  trigger(ms = 40) {
    this.life = ms / 1000;
    this.sprite.visible = true;
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
        this.scene.remove(s);
        this.active.splice(i, 1);
        this.pool.push(s);
      }
    }
  }
}

export class TracerPool {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
  }

  spawn(start, end) {
    const len = start.distanceTo(end);
    if (len <= 0.001) return;

    const dir = end.clone().sub(start).normalize();

    const m = this.pool.pop() || this._makeTracerMesh();
    m.scale.set(1, len, 1); // Geometrie entlang Y
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    m.position.copy(start).addScaledVector(dir, len * 0.5);
    m.material.opacity = (CONFIG.tracer.opacity ?? 0.9);
    m.userData.life = (CONFIG.tracer.lifeMs ?? 80) / 1000;

    this.scene.add(m);
    this.active.push(m);
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const m = this.active[i];
      m.userData.life -= dt;
      m.material.opacity = Math.max(0, m.userData.life * 6);
      if (m.userData.life <= 0) {
        this.scene.remove(m);
        this.active.splice(i, 1);
        this.pool.push(m);
      }
    }
  }

  _makeTracerMesh() {
    const r = CONFIG.tracer.radius ?? 0.012;
    const geo = new THREE.CylinderGeometry(r, r, 1, 8, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: CONFIG.tracer.color ?? 0x9bd1ff,
      transparent: true,
      opacity: CONFIG.tracer.opacity ?? 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const m = new THREE.Mesh(geo, mat);
    m.userData.ignoreHit = true; // nicht raycastbar
    return m;
  }
}

// == 3D GameOver-Banner =========================================
export class GameOverBanner3D {
  constructor(scene) {
    this.scene = scene;
    const cfg = (CONFIG.ui3d && CONFIG.ui3d.gameOver) || {};
    this.distance = cfg.distance ?? 2.5; // Meter vor der Kamera
    this.width    = cfg.width ?? 2.0;    // Breite (m)
    this.bg       = cfg.bg ?? 'rgba(10,16,24,0.85)';
    this.titleCol = cfg.titleColor ?? '#ff4d5a';
    this.subCol   = cfg.subColor ?? '#cfe7ff';

    // Canvas → Texture
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 384;
    this.ctx = this.canvas.getContext('2d');
    this._draw();

    const tex = new THREE.CanvasTexture(this.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.tex = tex;

    const aspect = this.canvas.height / this.canvas.width;
    const height = this.width * aspect;

    const geo = new THREE.PlaneGeometry(this.width, height);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false // immer sichtbar
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 999;
    this.scene.add(this.mesh);

    // Simple Show/Hide-Animation
    this.visible = false;
    this.alpha = 0;
    this.scale = 0.85;
    this.mesh.scale.setScalar(this.scale);
  }

  _roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  _draw() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Hintergrund
    ctx.fillStyle = this.bg;
    this._roundRect(ctx, 24, 24, W - 48, H - 48, 28);
    ctx.fill();

    // Titel
    ctx.fillStyle = this.titleCol;
    ctx.font = 'bold 140px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 12;
    ctx.fillText('GAME OVER', W / 2, H / 2 - 20);

    // Subtext
    ctx.shadowBlur = 0;
    ctx.fillStyle = this.subCol;
    ctx.font = '500 40px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillText('Drücke „Restart“ im Overlay oder rufe das Menü auf', W / 2, H / 2 + 72);

    if (this.tex) this.tex.needsUpdate = true;
  }

  show(camera) {
    this.visible = true;
    this.alpha = 0;
    this.scale = 0.85;
    this.mesh.visible = true;
    this._reposition(camera);
  }

  hide() {
    this.visible = false;
    this.mesh.visible = false;
  }

  _reposition(camera) {
    if (!camera) return;
    const camPos = new THREE.Vector3(); camera.getWorldPosition(camPos);
    const camQuat = new THREE.Quaternion(); camera.getWorldQuaternion(camQuat);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat).normalize();
    const up  = new THREE.Vector3(0, 1, 0).applyQuaternion(camQuat).normalize();

    const pos = camPos.clone().addScaledVector(fwd, this.distance).addScaledVector(up, 0.15);
    this.mesh.position.copy(pos);
    this.mesh.quaternion.copy(camQuat); // Billboard
  }

  update(camera, dt = 0.016) {
    if (!this.mesh.visible) return;

    // Follow & Billboard
    this._reposition(camera);

    // Fade/Scale-In
    if (this.visible) {
      this.alpha = Math.min(1, this.alpha + dt * 3);
      this.scale = Math.min(1, this.scale + dt * 2);
    } else {
      this.alpha = Math.max(0, this.alpha - dt * 3);
      this.scale = Math.max(0.85, this.scale - dt * 2);
      if (this.alpha <= 0) this.mesh.visible = false;
    }

    this.mesh.material.opacity = this.alpha;
    this.mesh.scale.setScalar(this.scale);
  }
}

// ===== helpers =================================================

function makeSpark() {
  const tex = makeCircleTexture(128, 0xffddaa);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(0.15, 0.15, 0.15);
  spr.userData.ignoreHit = true; // nicht hittbar
  return spr;
}

function makeCircleTexture(size = 128, hex = 0xffcc88) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const col = (h, a) => `rgba(${(h >> 16) & 255},${(h >> 8) & 255},${h & 255},${a})`;
  g.addColorStop(0, col(hex, 1));
  g.addColorStop(1, col(0x000000, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}


// == 3D Killfeed (STEP 5) =======================================
export class Killfeed3D {
  constructor(scene) {
    this.scene = scene;
    this.items = []; // {mesh, life, maxLife}
    this.offset = new THREE.Vector3(-0.6, -0.6, -1.5); // relativ zur Kamera (links unten)
  }

  _makeTextPlane(text) {
    const pad = 12;
    const font = 'bold 28px system-ui, sans-serif';
    const tmp = document.createElement('canvas');
    const ctx = tmp.getContext('2d');
    ctx.font = font;
    const tw = Math.ceil(ctx.measureText(text).width) + pad*2;
    const th = 44;

    const c = document.createElement('canvas'); c.width = tw; c.height = th;
    const g = c.getContext('2d');
    // BG
    g.fillStyle = 'rgba(10,16,24,0.78)';
    g.fillRect(0,0,tw,th);
    g.strokeStyle = 'rgba(160,200,255,0.25)';
    g.strokeRect(0.5,0.5,tw-1,th-1);
    // Text
    g.font = font;
    g.fillStyle = '#d9f0ff';
    g.textBaseline = 'middle';
    g.fillText(text, pad, th/2);

    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false });
    const geo = new THREE.PlaneGeometry(tw/220, th/220);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.ignoreHit = true;
    mesh.visible = true;
    return mesh;
  }

  push(text, life=1.8) {
    const mesh = this._makeTextPlane(text);
    this.scene.add(mesh);
    this.items.unshift({ mesh, life, maxLife: life });
    // Max 5 items
    if (this.items.length > 5) {
      const old = this.items.pop();
      this.scene.remove(old.mesh);
    }
  }

  update(camera, dt=0.016) {
    if (!camera) return;
    // Position items relativ zur Kamera und staple sie nach oben
    const camPos = new THREE.Vector3(); camera.getWorldPosition(camPos);
    const camQuat = new THREE.Quaternion(); camera.getWorldQuaternion(camQuat);
    const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(camQuat);
    const right = new THREE.Vector3(1,0,0).applyQuaternion(camQuat);
    const up = new THREE.Vector3(0,1,0).applyQuaternion(camQuat);

    for (let i=0;i<this.items.length;i++) {
      const it = this.items[i];
      const base = camPos.clone()
        .addScaledVector(fwd, Math.abs(this.offset.z))
        .addScaledVector(right, this.offset.x)
        .addScaledVector(up, this.offset.y + i*0.18);
      it.mesh.position.copy(base);
      it.mesh.quaternion.copy(camQuat);

      // Fade
      it.life -= dt;
      const a = THREE.MathUtils.clamp(it.life / it.maxLife, 0, 1);
      it.mesh.material.opacity = a;
    }
    // Remove dead
    for (let i=this.items.length-1;i>=0;i--) {
      if (this.items[i].life<=0) {
        this.scene.remove(this.items[i].mesh);
        this.items.splice(i,1);
      }
    }
  }
}
