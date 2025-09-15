// /src/enemies.js
import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Enemy {
  constructor(type, opts) {
    this.type = type;
    this.scene = opts.scene;
    this.target = opts.target;   // THREE.Vector3 (Turret-Zentrum, XZ)
    this.hitFx = opts.hitFx || null;
    this.onDeath = opts.onDeath || (()=>{});

    this.health = opts.health ?? 40;
    this.speed  = opts.speed ?? 3.0;
    this.reward = opts.reward ?? 10;
    this.radius = opts.hitRadius ?? 0.4; // unsichtbare Trefferkugel
    this.ground = (opts.ground ?? true);
    this.attackRadius = opts.attackRadius ?? 3.0;

    this.group = new THREE.Group();
    this.group.position.copy(opts.spawnPos || new THREE.Vector3());

    // Sichtbarkeit/Skalierung
    const s = opts.scale ?? 1.0;
    this.group.scale.setScalar(s);

    // Körper
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 0.35, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x6f2f2f, metalness: 0.1, roughness: 0.7 })
    );
    body.position.y = this.ground ? 0.28 : 0.0;

    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xff6666, emissive: 0x400000 })
    );
    eye.position.set(0, body.position.y + 0.18, 0.18);

    // Unsichtbare Trefferkugel (für Raycast/Schaden)
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 12, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    if (this.ground) hit.position.y = this.radius;

    // Head hit zone (invisible sphere), tagged as 'head'
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(this.radius*0.45, 0.12), 12, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    head.position.set(0, body.position.y + 0.36, 0.08);

    // Tag zones
    body.userData.zone = 'core';
    hit.userData.zone = 'core';
    head.userData.zone = 'head';

    this.group.add(body, eye, hit, head);

    this.dead = false;
    this.reached = false;

    // Raycast-Tag für die Waffe
    this.group.traverse(o => { o.userData.enemy = this; });

    this.scene.add(this.group);
  }

  takeDamage(amount = 0, zone = 'core') {
    if (this.dead) return;
    const mul = (CONFIG?.zones?.[zone]?.damageMul ?? 1.0);
    this.lastHitZone = zone;
    this.health -= amount * mul;
    if (this.health <= 0) {
      this.dead = true;
      if (this.hitFx) {
        const p = this.group.getWorldPosition(new THREE.Vector3());
        for (let i=0;i<6;i++) {
          const n = new THREE.Vector3((Math.random()*2-1),(Math.random()*2-1),(Math.random()*2-1)).normalize();
          this.hitFx.spawnAt(p.clone().addScaledVector(n, 0.05), n);
        }
      }
      this.scene.remove(this.group);
      this.onDeath({ enemy: this, reward: this.reward, zone: (this.lastHitZone||'core') });
    }
  }

  update(dt) {
    if (this.dead) return;

    // Zielpunkt (XZ) ist Turret-Zentrum, Y am Boden (oder gleichbleibend wenn fliegend)
    const goal = new THREE.Vector3(this.target.x, this.ground ? 0 : this.group.position.y, this.target.z);

    const toGoal = goal.clone().sub(this.group.position);
    if (this.ground) toGoal.y = 0;

    // Bewegung
    const dir = toGoal.lengthSq() > 1e-9 ? toGoal.normalize() : new THREE.Vector3();
    this.group.position.addScaledVector(dir, this.speed * dt);

    // Blickrichtung
    if (dir.lengthSq() > 0) {
      const yaw = Math.atan2(dir.x, -dir.z);
      this.group.rotation.set(0, yaw, 0);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.dead = true;
  }
}

export class EnemyManager {
  /**
   * @param {THREE.Scene} scene
   * @param {object} turret - Turret-Objekt (liest root.position)
   * @param {object} cfg - CONFIG.enemies
   * @param {HitSparks} hitFx
   * @param {function} onScore - ({type:'kill'|'wave', reward?, wave?, alive?})
   * @param {function} onBaseHit - ({pos})
   */
  constructor(scene, turret, cfg, hitFx, onScore, onBaseHit) {
    this.scene = scene;
    this.turret = turret;
    this.cfg = cfg;
    this.hitFx = hitFx || null;
    this.onScore = onScore || (()=>{});
    this.onBaseHit = onBaseHit || (()=>{});

    this.center = new THREE.Vector3(); // Turret-Zentrum (XZ)
    this.enemies = [];
    this.wave = 0;
    this.alive = 0;

    this._spawnQueue = 0;
    this._spawnTimer = 0;
    this._wavePause = 0;

    this.enabled = true;

    this._scheduleNextWave();
  }

  _scheduleNextWave() {
    this.wave += 1;
    const count = Math.round(
      (this.wave === 1 ? this.cfg.firstWaveCount : this.cfg.firstWaveCount * Math.pow(this.cfg.waveGrowth, this.wave-1))
    );
    this._spawnQueue = count;
    this._spawnTimer = 0;
    this._wavePause = 0;
    this.onScore({ type: 'wave', wave: this.wave, toSpawn: count });
  }

  _spawnOne() {
    const r = this.cfg.spawnRadius + (Math.random()*10 - 5);
    const a = Math.random()*Math.PI*2;
    const sx = this.center.x + Math.sin(a) * r;
    const sz = this.center.z + Math.cos(a) * r;
    const sy = 0;

    const enemy = new Enemy('grunt', {
      scene: this.scene,
      target: this.center,
      hitFx: this.hitFx,
      spawnPos: new THREE.Vector3(sx, sy, sz),
      ground: true,
      health: this.cfg.grunt.health,
      speed:  this.cfg.grunt.speed,
      reward: this.cfg.grunt.reward,
      attackRadius: this.cfg.attackRadius,
      scale: this.cfg.grunt.scale,
      hitRadius: this.cfg.grunt.hitRadius
    });

    enemy.onDeath = ({ reward, zone }) => {
      this.alive = Math.max(0, this.alive - 1);
      this.onScore({ type: 'kill', reward, zone, wave: this.wave, alive: this.alive });
    };

    this.enemies.push(enemy);
    this.alive += 1;
  }

  clearAll() {
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    this.alive = 0;
    this._spawnQueue = 0;
    this._spawnTimer = 0;
  }

  update(dt) {
    if (!this.enabled) return;

    // Turret-Zentrum (Boden) lesen
    this.center.copy(this.turret.root.position);

    // Spawns abwickeln
    if (this._spawnQueue > 0) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0) {
        this._spawnOne();
        this._spawnQueue -= 1;
        this._spawnTimer = this.cfg.spawnInterval;
      }
    } else {
      // Wellen-Pause, wenn alles tot
      if (this.alive === 0) {
        this._wavePause += dt;
        if (this._wavePause >= this.cfg.wavePause) this._scheduleNextWave();
      }
    }

    // Gegner updaten + „Ankunft“-Erkennung ROBUST im Manager
    const reachR = this.cfg.attackRadius;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) { this.enemies.splice(i,1); continue; }

      // Distanz im XZ zur Basis
      const gp = e.group.position;
      const dx = gp.x - this.center.x;
      const dz = gp.z - this.center.z;
      const distXZ = Math.hypot(dx, dz);

      // Treffer-Bonus: berücksichtige (halbe) Gegner-Hitkugel für „Kontakt“
      const reachWithRadius = reachR + (e.radius || 0) * 0.5;

      if (distXZ <= reachWithRadius) {
        // Basistreffer → visuelle FX + Callback + Entfernen
        const hitPos = e.group.getWorldPosition(new THREE.Vector3());

        // etwas Funken
        if (this.hitFx) {
          for (let k=0;k<10;k++) {
            const n = new THREE.Vector3((Math.random()*2-1),(Math.random()*2-1),(Math.random()*2-1)).normalize();
            this.hitFx.spawnAt(hitPos.clone().addScaledVector(n, 0.06), n);
          }
        }

        try { this.onBaseHit({ pos: hitPos }); } catch(_) {}

        e.dispose();
        this.enemies.splice(i,1);
        this.alive = Math.max(0, this.alive - 1);
        continue;
      }

      // „normal“ updaten (Laufen/Orientierung)
      e.update(dt);
      if (e.dead) this.enemies.splice(i,1);
    }
  }
}
