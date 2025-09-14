// /src/enemies.js
import * as THREE from 'three';

export class Enemy {
  constructor(type, opts) {
    this.type = type;
    this.scene = opts.scene;
    this.target = opts.target; // THREE.Vector3 (Turret-Position)
    this.hitFx = opts.hitFx || null;
    this.onDeath = opts.onDeath || (()=>{});
    this.health = opts.health ?? 40;
    this.speed  = opts.speed ?? 3.0; // m/s
    this.reward = opts.reward ?? 10;
    this.radius = opts.radius ?? 0.4; // Kollisionsradius (ungefähr)
    this.ground = (opts.ground ?? true); // true: am Boden laufen, false: fliegend
    this.attackRadius = opts.attackRadius ?? 3.0;

    this.group = new THREE.Group();
    this.group.position.copy(opts.spawnPos || new THREE.Vector3(0,0,0));
    this.dead = false;
    this.reached = false;

    // --- Simple Mesh (Lowpoly “Skitter”) ---
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

    // Hitbar/Debug (unsichtbar, aber für Treffer unkompliziert)
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    if (this.ground) hit.position.y = 0.35;
    this.group.add(hit);

    // Markiere alle Teile als „enemy“ für Raycast-Auswertung
    this.group.traverse(o => { o.userData.enemy = this; });

    this.scene.add(this.group);
  }

  takeDamage(amount = 0) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.dead = true;
      // kleiner FX-Burst
      if (this.hitFx) {
        const p = this.group.getWorldPosition(new THREE.Vector3());
        for (let i=0;i<6;i++) {
          const n = new THREE.Vector3((Math.random()*2-1), (Math.random()*2-1), (Math.random()*2-1)).normalize();
          this.hitFx.spawnAt(p.clone().addScaledVector(n, 0.05), n);
        }
      }
      // aus der Szene entfernen
      this.scene.remove(this.group);
      this.onDeath({ enemy: this, reward: this.reward });
    }
  }

  update(dt) {
    if (this.dead) return;

    // Ziel ist die Turret-Basis in XZ (gleiche Bodenhöhe)
    const goal = new THREE.Vector3(this.target.x, this.ground ? 0 : this.group.position.y, this.target.z);

    // Stoppen, wenn im Angriffsring
    const toGoal = goal.clone().sub(this.group.position);
    const distXZ = Math.hypot(toGoal.x, toGoal.z);
    if (distXZ <= this.attackRadius) {
      this.reached = true;
      // (STEP 4: hier Turret/Spieler schädigen)
      return;
    }

    // Bewegung (einfach geradeaus)
    if (this.ground) toGoal.y = 0;
    const dir = toGoal.normalize();
    this.group.position.addScaledVector(dir, this.speed * dt);

    // Blickrichtung grob justieren
    const yaw = Math.atan2(dir.x, -dir.z);
    this.group.rotation.set(0, yaw, 0);
  }
}

export class EnemyManager {
  constructor(scene, turret, cfg, hitFx, onScore) {
    this.scene = scene;
    this.turret = turret;
    this.cfg = cfg;
    this.hitFx = hitFx || null;
    this.onScore = onScore || (()=>{});

    this.center = new THREE.Vector3(); // wird aus Turret-Position gelesen
    this.rng = Math.random;

    this.enemies = [];
    this.wave = 0;
    this.alive = 0;

    this._spawnQueue = 0;
    this._spawnTimer = 0;
    this._wavePause = 0;

    // sofort erste Welle planen
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
    // Kreis um den Turret (Spawn-Radius), leichte Variation
    const r = this.cfg.spawnRadius + (this.rng()*10 - 5);
    const a = this.rng()*Math.PI*2;
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
      attackRadius: this.cfg.attackRadius
    });

    enemy.onDeath = ({ reward }) => {
      this.alive = Math.max(0, this.alive - 1);
      this.onScore({ type: 'kill', reward, wave: this.wave, alive: this.alive });
    };

    this.enemies.push(enemy);
    this.alive += 1;
  }

  update(dt) {
    // Zentrum vom Turret lesen (am Boden)
    this.center.copy(this.turret.root.position);

    // Spawns abwickeln (einzeln mit Intervall)
    if (this._spawnQueue > 0) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0) {
        this._spawnOne();
        this._spawnQueue -= 1;
        this._spawnTimer = this.cfg.spawnInterval;
      }
    } else {
      // Welle ist ausgespawned → warten bis alle tot, dann Pause und nächste Welle
      if (this.alive === 0) {
        this._wavePause += dt;
        if (this._wavePause >= this.cfg.wavePause) {
          this._scheduleNextWave();
        }
      }
    }

    // Gegner updaten & tote entfernen
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt);
      if (e.dead) this.enemies.splice(i,1);
    }
  }
}
