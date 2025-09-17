// /src/fx.js
// FX: Mündungsfeuer, Einschlagsfunken, Tracer und 3D-GameOver-Banner

import * as THREE from 'three';
import { CONFIG } from './config.js';

export class MuzzleFlash {
  constructor(turret, offset = 1.1) {
    this.turret = turret;
    this.life = 0;
    this.maxLife = 0;

    // Mehrere Ebenen für reichhaltigeren Effekt
    this.group = new THREE.Group();

    // Haupt-Flash
    const mainTex = makeCircleTexture();
    const mainMat = new THREE.SpriteMaterial({
      map: mainTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xffffff
    });
    this.mainSprite = new THREE.Sprite(mainMat);
    this.mainSprite.scale.set(0.3, 0.3, 0.3);

    // Sekundärer Flash (größer, schwächer)
    const secondaryMat = new THREE.SpriteMaterial({
      map: mainTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xffaa44
    });
    this.secondarySprite = new THREE.Sprite(secondaryMat);
    this.secondarySprite.scale.set(0.5, 0.5, 0.5);

    // Ring-Effekt
    const ringTex = makeCircleTexture(64, 0x88ddff);
    const ringMat = new THREE.SpriteMaterial({
      map: ringTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0x88ddff
    });
    this.ringSprite = new THREE.Sprite(ringMat);
    this.ringSprite.scale.set(0.4, 0.4, 0.4);

    this.group.add(this.mainSprite, this.secondarySprite, this.ringSprite);
    this.group.userData.ignoreHit = true;
    this.offset = offset;

    turret.pitchPivot.add(this.group);
    this.group.position.set(0, 0, -this.offset);
    this.group.visible = false;
  }

  trigger(ms = 40) {
    this.life = ms / 1000;
    this.maxLife = this.life;
    this.group.visible = true;

    // Zufällige Rotation für Variation
    this.group.rotation.z = Math.random() * Math.PI * 2;
  }

  update(dt, camera) {
    if (this.life > 0) {
      this.life -= dt;
      const progress = 1 - (this.life / this.maxLife);

      // Verschiedene Fade-Kurven für die Sprites
      this.mainSprite.material.opacity = Math.max(0, this.life * 8);
      this.secondarySprite.material.opacity = Math.max(0, this.life * 4);
      this.ringSprite.material.opacity = Math.max(0, (this.life * 3) * (1 - progress * 0.5));

      // Größen-Animation
      const scaleMain = 0.3 + progress * 0.1;
      const scaleSecondary = 0.5 + progress * 0.2;
      const scaleRing = 0.4 + progress * 0.3;

      this.mainSprite.scale.setScalar(scaleMain);
      this.secondarySprite.scale.setScalar(scaleSecondary);
      this.ringSprite.scale.setScalar(scaleRing);

      if (camera) {
        this.mainSprite.lookAt(camera.position);
        this.secondarySprite.lookAt(camera.position);
        this.ringSprite.lookAt(camera.position);
      }

      if (this.life <= 0) this.group.visible = false;
    }
  }
}

export class HitSparks {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
  }

  spawnAt(point, normal, intensity = 1.0) {
    // Mehr Funken basierend auf Intensität
    const sparkCount = Math.floor(5 + intensity * 8);

    for (let i = 0; i < sparkCount; i++) {
      const s = this.pool.pop() || makeSpark();

      // Zufällige Streuung
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4
      );
      s.position.copy(point).add(offset);

      // Verschiedene Größen basierend auf Intensität
      const scale = (0.15 + Math.random() * 0.3) * intensity;
      s.scale.setScalar(scale);

      // Zufällige Richtung basierend auf Normal
      const randomDir = normal.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        Math.random() * 0.8,  // Bevorzugt nach oben
        (Math.random() - 0.5) * 1.2
      )).normalize();
      s.lookAt(point.clone().add(randomDir));

      s.userData.life = 0.08 + Math.random() * 0.15;
      s.userData.velocity = randomDir.multiplyScalar(3 + Math.random() * 5);
      s.userData.gravity = -12;
      s.material.opacity = 0.95;

      // Zufällige Farb-Variation
      const colors = [0xffaa44, 0xff6644, 0xffdd88, 0xff8822];
      s.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);

      this.scene.add(s);
      this.active.push(s);
    }
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      s.userData.life -= dt;
      
      // Physik-Simulation für Funken
      if (s.userData.velocity) {
        s.position.addScaledVector(s.userData.velocity, dt);
        s.userData.velocity.y += s.userData.gravity * dt;
        s.userData.velocity.multiplyScalar(0.95); // Luftwiderstand
      }
      
      s.material.opacity = Math.max(0, s.userData.life * 12);
      
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
    this.buttonRect = {
      x: this.canvas.width * 0.5 - 190,
      y: this.canvas.height * 0.75,  // Weiter nach unten verschoben
      w: 380,
      h: 80  // Etwas kleiner
    };
    this._draw();

    const tex = new THREE.CanvasTexture(this.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.tex = tex;

    const aspect = this.canvas.height / this.canvas.width;
    const height = this.width * aspect;
    this.panelHeight = height;

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

    const btnGeo = new THREE.PlaneGeometry(1, 1);
    const btnMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,  // Vollständig unsichtbar
      depthWrite: false,
      depthTest: false,
      visible: false  // Material unsichtbar machen
    });
    this.buttonMesh = new THREE.Mesh(btnGeo, btnMat);
    this.buttonMesh.renderOrder = this.mesh.renderOrder + 1;
    this.buttonMesh.userData = {
      ignoreHit: false,
      interactive: true,
      action: 'exit-vr',
      collider: 'plane'
    };
    this.buttonMesh.visible = false;
    this.mesh.add(this.buttonMesh);

    this.interactiveMeshes = [this.buttonMesh];
    this._updateButtonLayout(height);

    // Simple Show/Hide-Animation
    this.visible = false;
    this.alpha = 0;
    this.scale = 0.85;
    this.mesh.scale.setScalar(this.scale);

    // Hover-Effekt für Button
    this.buttonHovered = false;
    this.buttonHoverAlpha = 0;
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
    ctx.fillText('GAME OVER', W / 2, H * 0.35);  // Weiter nach oben

    // Subtext
    ctx.shadowBlur = 0;
    ctx.fillStyle = this.subCol;
    ctx.font = '500 32px system-ui, -apple-system, Segoe UI, Roboto, Arial';  // Etwas kleiner
    ctx.fillText('Drücke „Restart" im Overlay oder beende VR', W / 2, H * 0.5);

    // VR Exit Button Hinweis
    const rect = this.buttonRect;
    ctx.fillStyle = 'rgba(42,102,255,0.95)';
    this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 24);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 6;
    this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 24);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 48px system-ui, -apple-system, Segoe UI, Roboto, Arial';  // Etwas kleiner
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VR beenden', rect.x + rect.w / 2, rect.y + rect.h / 2);

    if (this.tex) this.tex.needsUpdate = true;
  }

  show(camera) {
    this.visible = true;
    this.alpha = 0;
    this.scale = 0.85;
    this.mesh.visible = true;
    this.buttonMesh.visible = true;
    this._reposition(camera);
  }

  hide() {
    this.visible = false;
    this.mesh.visible = false;
    this.buttonMesh.visible = false;
  }

  _reposition(camera) {
    if (!camera) return;

    const sourceCamera = (camera.isArrayCamera && camera.cameras && camera.cameras.length > 0)
      ? camera.cameras[0]
      : camera;

    const camPos = new THREE.Vector3(); sourceCamera.getWorldPosition(camPos);
    const camQuat = new THREE.Quaternion(); sourceCamera.getWorldQuaternion(camQuat);
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

    // Hover-Effekt Animation
    if (this.buttonHovered) {
      this.buttonHoverAlpha = Math.min(0.3, this.buttonHoverAlpha + dt * 8);
    } else {
      this.buttonHoverAlpha = Math.max(0, this.buttonHoverAlpha - dt * 6);
    }

    this.mesh.material.opacity = this.alpha;
    this.mesh.scale.setScalar(this.scale);
    if (this.buttonMesh) {
      // Button mit Hover-Effekt
      this.buttonMesh.material.opacity = this.buttonHoverAlpha;
      this.buttonMesh.material.color.setHex(this.buttonHovered ? 0x4488ff : 0x2a66ff);
      this.buttonMesh.visible = this.mesh.visible;
    }
  }

  setButtonHover(hovered) {
    this.buttonHovered = hovered;
  }

  _updateButtonLayout(height) {
    if (!this.buttonMesh) return;
    const rect = this.buttonRect;
    const worldWidth = this.width * (rect.w / this.canvas.width);
    const worldHeight = height * (rect.h / this.canvas.height);

    // Korrekte Positionierung: Button sollte sichtbar unterhalb des Texts sein
    const centerX = (rect.x + rect.w * 0.5) / this.canvas.width - 0.5;
    const centerY = -((rect.y + rect.h * 0.5) / this.canvas.height - 0.5);  // Y-Koordinate korrigiert

    this.buttonMesh.scale.set(worldWidth, worldHeight, 1);
    this.buttonMesh.position.set(centerX * this.width, centerY * height, 0.01);
  }

  getInteractiveMeshes() {
    return this.interactiveMeshes;
  }

  isInteractive() {
    return this.mesh.visible && this.alpha > 0.05;
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
// == Explosionseffekte =========================================
export class ExplosionEffects {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
  }

  createExplosion(position, size = 1.0, color = 0xff6600) {
    // Haupt-Explosions-Sprite
    const explosion = this.pool.pop() || this._makeExplosionSprite();
    explosion.position.copy(position);
    explosion.scale.setScalar(0.1);
    explosion.material.color.setHex(color);
    explosion.material.opacity = 1.0;
    explosion.userData.life = 0.3;
    explosion.userData.maxLife = 0.3;
    explosion.userData.targetScale = size;
    
    this.scene.add(explosion);
    this.active.push(explosion);

    // Rauch-Partikel
    for (let i = 0; i < 8; i++) {
      const smoke = this._makeSmokeParticle();
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 2,
        (Math.random() - 0.5) * 2
      );
      smoke.position.copy(position).add(offset);
      smoke.userData.velocity = offset.normalize().multiplyScalar(3 + Math.random() * 2);
      smoke.userData.life = 1.0 + Math.random() * 0.5;
      smoke.userData.maxLife = smoke.userData.life;
      
      this.scene.add(smoke);
      this.active.push(smoke);
    }
  }

  _makeExplosionSprite() {
    const texture = makeCircleTexture(256, 0xff6600);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const sprite = new THREE.Sprite(material);
    sprite.userData.ignoreHit = true;
    sprite.userData.type = 'explosion';
    return sprite;
  }

  _makeSmokeParticle() {
    const texture = makeCircleTexture(128, 0x666666);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.4
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(0.3);
    sprite.userData.ignoreHit = true;
    sprite.userData.type = 'smoke';
    return sprite;
  }

  update(dt, camera) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.userData.life -= dt;
      
      if (p.userData.type === 'explosion') {
        // Explosion wächst und verblasst
        const progress = 1 - (p.userData.life / p.userData.maxLife);
        const scale = progress * p.userData.targetScale;
        p.scale.setScalar(scale);
        p.material.opacity = 1 - progress;
        
        if (camera) p.lookAt(camera.position);
      } else if (p.userData.type === 'smoke') {
        // Rauch steigt auf und verblasst
        if (p.userData.velocity) {
          p.position.addScaledVector(p.userData.velocity, dt);
          p.userData.velocity.multiplyScalar(0.98);
          p.userData.velocity.y += 1 * dt; // nach oben treiben
        }
        
        const progress = 1 - (p.userData.life / p.userData.maxLife);
        p.scale.setScalar(0.3 + progress * 0.7);
        p.material.opacity = 0.4 * (1 - progress);
        
        if (camera) p.lookAt(camera.position);
      }
      
      if (p.userData.life <= 0) {
        this.scene.remove(p);
        this.active.splice(i, 1);
        this.pool.push(p);
      }
    }
  }
}

// == Spawn-Effekte für Gegner ===================================
export class SpawnEffects {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
  }

  createSpawnEffect(position, enemyType = 'grunt') {
    // Teleportations-Ring
    const ring = this.pool.pop() || this._makeSpawnRing();
    ring.position.copy(position);
    ring.position.y += 0.1;
    ring.scale.setScalar(0.1);
    ring.rotation.x = -Math.PI / 2; // Flach auf dem Boden
    
    // Farbe je nach Gegnertyp
    let color = 0x66aaff;
    switch(enemyType) {
      case 'fast': color = 0x66ff66; break;
      case 'heavy': color = 0xff6666; break;
    }
    ring.material.color.setHex(color);
    // Ring Material hat kein emissive property, da es MeshBasicMaterial ist
    
    ring.userData.life = 0.5;
    ring.userData.maxLife = 0.5;
    ring.userData.targetScale = enemyType === 'heavy' ? 2.5 : (enemyType === 'fast' ? 1.8 : 2.0);
    
    this.scene.add(ring);
    this.active.push(ring);

    // Partikel-Säule
    for (let i = 0; i < 12; i++) {
      const particle = this._makeSpawnParticle();
      particle.position.copy(position);
      particle.position.y += Math.random() * 3;
      particle.position.x += (Math.random() - 0.5) * 0.8;
      particle.position.z += (Math.random() - 0.5) * 0.8;
      
      particle.material.color.setHex(color);
      particle.userData.velocity = new THREE.Vector3(0, 2 + Math.random() * 3, 0);
      particle.userData.life = 0.8 + Math.random() * 0.4;
      particle.userData.maxLife = particle.userData.life;
      
      this.scene.add(particle);
      this.active.push(particle);
    }
  }

  _makeSpawnRing() {
    const geometry = new THREE.RingGeometry(0.8, 1.2, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0x66aaff,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.userData.ignoreHit = true;
    ring.userData.type = 'spawn_ring';
    return ring;
  }

  _makeSpawnParticle() {
    const texture = makeCircleTexture(64, 0x66aaff);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(0.2);
    sprite.userData.ignoreHit = true;
    sprite.userData.type = 'spawn_particle';
    return sprite;
  }

  update(dt, camera) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const effect = this.active[i];
      effect.userData.life -= dt;
      
      if (effect.userData.type === 'spawn_ring') {
        // Ring wächst und verblasst
        const progress = 1 - (effect.userData.life / effect.userData.maxLife);
        const scale = progress * effect.userData.targetScale;
        effect.scale.setScalar(scale);
        effect.material.opacity = 0.8 * (1 - progress);
        
        // Langsame Rotation
        effect.rotation.z += dt * 2;
      } else if (effect.userData.type === 'spawn_particle') {
        // Partikel steigen auf
        if (effect.userData.velocity) {
          effect.position.addScaledVector(effect.userData.velocity, dt);
          effect.userData.velocity.multiplyScalar(0.96); // Abbremsen
        }
        
        const progress = 1 - (effect.userData.life / effect.userData.maxLife);
        effect.material.opacity = 1 - progress;
        
        if (camera) effect.lookAt(camera.position);
      }
      
      if (effect.userData.life <= 0) {
        this.scene.remove(effect);
        this.active.splice(i, 1);
        this.pool.push(effect);
      }
    }
  }
}

// == 3D Score Display ===========================================
export class ScoreDisplay3D {
  constructor(scene, turret) {
    this.scene = scene;
    this.turret = turret;
    this.group = new THREE.Group();
    this.mesh = null;
    this.score = 0;
    this.wave = 1;
    this.enemies = 0;
    this.lastCamPos = null;
    
    // Am Turret befestigen, flach auf der Oberseite
    this.turret.yawPivot.add(this.group);
    this.group.position.set(0, 0.14, 0.10); // 5cm zurück, weg vom Kanonenlauf
    this.group.rotation.x = -Math.PI / 2; // Komplett flach (90° nach unten)
  }

  updateScore(score, wave, enemies) {
    this.score = score;
    this.wave = wave;
    this.enemies = enemies;
    this._updateText();
  }

  _updateText() {
    if (this.mesh) {
      this.group.remove(this.mesh);
    }

    const text = `Score: ${this.score}\nWave: ${this.wave}\nEnemies: ${this.enemies}`;
    this.mesh = this._makeTextPlane(text);
    this.mesh.visible = true; // Sicherstellen, dass es sichtbar ist
    this.group.add(this.mesh); // Zur Gruppe hinzufügen, nicht direkt zur Szene
    console.log('Score UI updated:', text); // Debug
  }

  _makeTextPlane(text) {
    const lines = text.split('\n');
    const lineHeight = 28;  // Kompakter
    const pad = 8;          // Weniger Padding
    const font = 'bold 20px system-ui, sans-serif'; // Kleinere Schrift
    
    const tmp = document.createElement('canvas');
    const ctx = tmp.getContext('2d');
    ctx.font = font;
    
    let maxWidth = 0;
    for (const line of lines) {
      maxWidth = Math.max(maxWidth, ctx.measureText(line).width);
    }
    
    const tw = Math.ceil(maxWidth) + pad * 2;
    const th = lines.length * lineHeight + pad * 2;

    const c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    const g = c.getContext('2d');
    
    // Dunklerer, kontrastreicherer Hintergrund
    g.fillStyle = 'rgba(0,0,0,0.9)';
    g.fillRect(0, 0, tw, th);
    g.strokeStyle = 'rgba(100,200,255,0.6)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, tw-2, th-2);
    
    // Text mit besserem Kontrast
    g.font = font;
    g.fillStyle = '#ffffff';  // Weißer Text für maximalen Kontrast
    g.textBaseline = 'top';
    
    for (let i = 0; i < lines.length; i++) {
      g.fillText(lines[i], pad, pad + i * lineHeight);
    }

    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false });
    const geo = new THREE.PlaneGeometry(tw/600, th/600); // Noch kleiner für Turret-Oberfläche
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.ignoreHit = true;
    return mesh;
  }

  update(camera, dt = 0.016) {
    // Score-Anzeige liegt flach auf der Turret-Oberfläche - kein LookAt nötig
    // Sie dreht sich automatisch mit dem Turret mit
  }
}

export class Killfeed3D {
  constructor(scene) {
    this.scene = scene;
    this.items = []; // {mesh, life, maxLife}
    this.offset = new THREE.Vector3(-0.6, -0.6, -1.5); // relativ zur Kamera (links unten)
  }

  _makeTextPlane(text) {
    const pad = 8;
    const font = 'bold 32px system-ui, sans-serif';
    const tmp = document.createElement('canvas');
    const ctx = tmp.getContext('2d');
    ctx.font = font;
    const tw = Math.ceil(ctx.measureText(text).width) + pad*2;
    const th = 48;

    const c = document.createElement('canvas'); c.width = tw; c.height = th;
    const g = c.getContext('2d');
    
    // Kein Hintergrund mehr - transparentes Canvas
    g.clearRect(0, 0, tw, th);
    
    // Text mit Schatten für bessere Lesbarkeit
    g.font = font;
    g.textBaseline = 'middle';
    
    // Schatten
    g.fillStyle = 'rgba(0,0,0,0.8)';
    g.fillText(text, pad + 2, th/2 + 2);
    
    // Haupttext
    g.fillStyle = '#ffffff';
    g.fillText(text, pad, th/2);

    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false });
    const geo = new THREE.PlaneGeometry(tw/180, th/180); // Etwas größer für bessere Sichtbarkeit
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
