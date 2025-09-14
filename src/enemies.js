// /src/enemies.js
import * as THREE from 'three';

export class Enemy {
  constructor(type, opts) {
    this.type = type;
    this.scene = opts.scene;
    this.target = opts.target;
    this.hitFx = opts.hitFx || null;
    this.onDeath = opts.onDeath || (()=>{});

    this.health = opts.health ?? 40;
    this.speed  = opts.speed ?? 3.0;
    this.reward = opts.reward ?? 10;
    this.radius = opts.hitRadius ?? 0.4;     // <- größere Trefferkugel
    this.ground = (opts.ground ?? true);
    this.attackRadius = opts.attackRadius ?? 3.0;

    this.group = new THREE.Group();
    this.group.position.copy(opts.spawnPos || new THREE.Vector3());

    // Scale für bessere Sichtbarkeit
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
    this.group.add(body, eye);

    // Unsichtbare Trefferkugel (nur Geometrie für einfache Hits)
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 12, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    if (this.ground) hit.position.y = this.radius;
    this.group.add(hit);

    this.dead = false; this.reached = false;

    // Markierung für Raycasts
    this.group.traverse(o => { o.userData.enemy = this; });

    this.scene.add(this.group);
  }

  takeDamage(amount = 0) {
    if (this.dead) return;
    this.health -= amount;
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
      this.onDeath({ enemy: this, reward: this.reward });
    }
  }

  update(dt) {
    if (this.dead) return;
    const goal = new THREE.Vector3(this.target.x, this.ground ? 0 : this.group.position.y, this.target.z);
    const toGoal = goal.clone().sub(this.group.position);
    const distXZ = Math.hypot(toGoal.x, toGoal.z);
    if (distXZ <= this.attackRadius) { this.reached = true; return; }
    if (this.ground) toGoal.y = 0;
    const dir = toGoal.normalize();
    this.group.position.addScaledVector(dir, this.speed * dt);
    const yaw = Math.atan2(dir.x, -dir.z);
    this.group.rotation.set(0, yaw, 0);
  }
}

export class EnemyManager {
  constructor(scene, turret, cfg, hitFx, onScore) {
    this.scene = scene; this.turret = turret; this.cfg = cfg; this.hitFx = hitFx || null; this.onScore = onScore || (()=>{});
    this.center = new THREE.Vector3();
    this.enemies = []; this.wave = 0; this.alive = 0;
    this._spawnQueue = 0; this._spawnTimer = 0; this._wavePause = 0;
    this._scheduleNextWave();
  }

  _scheduleNextWave() {
    this.wave += 1;
    const count = Math.round((this.wave === 1 ? this.cfg.firstWaveCount : this.cfg.firstWaveCount * Math.pow(this.cfg.waveGrowth, this.wave-1)));
    this._spawnQueue = count; this._spawnTimer = 0; this._wavePause = 0;
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
      scale: this.cfg.grunt.scale,          // NEU
      hitRadius: this.cfg.grunt.hitRadius   // NEU
    });

    enemy.onDeath = ({ reward }) => {
      this.alive = Math.max(0, this.alive - 1);
      this.onScore({ type: 'kill', reward, wave: this.wave, alive: this.alive });
    };

    this.enemies.push(enemy);
    this.alive += 1;
  }

  update(dt) {
    this.center.copy(this.turret.root.position);
    if (this._spawnQueue > 0) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0) { this._spawnOne(); this._spawnQueue -= 1; this._spawnTimer = this.cfg.spawnInterval; }
    } else if (this.alive === 0) {
      this._wavePause += dt;
      if (this._wavePause >= this.cfg.wavePause) this._scheduleNextWave();
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]; e.update(dt); if (e.dead) this.enemies.splice(i,1);
    }
  }
}
